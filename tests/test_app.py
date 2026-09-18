import unittest
from unittest.mock import Mock, patch

from app import (
    DEPENDENCIES,
    app,
    catalog,
    install_missing_dependencies,
    llm,
    resolve_base_dir,
    resolve_bindings,
)


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

    def test_missing_dependencies_are_installed_with_current_python(self):
        missing_module = next(iter(DEPENDENCIES))
        with patch("app.importlib.util.find_spec", side_effect=lambda module: None if module == missing_module else object()):
            with patch("app.subprocess.check_call") as installer:
                install_missing_dependencies()
        command = installer.call_args.args[0]
        self.assertEqual(command[:4], [__import__("sys").executable, "-m", "pip", "install"])
        self.assertIn(DEPENDENCIES[missing_module], command)

    def test_base_directory_with_and_without_dunder_file(self):
        self.assertEqual(resolve_base_dir("/opt/app/app.py"), __import__("pathlib").Path("/opt/app"))
        self.assertEqual(
            resolve_base_dir(None, "/home/cdsw/project"),
            __import__("pathlib").Path("/home/cdsw/project").resolve(),
        )

    def test_authenticated_cml_connection_discovery(self):
        swagger = {
            "paths": {
                "/api/v2/projects/{project_id}/data-connections": {
                    "get": {
                        "operationId": "listDataConnections",
                        "parameters": [
                            {"name": "project_id", "in": "path", "required": True},
                            {"name": "page_size", "in": "query"},
                        ],
                    }
                }
            }
        }
        swagger_response = Mock()
        swagger_response.json.return_value = swagger
        swagger_response.raise_for_status.return_value = None
        list_response = Mock()
        list_response.json.return_value = {
            "data_connections": [
                {"name": "warehouse-hive", "type": "CDW Hive"},
                {"name": "analytics-impala", "connection_type": "Impala"},
            ]
        }
        list_response.raise_for_status.return_value = None
        with patch("data_connector.requests.get", side_effect=[swagger_response, list_response]) as get:
            connections = catalog.discover_connections("https://workbench.example", "secret-value", "project-123")
        self.assertEqual([item["name"] for item in connections], ["analytics-impala", "warehouse-hive"])
        self.assertEqual(connections[0]["engine"], "impala")
        self.assertEqual(get.call_args_list[1].args[0], "https://workbench.example/api/v2/projects/project-123/data-connections")
        self.assertEqual(get.call_args_list[1].kwargs["headers"]["Authorization"], "Bearer secret-value")

    def test_cloudera_model_id_is_discovered(self):
        models_response = Mock(status_code=200)
        models_response.json.return_value = {"data": [{"id": "nvidia/nemotron-3-nano"}]}
        chat_response = Mock(status_code=200)
        chat_response.json.return_value = {"choices": [{"message": {"content": "CONNECTED"}}]}
        endpoint = "https://ml.example/namespaces/serving-default/endpoints/nemotron"
        config = {"endpoint": endpoint, "model": "", "auth_type": "cdp", "token": "token"}
        with patch("llm_client.requests.get", return_value=models_response) as get:
            with patch("llm_client.requests.post", return_value=chat_response) as post:
                result = llm.complete(config, [{"role": "user", "content": "test"}])
        self.assertEqual(result, "CONNECTED")
        self.assertEqual(get.call_args.args[0], endpoint + "/v1/models")
        self.assertEqual(post.call_args.args[0], endpoint + "/v1/chat/completions")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "nvidia/nemotron-3-nano")

    def test_singular_chat_completion_url_is_corrected(self):
        endpoint = "https://ml.example/endpoints/model/v1/chat/completion"
        self.assertEqual(llm.normalize_endpoint(endpoint), endpoint + "s")


if __name__ == "__main__":
    unittest.main()
