import unittest
import sys
from types import ModuleType
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

    def test_workspace_chats_keep_separate_history_and_binding(self):
        listing = self.client.get("/api/workspace").get_json()["data"]
        self.assertEqual([item["id"] for item in listing["connections"]], ["demo"])
        first = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo"}).get_json()["data"]
        second = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo"}).get_json()["data"]
        self.assertIn("medidas: revenue, units", first["overview"])
        english = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo", "model_language": "en"}).get_json()["data"]
        self.assertIn("Preliminary analysis", english["overview"])
        for language, phrase in (("ca", "Anàlisi preliminar"), ("eu", "Aurretiazko analisia"), ("gl", "Análise preliminar")):
            localized = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo", "model_language": language}).get_json()["data"]
            self.assertIn(phrase, localized["overview"])
        response = self.client.post(f"/api/workspace/chats/{first['id']}/ask", json={"question": "Ingresos por mes"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.client.get(f"/api/workspace/chats/{first['id']}").get_json()["data"]["messages"]), 1)
        self.assertEqual(self.client.get(f"/api/workspace/chats/{second['id']}").get_json()["data"]["messages"], [])
        self.assertEqual(self.client.post("/api/workspace/chats", json={"connection_id": "missing", "model_id": "demo"}).status_code, 400)

    def test_query_error_shows_connector_cause_and_exact_attempted_sql(self):
        chat = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo"}).get_json()["data"]
        with patch.object(catalog, "query", side_effect=RuntimeError("AnalysisException: unknown column revenue_bad")):
            response = self.client.post(f"/api/workspace/chats/{chat['id']}/ask", json={"question": "Ingresos por mes"})
        self.assertEqual(response.status_code, 422)
        error = response.get_json()
        self.assertEqual(error["stage"], "execution")
        self.assertIn("AnalysisException", error["cause"])
        self.assertIn("LIMIT 500", error["sql"])
        saved = self.client.get(f"/api/workspace/chats/{chat['id']}").get_json()["data"]["messages"]
        self.assertEqual(saved[0]["kind"], "error")
        self.assertEqual(saved[0]["sql"], error["sql"])

    def test_sql_validation_error_is_distinct_from_execution(self):
        chat = self.client.post("/api/workspace/chats", json={"connection_id": "demo", "model_id": "demo"}).get_json()["data"]
        with patch("app.demo_plan", return_value={"sql": "DELETE FROM sales", "title": "Bad", "chart": "none"}):
            response = self.client.post(f"/api/workspace/chats/{chat['id']}/ask", json={"question": "Borrar ventas"})
        self.assertEqual(response.status_code, 422)
        error = response.get_json()
        self.assertEqual(error["stage"], "validation")
        self.assertIn("DELETE FROM sales", error["sql"])

    def test_connection_is_saved_only_after_discovery_and_profile(self):
        spec = {"engine": "cloudera", "name": "vast-data-demo", "username": "analyst", "workload_password": "secret"}
        with patch.object(catalog, "databases", return_value=["analytics"]), \
             patch.object(catalog, "tables", return_value=["sales"]), \
             patch.object(catalog, "profile", return_value=[{"table":"sales", "sample_rows":2, "columns":[]}]):
            tested = self.client.post("/api/workspace/connections/discover", json={"spec": spec}).get_json()["data"]
            self.assertEqual(tested["databases"], ["analytics"])
            self.assertEqual(self.client.post("/api/workspace/connections/tables", json={"ticket":tested["ticket"], "database":"analytics"}).get_json()["data"], ["sales"])
            invalid = self.client.post("/api/workspace/connections", json={"ticket":tested["ticket"], "label":"Ventas", "database":"analytics", "tables":["other"]})
            self.assertEqual(invalid.status_code, 400)
            saved = self.client.post("/api/workspace/connections", json={"ticket":tested["ticket"], "label":"Ventas", "database":"analytics", "tables":["sales"]}).get_json()["data"]
        self.assertEqual(saved["label"], "Ventas")
        self.assertNotIn("workload_password", str(saved))
        self.assertEqual(self.client.post("/api/workspace/connections", json={"ticket":tested["ticket"], "label":"Otra", "database":"analytics", "tables":["sales"]}).status_code, 400)

    def test_model_requires_successful_test_before_save(self):
        config = {"endpoint":"https://model.example/v1/chat/completions", "model":"example/model", "auth_type":"jwt", "token":"secret"}
        self.assertEqual(self.client.post("/api/workspace/models", json={"ticket":"invalid", "label":"Modelo"}).status_code, 400)
        with patch.object(llm, "resolve", return_value=(config["endpoint"], config["model"], {})), \
             patch.object(llm, "complete", return_value="CONNECTED"):
            tested = self.client.post("/api/workspace/models/test", json=config).get_json()["data"]
        saved = self.client.post("/api/workspace/models", json={"ticket":tested["ticket"], "label":"Modelo probado"}).get_json()["data"]
        self.assertEqual(saved["model"], "example/model")
        self.assertNotIn("secret", str(saved))

    def test_discovery_ticket_cannot_be_used_from_another_session(self):
        other_client = app.test_client()
        spec = {"engine": "cloudera", "name": "vast-data-demo", "username": "analyst", "workload_password": "secret"}
        with patch.object(catalog, "databases", return_value=["analytics"]):
            ticket = self.client.post("/api/workspace/connections/discover", json={"spec": spec}).get_json()["data"]["ticket"]
        response = other_client.post("/api/workspace/connections/tables", json={"ticket": ticket, "database": "analytics"})
        self.assertEqual(response.status_code, 400)

    def test_new_connection_does_not_rebind_existing_chat(self):
        def save_source(name):
            spec = {"engine": "cloudera", "name": name, "username": "analyst", "workload_password": "secret"}
            tested = self.client.post("/api/workspace/connections/discover", json={"spec": spec}).get_json()["data"]
            return self.client.post("/api/workspace/connections", json={"ticket": tested["ticket"], "label": name,
                                                                     "database": "analytics", "tables": ["sales"]}).get_json()["data"]

        with patch.object(catalog, "databases", return_value=["analytics"]), \
             patch.object(catalog, "tables", return_value=["sales"]), \
             patch.object(catalog, "profile", return_value=[{"table": "sales", "sample_rows": 2, "columns": []}]):
            first = save_source("old-source")
            second = save_source("new-source")
        config = {"endpoint": "https://model.example/v1/chat/completions", "model": "example/model", "auth_type": "jwt", "token": "secret"}
        with patch.object(llm, "resolve", return_value=(config["endpoint"], config["model"], {})), \
             patch.object(llm, "complete", return_value="CONNECTED"):
            ticket = self.client.post("/api/workspace/models/test", json=config).get_json()["data"]["ticket"]
        model = self.client.post("/api/workspace/models", json={"ticket": ticket, "label": "Test model"}).get_json()["data"]
        with patch.object(llm, "complete", return_value="Overview"):
            chat = self.client.post("/api/workspace/chats", json={"connection_id": first["id"], "model_id": model["id"]}).get_json()["data"]
        self.assertNotEqual(chat["connection_id"], second["id"])
        plan = '{"sql":"SELECT 1 AS value","title":"Result","chart":"bar"}'
        with patch.object(llm, "complete", return_value=plan), \
             patch.object(catalog, "query", return_value={"columns": ["value"], "rows": [{"value": 1}]}) as query:
            response = self.client.post(f"/api/workspace/chats/{chat['id']}/ask", json={"question": "Check binding"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(query.call_args.args[0]["name"], "old-source")

    def test_error_response_does_not_repeat_password(self):
        spec = {"engine": "cloudera", "name": "vast-data-demo", "username": "analyst", "workload_password": "secret-value"}
        with patch.object(catalog, "databases", side_effect=RuntimeError("Failed with secret-value")):
            response = self.client.post("/api/workspace/connections/discover", json={"spec": spec})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("secret-value", response.get_data(as_text=True))

    def test_editable_profile_context_reaches_the_model(self):
        spec = next(item for item in catalog.connections() if item["name"] == "talk-to-data-demo")
        profiles = catalog.profile(spec, "demo", ["sales"])
        plan = '{"sql":"SELECT category, SUM(revenue) AS revenue FROM sales GROUP BY category","title":"Ventas","summary_hint":"Resumen","chart":"bar"}'
        with patch.object(llm, "complete", return_value=plan) as complete:
            response = self.client.post("/api/ask", json={
                "connection": "talk-to-data-demo", "database": "demo", "tables": ["sales"],
                "profiles": profiles, "additional_context": "Responde con puntos y trata sale_date como DATE.",
                "modules": {"summary": True}, "model_language": "es",
                "model": {"endpoint": "https://model.example/v1/chat/completions"}, "question": "Ventas por categoría",
            })
        self.assertEqual(response.status_code, 200)
        system_prompt = complete.call_args.args[1][0]["content"]
        self.assertIn("Responde con puntos", system_prompt)
        self.assertIn("sale_date como DATE", system_prompt)

    def test_write_queries_are_blocked(self):
        spec = next(item for item in catalog.connections() if item["name"] == "talk-to-data-demo")
        with self.assertRaises(ValueError):
            catalog.query(spec, "DROP TABLE sales")

    def test_requested_sql_limit_is_capped(self):
        spec = next(item for item in catalog.connections() if item["name"] == "talk-to-data-demo")
        result = catalog.query(spec, "SELECT sale_id FROM sales LIMIT 9999", limit=5)
        self.assertEqual(len(result["rows"]), 5)
        with self.assertRaises(ValueError):
            catalog.query(spec, "SELECT * FROM sales -- LIMIT 1")

    def test_metadata_sql_is_not_given_an_invalid_limit(self):
        self.assertEqual(catalog.prepare_query_sql("SHOW DATABASES"), "SHOW DATABASES")
        self.assertEqual(catalog.prepare_query_sql("DESCRIBE analytics.sales;"), "DESCRIBE analytics.sales")
        self.assertEqual(catalog.prepare_query_sql("EXPLAIN SELECT * FROM sales"), "EXPLAIN SELECT * FROM sales")

    def test_demo_stacked_chart_returns_multiple_measures(self):
        chat = self.client.post("/api/workspace/chats", json={"connection_id":"demo", "model_id":"demo"}).get_json()["data"]
        response = self.client.post(f"/api/workspace/chats/{chat['id']}/ask", json={"question":"Muéstrame barras apiladas por mes"}).get_json()["data"]
        self.assertEqual(response["chart"], "stacked_bar")
        self.assertEqual(response["columns"], ["month", "electronics", "home", "sport"])

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

    def test_manual_cloudera_connection_discovers_databases(self):
        with patch.object(catalog, "databases", return_value=["default", "analytics"]) as databases:
            response = self.client.post("/api/databases", json={
                "connection": "direct",
                "connection_spec": {
                    "engine": "cloudera", "name": "vast-data-demo",
                    "username": "data-user", "workload_password": "secret-value",
                },
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], ["default", "analytics"])
        spec = databases.call_args.args[0]
        self.assertEqual(spec["name"], "vast-data-demo")
        self.assertEqual(spec["engine"], "cloudera")
        self.assertEqual(spec["username"], "data-user")
        self.assertEqual(spec["workload_password"], "secret-value")

    def test_cml_uses_username_and_workload_password(self):
        connection = Mock()
        connection.get_pandas_dataframe.return_value = "frame"
        data_v1 = ModuleType("cml.data_v1")
        data_v1.get_connection = Mock(return_value=connection)
        cml_package = ModuleType("cml")
        cml_package.data_v1 = data_v1
        with patch.dict(sys.modules, {"cml": cml_package, "cml.data_v1": data_v1}):
            result = catalog._cml_query({
                "name": "vast-data-demo", "username": "data-user",
                "workload_password": "workload-secret",
            }, "SHOW DATABASES")
        self.assertEqual(result, "frame")
        data_v1.get_connection.assert_called_once_with(
            "vast-data-demo", {"USERNAME": "data-user", "PASSWORD": "workload-secret"},
        )
        connection.close.assert_called_once()

    def test_impala_failure_preserves_engine_message_and_closes_connection(self):
        connection = Mock()
        connection.get_pandas_dataframe.side_effect = RuntimeError("AnalysisException: Column not found: bad_name")
        data_v1 = ModuleType("cml.data_v1")
        data_v1.get_connection = Mock(return_value=connection)
        cml_package = ModuleType("cml")
        cml_package.data_v1 = data_v1
        with patch.dict(sys.modules, {"cml": cml_package, "cml.data_v1": data_v1}):
            with self.assertRaisesRegex(RuntimeError, "Impala \\(vast-data-demo\\): AnalysisException"):
                catalog._cml_query({"name": "vast-data-demo", "username": "user", "workload_password": "secret", "dialect": "impala"}, "SELECT bad_name FROM sales LIMIT 500")
        connection.close.assert_called_once()

    def test_postgresql_parameters_and_database_discovery(self):
        spec = {
            "engine": "postgresql", "url": "jdbc:postgresql://db.example:5544?sslmode=require",
            "database": "postgres", "username": "analyst", "password": "secret",
        }
        params = catalog._postgres_parameters(spec, "warehouse")
        self.assertEqual(params["host"], "db.example")
        self.assertEqual(params["port"], 5544)
        self.assertEqual(params["dbname"], "warehouse")
        self.assertEqual(params["sslmode"], "require")
        with patch.object(catalog, "_postgres_rows", return_value={"columns": ["datname"], "rows": [("postgres",), ("warehouse",)]}):
            self.assertEqual(catalog.databases(spec), ["postgres", "warehouse"])

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
