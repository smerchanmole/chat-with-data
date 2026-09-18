import unittest

from app import app, catalog, resolve_bindings


class TalkToDataTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True, SECRET_KEY="test")
        self.client = app.test_client()

    def test_catalog_and_profile(self):
        connections = self.client.get("/api/connections").get_json()["data"]
        self.assertTrue(any(item["name"] == "talk-to-data-demo" for item in connections))
        databases = self.client.post("/api/databases", json={"connection": "talk-to-data-demo"}).get_json()["data"]
        self.assertEqual(databases, ["demo"])
        tables = self.client.post("/api/tables", json={"connection": "talk-to-data-demo", "database": "demo"}).get_json()["data"]
        self.assertEqual(tables, ["sales", "stores"])

    def test_demo_question_and_memory(self):
        spec = next(item for item in catalog.connections() if item["name"] == "talk-to-data-demo")
        profiles = catalog.profile(spec, "demo", ["sales", "stores"])
        response = self.client.post("/api/ask", json={
            "connection": "talk-to-data-demo", "database": "demo",
            "tables": ["sales", "stores"], "profiles": profiles,
            "modules": {"summary": True, "table": True, "map": True, "chart": True, "sql": True},
            "model": {}, "model_language": "es",
            "question": "¿Cómo han evolucionado los ingresos por mes?",
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()["data"]
        self.assertEqual(data["chart"], "line")
        self.assertEqual(len(data["rows"]), 8)
        self.assertIn("SELECT", data["sql"])
        history = self.client.get("/api/history").get_json()["data"]
        self.assertEqual(len(history), 1)

    def test_write_queries_are_blocked(self):
        spec = next(item for item in catalog.connections() if item["name"] == "talk-to-data-demo")
        with self.assertRaises(ValueError):
            catalog.query(spec, "DROP TABLE sales")

    def test_local_and_cml_bindings(self):
        self.assertEqual(resolve_bindings({}), [("127.0.0.1", 8091)])
        self.assertEqual(
            resolve_bindings({"CDSW_APP_PORT": "8100", "CDSW_READONLY_PORT": "8101"}),
            [("127.0.0.1", 8100)],
        )
        self.assertEqual(
            resolve_bindings({"CDSW_READONLY_PORT": "8101"}),
            [("127.0.0.1", 8101)],
        )


if __name__ == "__main__":
    unittest.main()
