from __future__ import annotations

import os
import re
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


_CML_AUTH_LOCK = threading.RLock()


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

    def discover_connections(self, base_url: str, api_key: str, project_id: str) -> list[dict[str, Any]]:
        if not base_url or not api_key:
            raise ValueError("Indica la URL del Workbench y el API Key Value.")
        base_url = base_url.strip().rstrip("/")
        if not re.match(r"^https?://", base_url, re.I):
            base_url = "https://" + base_url
        headers = {"Authorization": f"Bearer {api_key.strip()}", "Accept": "application/json"}
        try:
            swagger_response = requests.get(f"{base_url}/api/v2/swagger.json", headers=headers, timeout=30)
            swagger_response.raise_for_status()
            swagger = swagger_response.json()
        except requests.RequestException as exc:
            raise RuntimeError(f"No se pudo consultar la especificación API v2 del Workbench: {exc}") from exc
        path, operation = self._find_data_connection_operation(swagger)
        request_path, query = self._prepare_api_request(path, operation, swagger, project_id)
        prefix = swagger.get("basePath", "") if not request_path.startswith("/api/") else ""
        url = f"{base_url}{prefix}{request_path}"
        discovered = []
        page_token = None
        for _ in range(20):
            if page_token:
                token_name = "pageToken" if "pageSize" in query else "page_token"
                query[token_name] = page_token
            try:
                response = requests.get(url, headers=headers, params=query, timeout=45)
                response.raise_for_status()
                payload = response.json()
            except requests.RequestException as exc:
                raise RuntimeError(f"No se pudieron listar las conexiones del usuario: {exc}") from exc
            discovered.extend(self._connection_items(payload))
            if not isinstance(payload, dict):
                break
            page_token = payload.get("next_page_token") or payload.get("nextPageToken")
            if not page_token:
                break
        unique = {}
        for item in discovered:
            name = self._field(item, "name", "connection_name", "connectionName", "display_name", "displayName")
            if not name:
                continue
            raw_type = self._field(item, "type", "connection_type", "connectionType", "engine", "kind") or "cml"
            if isinstance(raw_type, dict):
                raw_type = self._field(raw_type, "name", "type", "display_name") or "cml"
            engine = self._normalize_engine(str(raw_type))
            unique[str(name)] = {
                "name": str(name), "label": str(name), "engine": engine,
                "cml_registered": True,
            }
        return sorted(unique.values(), key=lambda item: item["name"].lower())

    def databases(self, spec: dict[str, Any]) -> list[str]:
        if spec.get("demo") or spec.get("engine") == "sqlite":
            return ["demo"]
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
        if spec.get("jdbc_url"):
            return [row[0] for row in self._trino_rows(spec, f"SHOW TABLES FROM {database}")["rows"]]
        query = f"SHOW TABLES IN {database}"
        frame = self._cml_query(spec, query)
        return [str(row[0]) for row in frame.itertuples(index=False, name=None)]

    def profile(self, spec: dict[str, Any], database: str, tables: list[str]) -> list[dict[str, Any]]:
        profiles = []
        for table in tables[:12]:
            self._identifier(table)
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
        api_key = str(spec.get("cdsw_api_key", "")).strip()
        with _CML_AUTH_LOCK:
            data_session = getattr(getattr(cmldata, "data", None), "session", None)
            previous_auth = getattr(data_session, "auth", None) if data_session else None
            previous_env = os.environ.get("CDSW_APIV2_KEY")
            if api_key:
                if data_session is not None:
                    data_session.auth = (api_key, "")
                os.environ["CDSW_APIV2_KEY"] = api_key
            conn = None
            try:
                conn = cmldata.get_connection(spec["name"])
                return conn.get_pandas_dataframe(sql)
            finally:
                if conn is not None:
                    conn.close()
                if api_key:
                    if data_session is not None:
                        data_session.auth = previous_auth
                    if previous_env is None:
                        os.environ.pop("CDSW_APIV2_KEY", None)
                    else:
                        os.environ["CDSW_APIV2_KEY"] = previous_env

    @staticmethod
    def _find_data_connection_operation(swagger: dict[str, Any]):
        candidates = []
        for path, methods in swagger.get("paths", {}).items():
            if not isinstance(methods, dict) or "get" not in methods:
                continue
            operation = methods["get"] or {}
            text = " ".join([
                path, str(operation.get("operationId", "")), str(operation.get("summary", "")),
                " ".join(operation.get("tags", [])),
            ]).lower().replace("_", "").replace("-", "")
            if "data" not in text or "connection" not in text:
                continue
            score = 3 if "list" in text else 0
            score += 2 if "dataconnection" in path.lower().replace("-", "").replace("_", "") else 0
            candidates.append((score, path, operation))
        if not candidates:
            raise RuntimeError("La API v2 de este Workbench no publica una operación para listar Data Connections.")
        _, path, operation = max(candidates, key=lambda item: item[0])
        return path, operation

    @staticmethod
    def _prepare_api_request(path, operation, swagger, project_id):
        query = {}
        parameters = list(swagger.get("paths", {}).get(path, {}).get("parameters", [])) + list(operation.get("parameters", []))
        for parameter in parameters:
            if "$ref" in parameter:
                parameter = swagger.get("parameters", {}).get(parameter["$ref"].rsplit("/", 1)[-1], {})
            name = parameter.get("name", "")
            location = parameter.get("in")
            normalized = name.lower().replace("_", "")
            if location == "path" and "project" in normalized:
                if not project_id:
                    raise ValueError("Indica el Project ID para descubrir sus conexiones.")
                path = path.replace("{" + name + "}", project_id)
            elif location == "query" and "project" in normalized and project_id:
                query[name] = project_id
            elif location == "query" and normalized == "pagesize":
                query[name] = 100
        unresolved = re.findall(r"{([^}]+)}", path)
        if unresolved:
            raise RuntimeError("La operación de conexiones requiere parámetros no disponibles: " + ", ".join(unresolved))
        if "pageSize" not in query and "page_size" not in query:
            query["page_size"] = 100
        return path, query

    @classmethod
    def _connection_items(cls, payload):
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        for key in ("data_connections", "dataConnections", "connections", "items", "results", "records"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = cls._connection_items(value)
                if nested:
                    return nested
        if any(key in payload for key in ("name", "connection_name", "connectionName")):
            return [payload]
        return []

    @staticmethod
    def _field(item, *names):
        for name in names:
            if name in item and item[name] not in (None, ""):
                return item[name]
        return None

    @staticmethod
    def _normalize_engine(value: str) -> str:
        lowered = value.lower()
        for engine in ("impala", "hive", "trino", "spark", "postgresql", "mysql", "oracle"):
            if engine in lowered:
                return engine
        return lowered or "cml"

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
