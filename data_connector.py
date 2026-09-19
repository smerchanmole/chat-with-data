from __future__ import annotations

import os
import re
import sqlite3
from datetime import date, datetime
from decimal import Decimal
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

@dataclass
class ConnectionSpec:
    name: str
    engine: str
    label: str
    demo: bool = False


class DataCatalog:
    """Small, read-only catalog over CML data connections (plus a local demo)."""

    def __init__(self, runtime_dir: Path):
        self.runtime_dir = runtime_dir
        self.demo_path = runtime_dir / "demo.db"
        self._ensure_demo()

    def connections(self) -> list[dict[str, Any]]:
        configured = []
        raw = os.getenv("CML_DATA_CONNECTIONS", "")
        for item in filter(None, (part.strip() for part in raw.split(","))):
            name, _, engine = item.partition(":")
            entry = ConnectionSpec(name, engine or "impala", name).__dict__
            entry["cml_registered"] = True
            configured.append(entry)
        configured.append(ConnectionSpec("talk-to-data-demo", "sqlite", "Demo · Retail analytics", True).__dict__)
        return configured

    def databases(self, spec: dict[str, Any]) -> list[str]:
        if spec.get("demo") or spec.get("engine") == "sqlite":
            return ["demo"]
        if spec.get("engine") == "postgresql":
            result = self._postgres_rows(
                spec, spec.get("database", "postgres"),
                "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname",
            )
            return [str(row[0]) for row in result["rows"]]
        if spec.get("jdbc_url"):
            rows = self._trino_rows(spec, "SHOW CATALOGS")
            values = []
            for catalog in (row[0] for row in rows["rows"]):
                try:
                    schemas = self._trino_rows(spec, f"SHOW SCHEMAS FROM {self._identifier(catalog)}")
                    values.extend(f"{catalog}.{row[0]}" for row in schemas["rows"] if row[0] != "information_schema")
                except Exception:
                    continue
            return values
        frame = self._cml_query(spec, "SHOW DATABASES")
        return [str(row[0]) for row in frame.itertuples(index=False, name=None)]

    def tables(self, spec: dict[str, Any], database: str) -> list[str]:
        self._compound_identifier(database)
        if spec.get("demo") or spec.get("engine") == "sqlite":
            with sqlite3.connect(self.demo_path) as conn:
                rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
            return [row[0] for row in rows]
        if spec.get("engine") == "postgresql":
            result = self._postgres_rows(
                spec, database,
                "SELECT schemaname, tablename FROM pg_catalog.pg_tables "
                "WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename",
            )
            return [f"{row[0]}.{row[1]}" for row in result["rows"]]
        if spec.get("jdbc_url"):
            return [row[0] for row in self._trino_rows(spec, f"SHOW TABLES FROM {database}")["rows"]]
        query = f"SHOW TABLES IN {database}"
        frame = self._cml_query(spec, query)
        return [str(row[0]) for row in frame.itertuples(index=False, name=None)]

    def profile(self, spec: dict[str, Any], database: str, tables: list[str]) -> list[dict[str, Any]]:
        profiles = []
        for table in tables[:12]:
            self._compound_identifier(table)
            qualified = self._qualified(spec, database, table)
            sample = self.query(spec, f"SELECT * FROM {qualified} LIMIT 100")
            columns = []
            for name in sample["columns"]:
                values = [row.get(name) for row in sample["rows"]]
                present = [value for value in values if value is not None]
                examples = []
                for value in present:
                    rendered = str(value)
                    if rendered not in examples:
                        examples.append(rendered)
                    if len(examples) == 3:
                        break
                columns.append({
                    "name": name,
                    "type": self._guess_type(present),
                    "nulls": len(values) - len(present),
                    "unique": len({str(value) for value in present}),
                    "examples": examples,
                })
            profiles.append({"table": table, "qualified": qualified, "sample_rows": len(sample["rows"]), "columns": columns})
        return profiles

    def query(self, spec: dict[str, Any], sql: str, limit: int = 500) -> dict[str, Any]:
        self._assert_read_only(sql)
        bounded = sql.strip().rstrip(";")
        if not re.search(r"\blimit\s+\d+\s*$", bounded, re.I):
            bounded = f"{bounded} LIMIT {int(limit)}"
        if spec.get("demo") or spec.get("engine") == "sqlite":
            with sqlite3.connect(self.demo_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(bounded)
                rows = [dict(row) for row in cursor.fetchall()]
                columns = [item[0] for item in cursor.description or []]
            return {"columns": columns, "rows": rows, "truncated": len(rows) >= limit}
        if spec.get("engine") == "postgresql":
            result = self._postgres_rows(spec, spec.get("active_database") or spec["database"], bounded)
            columns = result["columns"]
            rows = [dict(zip(columns, (self._json_value(value) for value in row))) for row in result["rows"]]
            return {"columns": columns, "rows": rows, "truncated": len(rows) >= limit}
        if spec.get("jdbc_url"):
            result = self._trino_rows(spec, bounded)
            return {"columns": result["columns"], "rows": [dict(zip(result["columns"], row)) for row in result["rows"]], "truncated": len(result["rows"]) >= limit}
        frame = self._cml_query(spec, bounded)
        frame = frame.where(frame.notna(), None)
        return {"columns": list(frame.columns), "rows": frame.to_dict(orient="records"), "truncated": len(frame) >= limit}

    @staticmethod
    def _cml_query(spec: dict[str, Any], sql: str):
        try:
            import cml.data_v1 as cmldata
        except ImportError as exc:
            raise RuntimeError("cml.data_v1 no está disponible en este entorno. Ejecuta la app dentro de CML o usa el modo demo.") from exc
        credentials = {
            "USERNAME": str(spec.get("username", "")).strip(),
            "PASSWORD": str(spec.get("workload_password", "")),
        }
        if not credentials["USERNAME"] or not credentials["PASSWORD"]:
            raise ValueError("Indica el usuario y la Workload Password de Cloudera.")
        conn = None
        try:
            conn = cmldata.get_connection(spec["name"], credentials)
            return conn.get_pandas_dataframe(sql)
        finally:
            if conn is not None:
                conn.close()

    @staticmethod
    def _trino_rows(spec: dict[str, Any], sql: str) -> dict[str, Any]:
        try:
            import trino
            from trino.auth import BasicAuthentication
        except ImportError as exc:
            raise RuntimeError("Instala la dependencia 'trino' para usar una URL JDBC directa.") from exc
        raw = spec["jdbc_url"].removeprefix("jdbc:")
        parsed = urlparse(raw)
        parts = [part for part in parsed.path.split("/") if part]
        kwargs = {
            "host": parsed.hostname, "port": parsed.port or 443,
            "user": spec.get("username") or "talk-to-data",
            "http_scheme": "https" if (parsed.port or 443) == 443 else "http",
        }
        if parts:
            kwargs["catalog"] = parts[0]
        if len(parts) > 1:
            kwargs["schema"] = parts[1]
        if spec.get("password"):
            kwargs["auth"] = BasicAuthentication(kwargs["user"], spec["password"])
        conn = trino.dbapi.connect(**kwargs)
        try:
            cursor = conn.cursor()
            cursor.execute(sql)
            rows = cursor.fetchall()
            columns = [item[0] for item in cursor.description or []]
            return {"columns": columns, "rows": rows}
        finally:
            conn.close()

    @classmethod
    def _postgres_rows(cls, spec: dict[str, Any], database: str, sql: str) -> dict[str, Any]:
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError("Instala 'psycopg[binary]' para usar PostgreSQL.") from exc
        kwargs = cls._postgres_parameters(spec, database)
        try:
            conn = psycopg.connect(**kwargs)
            try:
                with conn.cursor() as cursor:
                    cursor.execute(sql)
                    rows = cursor.fetchall()
                    columns = [item.name for item in cursor.description or []]
                return {"columns": columns, "rows": rows}
            finally:
                conn.close()
        except Exception as exc:
            raise RuntimeError(f"No se pudo consultar PostgreSQL: {exc}") from exc

    @staticmethod
    def _postgres_parameters(spec: dict[str, Any], database: str) -> dict[str, Any]:
        raw = str(spec.get("url", "")).strip()
        if raw.lower().startswith("jdbc:"):
            raw = raw[5:]
        parsed = urlparse(raw)
        if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
            raise ValueError("La URL de PostgreSQL debe incluir protocolo y servidor.")
        params = {
            "host": parsed.hostname, "port": parsed.port or 5432, "dbname": database,
            "user": spec.get("username") or (parsed.username or ""),
            "password": spec.get("password") or (parsed.password or ""), "connect_timeout": 15,
        }
        query = parse_qs(parsed.query)
        if query.get("sslmode"):
            params["sslmode"] = query["sslmode"][0]
        return params

    @staticmethod
    def _json_value(value: Any) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return value

    @staticmethod
    def _identifier(value: str) -> str:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value or ""):
            raise ValueError(f"Identificador no válido: {value!r}")
        return value

    @classmethod
    def _compound_identifier(cls, value: str) -> str:
        return ".".join(cls._identifier(part) for part in value.split("."))

    def _qualified(self, spec: dict[str, Any], database: str, table: str) -> str:
        if spec.get("demo") or spec.get("engine") == "sqlite":
            return table
        if spec.get("engine") == "postgresql":
            return self._compound_identifier(table)
        self._compound_identifier(database)
        return f"{database}.{table}"

    @staticmethod
    def _assert_read_only(sql: str) -> None:
        normalized = re.sub(r"/\*.*?\*/|--[^\n]*", " ", sql, flags=re.S).strip()
        if not re.match(r"^(select|with|show|describe|desc|explain)\b", normalized, re.I):
            raise ValueError("Solo se permiten consultas de lectura.")
        blocked = r"\b(insert|update|delete|drop|alter|truncate|create|merge|grant|revoke|call|execute)\b"
        if re.search(blocked, normalized, re.I) or ";" in normalized.rstrip(";"):
            raise ValueError("La consulta contiene una operación no permitida.")

    @staticmethod
    def _guess_type(values: list[Any]) -> str:
        if not values:
            return "unknown"
        value = values[0]
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, int):
            return "integer"
        if isinstance(value, float):
            return "number"
        text = str(value)
        if re.match(r"^\d{4}-\d{2}-\d{2}", text):
            return "date"
        return "text"

    def _ensure_demo(self) -> None:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.demo_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS stores (
                    store_id INTEGER PRIMARY KEY, store_name TEXT, city TEXT,
                    country TEXT, latitude REAL, longitude REAL
                );
                CREATE TABLE IF NOT EXISTS sales (
                    sale_id INTEGER PRIMARY KEY, sale_date TEXT, store_id INTEGER,
                    category TEXT, revenue REAL, units INTEGER,
                    FOREIGN KEY(store_id) REFERENCES stores(store_id)
                );
            """)
            if conn.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 0:
                conn.executemany("INSERT INTO stores VALUES (?,?,?,?,?,?)", [
                    (1, "Gran Vía", "Madrid", "España", 40.4200, -3.7058),
                    (2, "Eixample", "Barcelona", "España", 41.3917, 2.1649),
                    (3, "Duomo", "Milán", "Italia", 45.4642, 9.1900),
                    (4, "Mitte", "Berlín", "Alemania", 52.5200, 13.4050),
                    (5, "Opéra", "París", "Francia", 48.8706, 2.3322),
                ])
                categories = ["Electrónica", "Hogar", "Deporte"]
                rows = []
                sale_id = 1
                for month in range(1, 9):
                    for store_id in range(1, 6):
                        for idx, category in enumerate(categories):
                            revenue = 4800 + month * 620 + store_id * 410 + idx * 780
                            rows.append((sale_id, f"2026-{month:02d}-15", store_id, category, revenue, int(revenue / (80 + idx * 25))))
                            sale_id += 1
                conn.executemany("INSERT INTO sales VALUES (?,?,?,?,?,?)", rows)
