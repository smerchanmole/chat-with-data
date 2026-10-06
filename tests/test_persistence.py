import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from workspace_store import WorkspaceStore, load_or_create_key, redact_secrets


PROFILE = {"table": "sales", "sample_rows": 1, "columns": [
    {"name": "revenue", "type": "number", "nulls": 0, "examples": [], "unique": 1},
]}


class FakeCatalog:
    def connections(self):
        return [{"name": "demo", "label": "Demo", "engine": "sqlite", "demo": True}]

    def databases(self, spec):
        return ["warehouse"]

    def tables(self, spec, database):
        return ["sales"]

    def profile(self, spec, database, tables):
        return [PROFILE]


class FakeLLM:
    def resolve(self, config):
        return config["endpoint"], config["model"], "cdp"

    def complete(self, config, messages):
        return "CONNECTED" if "CONNECT" in messages[0]["content"] else "Datos de ventas analizados."


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name)
        self.catalog = FakeCatalog()
        self.llm = FakeLLM()
        self.store = WorkspaceStore(self.catalog, self.llm, self.runtime)

    def test_restart_restores_exact_binding_history_and_instructions(self):
        spec = {"engine": "postgresql", "url": "postgresql://localhost", "username": "alice", "password": "VERY_PRIVATE_PASSWORD"}
        ticket = self.store.discover_connection("browser-a", spec)["ticket"]
        connection = self.store.save_connection("browser-a", ticket, "Ventas", "warehouse", ["sales"])
        config = {"endpoint": "https://model.test/v1/chat/completions", "model": "model-1", "token": "VERY_PRIVATE_TOKEN"}
        model_ticket = self.store.test_model("browser-a", config)["ticket"]
        model = self.store.save_model("browser-a", model_ticket, "Modelo ventas")
        chat = self.store.create_chat("browser-a", connection["id"], model["id"])
        self.store.set_instructions("browser-a", chat["id"], "Usa puntos y fechas DATE")
        for number in range(35):
            self.store.add_message("browser-a", chat["id"], {"question": f"Pregunta {number}", "summary": "Resumen", "sql": "SELECT revenue FROM sales", "columns": ["revenue"], "rows": [[number]]})

        restarted = WorkspaceStore(self.catalog, self.llm, self.runtime)
        listing = restarted.listing("browser-a")
        self.assertEqual([item["id"] for item in listing["connections"]], ["demo", connection["id"]])
        self.assertEqual([item["id"] for item in listing["models"]], ["demo", model["id"]])
        self.assertEqual(listing["chats"][0]["connection_id"], connection["id"])
        self.assertEqual(listing["chats"][0]["model_id"], model["id"])
        self.assertEqual(listing["chats"][0]["instructions"], "Usa puntos y fechas DATE")
        history = restarted.chat("browser-a", chat["id"])
        self.assertEqual(len(history["messages"]), 35)
        self.assertEqual(history["messages"][34]["rows"], [[34]])
        _, recovered_connection, recovered_model = restarted.binding("browser-a", chat["id"])
        self.assertEqual(recovered_connection["spec"]["password"], "VERY_PRIVATE_PASSWORD")
        self.assertEqual(recovered_model["config"]["token"], "VERY_PRIVATE_TOKEN")

        raw = (self.runtime / "workspace.db").read_bytes()
        self.assertNotIn(b"VERY_PRIVATE_PASSWORD", raw)
        self.assertNotIn(b"VERY_PRIVATE_TOKEN", raw)
        self.assertNotIn(b"SELECT revenue FROM sales", raw)
        self.assertNotIn(b"Usa puntos y fechas DATE", raw)
        self.assertEqual(restarted.listing("browser-b")["chats"], [])

    def test_deleted_binding_leaves_readable_history_after_restart(self):
        chat = self.store.create_chat("browser-a", "demo", "demo")
        self.store.add_message("browser-a", chat["id"], {"question": "Datos", "summary": "Uno", "sql": "SELECT 1", "rows": [[1]]})
        restarted = WorkspaceStore(self.catalog, self.llm, self.runtime)
        self.assertEqual(restarted.chat("browser-a", chat["id"])["messages"][0]["sql"], "SELECT 1")
        restarted.delete("browser-a", "chats", chat["id"])
        self.assertEqual(WorkspaceStore(self.catalog, self.llm, self.runtime).listing("browser-a")["chats"], [])

    def test_keys_are_stable_and_private(self):
        path = self.runtime / "session.key"
        self.assertEqual(load_or_create_key(path, lambda: "first"), "first")
        self.assertEqual(load_or_create_key(path, lambda: "second"), "first")
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(self.runtime / "workspace.key").st_mode & 0o777, 0o600)

    def test_redaction_preserves_identifiers_with_short_credentials(self):
        source = 'Decimal JSON serializable impala SELECT provincia, precio_gasoleo_a LIMIT 10 c01adc1c2676a42a2b4aa70c2db11da74'
        self.assertEqual(redact_secrets(source, ["a", "1"]), source)
        self.assertEqual(redact_secrets('token="a" value="1" secret=very-private-token', ["a", "1", "very-private-token"]),
                         'token="[oculto]" value="[oculto]" secret=[oculto]')
        self.store.listing("browser-a")
        self.store.sessions["browser-a"]["models"]["test"] = {"config": {"api_key_id": "a", "api_key_value": "1"}}
        self.assertEqual(self.store.redact_error("browser-a", source), source)

    def test_plaintext_history_is_migrated_without_losing_messages(self):
        chat = self.store.create_chat("browser-a", "demo", "demo")
        import json
        old_message = {"question": "Consulta antigua", "summary": "Dato", "sql": "SELECT 42", "rows": [[42]]}
        with sqlite3.connect(self.runtime / "workspace.db") as db:
            db.execute("UPDATE chats SET payload=? WHERE chat_id=?", (json.dumps({key: value for key, value in self.store.chat("browser-a", chat["id"]).items() if key != "messages"}), chat["id"]))
            db.execute("INSERT INTO messages VALUES (?, ?, ?, ?)", ("browser-a", chat["id"], 0, json.dumps(old_message)))
        restored = WorkspaceStore(self.catalog, self.llm, self.runtime)
        self.assertEqual(restored.chat("browser-a", chat["id"])["messages"][0]["sql"], "SELECT 42")
        raw = (self.runtime / "workspace.db").read_bytes()
        self.assertNotIn(b"SELECT 42", raw)
        self.assertNotIn(b"Consulta antigua", raw)


if __name__ == "__main__":
    unittest.main()
