"""Session-isolated, durable resources and conversation history."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


def load_or_create_key(path: Path, factory) -> str:
    """Create a private, stable key without replacing an existing key on restart."""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "w", encoding="ascii") as handle:
            handle.write(factory())
    os.chmod(path, 0o600)
    for _ in range(20):
        value = path.read_text(encoding="ascii").strip()
        if value:
            return value
        time.sleep(0.05)  # Another worker may still be writing a newly created key.
    raise RuntimeError(f"La clave local {path.name} está vacía; restáurala desde una copia de seguridad.")


class WorkspaceStore:
    def __init__(self, catalog, llm, runtime_dir: Path | None = None):
        self.catalog = catalog
        self.llm = llm
        self.lock = threading.RLock()
        self.sessions: dict[str, dict[str, Any]] = {}
        self.db_path = None
        self.cipher = None
        if runtime_dir is not None:
            runtime_dir = Path(runtime_dir)
            runtime_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = runtime_dir / "workspace.db"
            self.cipher = Fernet(load_or_create_key(runtime_dir / "workspace.key", lambda: Fernet.generate_key().decode()).encode())
            descriptor = os.open(self.db_path, os.O_WRONLY | os.O_CREAT, 0o600)
            os.close(descriptor)
            os.chmod(self.db_path, 0o600)
            with self._db() as db:
                db.execute("CREATE TABLE IF NOT EXISTS resources (session_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL, payload BLOB NOT NULL, PRIMARY KEY (session_id, kind, item_id))")
                db.execute("CREATE TABLE IF NOT EXISTS chats (session_id TEXT NOT NULL, chat_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (session_id, chat_id))")
                db.execute("CREATE TABLE IF NOT EXISTS messages (session_id TEXT NOT NULL, chat_id TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (session_id, chat_id, position))")

    def _db(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.execute("PRAGMA secure_delete=ON")
        return db

    def _save_resource(self, session_id: str, kind: str, item: dict) -> None:
        if self.db_path is None:
            return
        payload = self.cipher.encrypt(json.dumps(item, ensure_ascii=False).encode())
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO resources VALUES (?, ?, ?, ?)", (session_id, kind, item["id"], payload))

    def _decode_payload(self, payload: bytes | str) -> dict:
        if isinstance(payload, str) or payload.startswith(b"{"):
            # Upgrade plaintext records written by the first local persistence build.
            return json.loads(payload)
        return json.loads(self.cipher.decrypt(payload))

    def _save_chat(self, session_id: str, item: dict) -> None:
        if self.db_path is None:
            return
        payload = {key: value for key, value in item.items() if key != "messages"}
        encrypted = self.cipher.encrypt(json.dumps(payload, ensure_ascii=False).encode())
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO chats VALUES (?, ?, ?)", (session_id, item["id"], encrypted))

    def _restore(self, session_id: str, space: dict) -> None:
        if self.db_path is None:
            return
        migrated = False
        with self._db() as db:
            for kind, item_id, payload in db.execute("SELECT kind, item_id, payload FROM resources WHERE session_id=? ORDER BY rowid", (session_id,)):
                if kind not in {"connections", "models"}:
                    continue
                try:
                    item = self._decode_payload(payload)
                except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
                    continue
                space[kind][item_id] = item
            for chat_id, payload in db.execute("SELECT chat_id, payload FROM chats WHERE session_id=? ORDER BY rowid", (session_id,)):
                try:
                    item = self._decode_payload(payload)
                except (InvalidToken, ValueError, TypeError):
                    continue
                if isinstance(payload, str) or payload.startswith(b"{"):
                    db.execute("UPDATE chats SET payload=? WHERE session_id=? AND chat_id=?", (self.cipher.encrypt(json.dumps(item, ensure_ascii=False).encode()), session_id, chat_id))
                    migrated = True
                item["messages"] = []
                for position, message_payload in db.execute("SELECT position, payload FROM messages WHERE session_id=? AND chat_id=? ORDER BY position", (session_id, chat_id)):
                    try:
                        message = self._decode_payload(message_payload)
                        item["messages"].append(message)
                        if isinstance(message_payload, str) or message_payload.startswith(b"{"):
                            db.execute("UPDATE messages SET payload=? WHERE session_id=? AND chat_id=? AND position=?", (self.cipher.encrypt(json.dumps(message, ensure_ascii=False).encode()), session_id, chat_id, position))
                            migrated = True
                    except (InvalidToken, ValueError, TypeError):
                        continue
                space["chats"][chat_id] = item
        if migrated:
            with self._db() as db:
                db.execute("VACUUM")

    def _space(self, session_id: str) -> dict[str, Any]:
        with self.lock:
            now = time.time()
            for old_id, old_space in list(self.sessions.items()):
                if now - old_space.get("last_used", now) > 12 * 3600:
                    self.sessions.pop(old_id, None)
            if session_id not in self.sessions:
                demo = next(item for item in self.catalog.connections() if item.get("demo"))
                profiles = self.catalog.profile(demo, "demo", ["sales", "stores"])
                self.sessions[session_id] = {
                    "connections": {"demo": {"id": "demo", "label": demo["label"], "spec": demo,
                                           "database": "demo", "tables": ["sales", "stores"], "profiles": profiles}},
                    "models": {"demo": {"id": "demo", "label": "Modelo de demostración", "config": {}, "built_in": True}},
                    "chats": {}, "connection_tests": {}, "model_tests": {}, "last_used": now,
                }
                self._restore(session_id, self.sessions[session_id])
            self.sessions[session_id]["last_used"] = now
            return self.sessions[session_id]

    @staticmethod
    def _id() -> str:
        return uuid.uuid4().hex[:12]

    @staticmethod
    def _connection_view(item: dict) -> dict:
        return {key: item[key] for key in ("id", "label", "database", "tables", "profiles")}

    @staticmethod
    def _model_view(item: dict) -> dict:
        config = item["config"]
        return {"id": item["id"], "label": item["label"], "model": config.get("model", "demo"),
                "endpoint": config.get("endpoint", ""), "built_in": item.get("built_in", False)}

    @staticmethod
    def _chat_view(item: dict) -> dict:
        return {key: item.get(key) for key in ("id", "title", "connection_id", "model_id", "created_at", "overview", "warning", "connection_snapshot", "model_snapshot", "instructions")}

    def listing(self, session_id: str) -> dict:
        space = self._space(session_id)
        with self.lock:
            return {
                "connections": [self._connection_view(item) for item in space["connections"].values()],
                "models": [self._model_view(item) for item in space["models"].values()],
                "chats": [self._chat_view(item) for item in reversed(list(space["chats"].values()))],
            }

    def discover_connection(self, session_id: str, spec: dict) -> dict:
        databases = self.catalog.databases(spec)
        if not databases:
            raise ValueError("La conexión respondió, pero no devolvió bases de datos accesibles.")
        ticket = self._id()
        space = self._space(session_id)
        with self.lock:
            self._prune(space["connection_tests"])
            space["connection_tests"][ticket] = {"spec": spec, "databases": databases, "at": time.time()}
        return {"ticket": ticket, "databases": databases}

    def discover_tables(self, session_id: str, ticket: str, database: str) -> list[str]:
        test = self._tested(self._space(session_id)["connection_tests"], ticket)
        if database not in test["databases"]:
            raise ValueError("Elige una base de datos descubierta con esta conexión.")
        return self.catalog.tables(test["spec"], database)

    def save_connection(self, session_id: str, ticket: str, label: str, database: str, tables: list[str]) -> dict:
        space = self._space(session_id)
        test = self._tested(space["connection_tests"], ticket)
        if database not in test["databases"]:
            raise ValueError("La base de datos ya no coincide con la conexión comprobada.")
        if not label.strip() or len(label.strip()) > 80:
            raise ValueError("Indica un nombre de conexión de 1 a 80 caracteres.")
        available = self.catalog.tables(test["spec"], database)
        if not isinstance(tables, list) or not 1 <= len(tables) <= 12 or len(set(tables)) != len(tables) or not set(tables) <= set(available):
            raise ValueError("Selecciona entre 1 y 12 tablas de la base de datos elegida.")
        spec = dict(test["spec"])
        if spec["engine"] == "postgresql":
            spec["active_database"] = database
        profiles = self.catalog.profile(spec, database, tables)
        item = {"id": self._id(), "label": label.strip(), "spec": spec, "database": database,
                "tables": tables, "profiles": profiles}
        with self.lock:
            self._tested(space["connection_tests"], ticket)
            self._save_resource(session_id, "connections", item)
            space["connections"][item["id"]] = item
            space["connection_tests"].pop(ticket, None)
        return self._connection_view(item)

    def test_model(self, session_id: str, config: dict) -> dict:
        started = time.perf_counter()
        endpoint, model, _ = self.llm.resolve(config)
        effective = {**config, "endpoint": endpoint, "model": model}
        answer = self.llm.complete(effective, [{"role": "user", "content": "Reply only with: CONNECTED"}])
        ticket = self._id()
        space = self._space(session_id)
        with self.lock:
            self._prune(space["model_tests"])
            space["model_tests"][ticket] = {"config": effective, "at": time.time()}
        return {"ticket": ticket, "endpoint": endpoint, "model": model,
                "message": answer.strip(), "latency_ms": round((time.perf_counter() - started) * 1000)}

    def save_model(self, session_id: str, ticket: str, label: str) -> dict:
        space = self._space(session_id)
        test = self._tested(space["model_tests"], ticket)
        if not label.strip() or len(label.strip()) > 80:
            raise ValueError("Indica un nombre de modelo de 1 a 80 caracteres.")
        item = {"id": self._id(), "label": label.strip(), "config": dict(test["config"])}
        with self.lock:
            self._tested(space["model_tests"], ticket)
            self._save_resource(session_id, "models", item)
            space["models"][item["id"]] = item
            space["model_tests"].pop(ticket, None)
        return self._model_view(item)

    @staticmethod
    def _prune(tests: dict) -> None:
        for ticket, item in list(tests.items()):
            if time.time() - item["at"] > 900:
                tests.pop(ticket, None)

    @staticmethod
    def _tested(tests: dict, ticket: str) -> dict:
        item = tests.get(ticket)
        if not item or time.time() - item["at"] > 900:
            raise ValueError("La prueba ha caducado. Comprueba de nuevo antes de guardar.")
        return item

    @staticmethod
    def _overview(connection: dict, language: str = "es") -> str:
        words = {
            "es": ("Análisis preliminar de", "filas muestreadas", "columnas", "medidas", "fechas", "categorías", "nulos en la muestra", "ejemplos", "Puedes preguntar por tendencias, comparaciones y relaciones entre estas tablas."),
            "en": ("Preliminary analysis of", "sampled rows", "columns", "measures", "dates", "categories", "nulls in the sample", "examples", "You can ask about trends, comparisons and relationships between these tables."),
            "it": ("Analisi preliminare di", "righe campionate", "colonne", "misure", "date", "categorie", "nulli nel campione", "esempi", "Puoi chiedere tendenze, confronti e relazioni tra queste tabelle."),
            "de": ("Vorabanalyse von", "Stichprobenzeilen", "Spalten", "Kennzahlen", "Datumsfelder", "Kategorien", "Nullwerte in der Stichprobe", "Beispiele", "Du kannst nach Trends, Vergleichen und Beziehungen zwischen diesen Tabellen fragen."),
            "fr": ("Analyse préliminaire de", "lignes échantillonnées", "colonnes", "mesures", "dates", "catégories", "valeurs nulles dans l’échantillon", "exemples", "Vous pouvez poser des questions sur les tendances, comparaisons et relations entre ces tables."),
        }.get(language, ("Análisis preliminar de", "filas muestreadas", "columnas", "medidas", "fechas", "categorías", "nulos en la muestra", "ejemplos", "Puedes preguntar por tendencias, comparaciones y relaciones entre estas tablas."))
        parts = []
        for profile in connection["profiles"]:
            columns = profile["columns"]
            measures = [column["name"] for column in columns if column["type"] in {"integer", "number"} and not column["name"].lower().endswith("_id") and column["name"].lower() not in {"lat", "latitude", "latitud", "lon", "lng", "longitude", "longitud"}]
            dates = [column["name"] for column in columns if column["type"] == "date"]
            categories = [column["name"] for column in columns if column["type"] == "text"]
            missing = [column["name"] for column in columns if column["nulls"]]
            examples = [f"{column['name']}: {', '.join(column['examples'][:2])}" for column in columns if column.get("examples") and column["type"] == "text"][:2]
            facts = [f"{profile['table']} ({profile['sample_rows']} {words[1]}, {len(columns)} {words[2]})"]
            if measures:
                facts.append(words[3] + ": " + ", ".join(measures))
            if dates:
                facts.append(words[4] + ": " + ", ".join(dates))
            if categories:
                facts.append(words[5] + ": " + ", ".join(categories))
            if missing:
                facts.append(words[6] + ": " + ", ".join(missing))
            if examples:
                facts.append(words[7] + ": " + "; ".join(examples))
            parts.append("; ".join(facts))
        return f"{words[0]} {connection['label']} / {connection['database']}. " + ". ".join(parts) + ". " + words[8]

    def create_chat(self, session_id: str, connection_id: str, model_id: str, language: str = "es") -> dict:
        space = self._space(session_id)
        connection = space["connections"].get(connection_id)
        model = space["models"].get(model_id)
        if not connection or not model:
            raise ValueError("Selecciona una conexión y un modelo guardados.")
        if model.get("built_in") and connection_id != "demo":
            raise ValueError("El modelo de demostración solo funciona con la conexión demo.")
        overview = self._overview(connection, language)
        warning = ""
        if not model.get("built_in"):
            prompt = (f"Summarize the following schema and examples in 4 concise points. Write in language {language}. "
                      "Identifica medidas, dimensiones, fechas y posibles preguntas. "
                      "No inventes estadísticas ni ejecutes SQL.\n" + json.dumps(connection["profiles"], ensure_ascii=False)[:14000])
            try:
                overview = self.llm.complete(model["config"], [{"role": "user", "content": prompt}]).strip() or overview
            except Exception as exc:
                detail = str(exc)
                for field in ("token", "api_key_value"):
                    secret = model["config"].get(field)
                    if secret:
                        detail = detail.replace(secret, "[oculto]")
                warning = f"El modelo no respondió al análisis preliminar: {detail[:300]}"
        item = {"id": self._id(), "title": f"{connection['label']} · Nuevo chat", "connection_id": connection_id,
                "model_id": model_id, "created_at": int(time.time()), "overview": overview,
                "warning": warning, "messages": [], "instructions": "",
                "connection_snapshot": self._connection_view(connection),
                "model_snapshot": {key: value for key, value in self._model_view(model).items() if key != "endpoint"}}
        with self.lock:
            if connection_id not in space["connections"] or model_id not in space["models"]:
                raise ValueError("La conexión o el modelo se eliminaron mientras se creaba el chat.")
            self._save_chat(session_id, item)
            space["chats"][item["id"]] = item
        return self._chat_view(item)

    def chat(self, session_id: str, chat_id: str) -> dict:
        item = self._space(session_id)["chats"].get(chat_id)
        if not item:
            raise ValueError("No se encontró este chat.")
        return {**self._chat_view(item), "messages": list(item["messages"])}

    def binding(self, session_id: str, chat_id: str) -> tuple[dict, dict, dict]:
        space = self._space(session_id)
        chat = space["chats"].get(chat_id)
        if not chat:
            raise ValueError("No se encontró este chat.")
        connection = space["connections"].get(chat["connection_id"])
        model = space["models"].get(chat["model_id"])
        if not connection or not model:
            raise ValueError("Este chat conserva su historial, pero su conexión o modelo se eliminó. Crea un chat nuevo.")
        return chat, connection, model

    def add_message(self, session_id: str, chat_id: str, response: dict) -> None:
        chat = self._space(session_id)["chats"].get(chat_id)
        if not chat:
            return
        with self.lock:
            first = not chat["messages"]
            if self.db_path is not None:
                updated = {**chat, "title": response["question"][:70] if first else chat["title"]}
                with self._db() as db:
                    position = db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM messages WHERE session_id=? AND chat_id=?", (session_id, chat_id)).fetchone()[0]
                    db.execute("INSERT INTO messages VALUES (?, ?, ?, ?)", (session_id, chat_id, position, self.cipher.encrypt(json.dumps(response, ensure_ascii=False).encode())))
                    db.execute("UPDATE chats SET payload=? WHERE session_id=? AND chat_id=?", (self.cipher.encrypt(json.dumps({k: v for k, v in updated.items() if k != "messages"}, ensure_ascii=False).encode()), session_id, chat_id))
            chat["messages"].append(response)
            if first:
                chat["title"] = response["question"][:70]

    def set_instructions(self, session_id: str, chat_id: str, instructions: str) -> dict:
        if not isinstance(instructions, str) or len(instructions) > 12000:
            raise ValueError("Las instrucciones deben tener como máximo 12000 caracteres.")
        space = self._space(session_id)
        with self.lock:
            chat = space["chats"].get(chat_id)
            if not chat:
                raise ValueError("No se encontró este chat.")
            updated = {**chat, "instructions": instructions}
            self._save_chat(session_id, updated)
            chat["instructions"] = instructions
            return self._chat_view(chat)

    def redact_error(self, session_id: str, message: str) -> str:
        space = self._space(session_id)
        with self.lock:
            for item in space["connections"].values():
                spec = item.get("spec", {})
                for key in ("password", "workload_password"):
                    secret = spec.get(key)
                    if isinstance(secret, str) and len(secret) > 2:
                        message = message.replace(secret, "[oculto]")
            for item in space["models"].values():
                config = item.get("config", {})
                for key in ("token", "api_key_value"):
                    secret = config.get(key)
                    if isinstance(secret, str) and len(secret) > 2:
                        message = message.replace(secret, "[oculto]")
        return message

    def delete(self, session_id: str, kind: str, item_id: str) -> None:
        space = self._space(session_id)
        if kind not in {"chats", "connections", "models"}:
            raise ValueError("Tipo de elemento no válido.")
        if item_id == "demo":
            raise ValueError("Los elementos de demostración no se pueden eliminar.")
        with self.lock:
            if item_id not in space[kind]:
                raise ValueError("No se encontró el elemento.")
            if self.db_path is not None:
                with self._db() as db:
                    if kind == "chats":
                        db.execute("DELETE FROM messages WHERE session_id=? AND chat_id=?", (session_id, item_id))
                        db.execute("DELETE FROM chats WHERE session_id=? AND chat_id=?", (session_id, item_id))
                    else:
                        db.execute("DELETE FROM resources WHERE session_id=? AND kind=? AND item_id=?", (session_id, kind, item_id))
            space[kind].pop(item_id)
