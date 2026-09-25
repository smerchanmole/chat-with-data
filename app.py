from __future__ import annotations

import importlib.util
import subprocess
import sys


# Cloudera AI Workbench applications are launched from this Python file. Install
# the portable dependencies before importing any of them, so no shell launcher
# or separate requirements file is needed. CML provides cml.data_v1 itself.
DEPENDENCIES = {
    "flask": "Flask>=3.0,<4",
    "requests": "requests>=2.31,<3",
    "pandas": "pandas>=2.0,<3",
    "psycopg": "psycopg[binary]>=3.1,<4",
    "trino": "trino>=0.333,<1",
    "cryptography": "cryptography>=42,<47",
}


def install_missing_dependencies():
    missing = [package for module, package in DEPENDENCIES.items() if importlib.util.find_spec(module) is None]
    if not missing:
        return
    print("Instalando dependencias de Talk to Data: " + ", ".join(missing), flush=True)
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", *missing]
    )


install_missing_dependencies()

import json
import os
import re
import secrets
import time
import uuid
from datetime import timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.serving import make_server

from data_connector import DataCatalog
from llm_client import LLMClient
from workspace_store import WorkspaceStore, load_or_create_key


def resolve_base_dir(file_name=None, working_directory=None):
    """Support normal Python files and CML's notebook-style app runner."""
    if file_name:
        return Path(file_name).resolve().parent
    return Path(working_directory or Path.cwd()).resolve()


BASE_DIR = resolve_base_dir(globals().get("__file__"))
RUNTIME_DIR = BASE_DIR / "runtime"
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY") or load_or_create_key(RUNTIME_DIR / "session.key", lambda: secrets.token_hex(32))
app.config.update(JSON_SORT_KEYS=False, MAX_CONTENT_LENGTH=1_000_000,
                  PERMANENT_SESSION_LIFETIME=timedelta(days=365), SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_HTTPONLY=True)
catalog = DataCatalog(RUNTIME_DIR)
llm = LLMClient()
workspaces = WorkspaceStore(catalog, llm, RUNTIME_DIR)
memory: dict[str, list[dict]] = {}


def ok(data=None, **extra):
    return jsonify({"ok": True, "data": data, **extra})


def selected_connection(payload):
    direct = payload.get("connection_spec") or {}
    engine = str(direct.get("engine", "")).lower()
    if engine == "postgresql":
        url = str(direct.get("url", "")).strip()
        database = str(direct.get("database", "")).strip()
        if not re.match(r"^(?:jdbc:)?postgres(?:ql)?://", url, re.I):
            raise ValueError("La URL de PostgreSQL debe comenzar por postgresql:// o jdbc:postgresql://.")
        if not database:
            raise ValueError("Indica la base de datos inicial de PostgreSQL.")
        return {
            "name": "direct-postgresql", "label": "PostgreSQL", "engine": "postgresql",
            "url": url, "database": database, "active_database": str(payload.get("database") or database),
            "username": str(direct.get("username", "")), "password": str(direct.get("password", "")),
        }
    if engine == "trino" and str(direct.get("jdbc_url", "")).startswith("jdbc:trino://"):
        return {"name": "direct-trino", "label": "Trino JDBC", "engine": "trino", **direct}
    if engine in {"cloudera", "cml"} or direct.get("cml_registered"):
        name = str(direct.get("name", ""))
        if not re.fullmatch(r"[A-Za-z0-9_. -]{1,200}", name):
            raise ValueError("Indica un nombre válido de conexión registrada en Cloudera.")
        username = str(direct.get("username", "")).strip()
        workload_password = str(direct.get("workload_password", ""))
        if not username or not workload_password:
            raise ValueError("Indica el usuario y la Workload Password de Cloudera.")
        return {
            "name": name,
            "label": str(direct.get("label") or name), "engine": "cloudera",
            "cml_registered": True,
            "dialect": "hive" if direct.get("dialect") == "hive" else "impala",
            "username": username, "workload_password": workload_password,
        }
    name = payload.get("connection")
    for item in catalog.connections():
        if item["name"] == name:
            return item
    raise ValueError("Selecciona una conexión válida.")


@app.before_request
def ensure_session():
    session.permanent = True
    if "conversation_id" not in session:
        session["conversation_id"] = uuid.uuid4().hex


@app.errorhandler(Exception)
def handle_error(exc):
    if isinstance(exc, HTTPException):
        return jsonify({"ok": False, "error": exc.description}), exc.code
    status = 400 if isinstance(exc, (ValueError, RuntimeError)) else 500
    message = str(exc) if status == 400 else "Error interno al procesar la petición. Inténtalo de nuevo."
    payload = request.get_json(silent=True) if request.is_json else None
    if isinstance(payload, dict):
        def secrets_in(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.lower() in {"password", "workload_password", "token", "api_key_value"} and isinstance(item, str) and len(item) > 2:
                        yield item
                    else:
                        yield from secrets_in(item)
            elif isinstance(value, list):
                for item in value:
                    yield from secrets_in(item)
        for secret in secrets_in(payload):
            message = message.replace(secret, "[oculto]")
    if "conversation_id" in session:
        message = workspaces.redact_error(session["conversation_id"], message)
    return jsonify({"ok": False, "error": message}), status


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/favicon.ico")
def favicon():
    return "", 204


@app.get("/api/connections")
def connections():
    return ok(catalog.connections())


@app.post("/api/databases")
def databases():
    payload = request.get_json(force=True)
    return ok(catalog.databases(selected_connection(payload)))


@app.post("/api/tables")
def tables():
    payload = request.get_json(force=True)
    return ok(catalog.tables(selected_connection(payload), payload.get("database", "")))


@app.post("/api/profile")
def profile():
    payload = request.get_json(force=True)
    result = catalog.profile(selected_connection(payload), payload.get("database", ""), payload.get("tables", []))
    return ok(result)


@app.get("/api/history")
def history():
    return ok(memory.get(session["conversation_id"], []))


@app.delete("/api/history")
def clear_history():
    memory.pop(session["conversation_id"], None)
    return ok([])


@app.post("/api/test-model")
def test_model():
    config = request.get_json(force=True)
    started = time.perf_counter()
    endpoint, model, _ = llm.resolve(config)
    effective = {**config, "endpoint": endpoint, "model": model}
    text = llm.complete(effective, [{"role": "user", "content": "Reply only with: CONNECTED"}])
    return ok({
        "message": text.strip(), "model": model, "endpoint": endpoint,
        "latency_ms": round((time.perf_counter() - started) * 1000),
    })


@app.get("/api/workspace")
def workspace_listing():
    return ok(workspaces.listing(session["conversation_id"]))


@app.post("/api/workspace/connections/discover")
def workspace_discover_connection():
    payload = request.get_json(force=True)
    spec = selected_connection({"connection_spec": payload.get("spec", {})})
    return ok(workspaces.discover_connection(session["conversation_id"], spec))


@app.post("/api/workspace/connections/tables")
def workspace_discover_tables():
    payload = request.get_json(force=True)
    return ok(workspaces.discover_tables(session["conversation_id"], payload.get("ticket", ""), payload.get("database", "")))


@app.post("/api/workspace/connections")
def workspace_save_connection():
    payload = request.get_json(force=True)
    return ok(workspaces.save_connection(session["conversation_id"], payload.get("ticket", ""),
                                         payload.get("label", ""), payload.get("database", ""), payload.get("tables", [])))


@app.delete("/api/workspace/connections/<item_id>")
def workspace_delete_connection(item_id):
    workspaces.delete(session["conversation_id"], "connections", item_id)
    return ok()


@app.post("/api/workspace/models/test")
def workspace_test_model():
    return ok(workspaces.test_model(session["conversation_id"], request.get_json(force=True)))


@app.post("/api/workspace/models")
def workspace_save_model():
    payload = request.get_json(force=True)
    return ok(workspaces.save_model(session["conversation_id"], payload.get("ticket", ""), payload.get("label", "")))


@app.delete("/api/workspace/models/<item_id>")
def workspace_delete_model(item_id):
    workspaces.delete(session["conversation_id"], "models", item_id)
    return ok()


@app.post("/api/workspace/chats")
def workspace_create_chat():
    payload = request.get_json(force=True)
    return ok(workspaces.create_chat(session["conversation_id"], payload.get("connection_id", ""), payload.get("model_id", ""), payload.get("model_language", "es")))


@app.get("/api/workspace/chats/<chat_id>")
def workspace_get_chat(chat_id):
    return ok(workspaces.chat(session["conversation_id"], chat_id))


@app.patch("/api/workspace/chats/<chat_id>")
def workspace_update_chat(chat_id):
    payload = request.get_json(force=True)
    return ok(workspaces.set_instructions(session["conversation_id"], chat_id, payload.get("instructions", "")))


@app.delete("/api/workspace/chats/<chat_id>")
def workspace_delete_chat(chat_id):
    workspaces.delete(session["conversation_id"], "chats", chat_id)
    return ok()


@app.post("/api/workspace/chats/<chat_id>/ask")
def workspace_ask(chat_id):
    payload = request.get_json(force=True)
    question = str(payload.get("question", "")).strip()
    if not question or len(question) > 2000:
        raise ValueError("Escribe una pregunta de hasta 2000 caracteres.")
    chat, connection, model = workspaces.binding(session["conversation_id"], chat_id)
    if "additional_context" in payload:
        chat = workspaces.set_instructions(session["conversation_id"], chat_id, payload["additional_context"])
    spec, profiles = connection["spec"], connection["profiles"]
    context = workspaces.chat(session["conversation_id"], chat_id)["messages"][-6:]
    if model.get("built_in"):
        plan = demo_plan(question)
        demo_titles = {
            "en": {"Evolución mensual": "Monthly trend", "Ingresos por tienda": "Revenue by store", "Rendimiento por categoría": "Performance by category", "Ingresos mensuales por categoría": "Monthly revenue by category"},
            "it": {"Evolución mensual": "Andamento mensile", "Ingresos por tienda": "Ricavi per negozio", "Rendimiento por categoría": "Risultati per categoria", "Ingresos mensuales por categoría": "Ricavi mensili per categoria"},
            "de": {"Evolución mensual": "Monatliche Entwicklung", "Ingresos por tienda": "Umsatz nach Filiale", "Rendimiento por categoría": "Leistung nach Kategorie", "Ingresos mensuales por categoría": "Monatsumsatz nach Kategorie"},
            "fr": {"Evolución mensual": "Évolution mensuelle", "Ingresos por tienda": "Revenus par magasin", "Rendimiento por categoría": "Performance par catégorie", "Ingresos mensuales por categoría": "Revenus mensuels par catégorie"},
        }
        plan["title"] = demo_titles.get(payload.get("model_language"), {}).get(plan["title"], plan["title"])
    else:
        dialect = {"postgresql": "PostgreSQL", "trino": "Trino SQL", "cloudera": "HiveQL" if spec.get("dialect") == "hive" else "Impala SQL",
                   "sqlite": "SQLite"}.get(spec["engine"], spec["engine"])
        system = f"""You are a data analyst. Return strict JSON with keys sql, title, summary_hint, chart.
Use only read-only {dialect}. Use only the supplied tables and columns. Always include LIMIT 500 or less.
chart must be one of auto, bar, stacked_bar, line, multi_line, donut, none.
Use secondary axes for numeric measures with materially different scales. Use stacked bars when parts contribute to a whole.
Language for title and summary: {payload.get('model_language', 'es')}.
Schema/profile: {json.dumps(profiles, ensure_ascii=False)}
User preferences: {chat.get('instructions', '')}"""
        messages = [{"role": "system", "content": system}]
        for item in context:
            messages.append({"role": "user", "content": item["question"]})
            messages.append({"role": "assistant", "content": json.dumps({"sql": item["sql"], "summary": item["summary"]}, ensure_ascii=False)})
        messages.append({"role": "user", "content": question})
        plan = llm.parse_json(llm.complete(model["config"], messages, json_mode=True))
    sql = plan.get("sql", "")
    result = catalog.query(spec, sql)
    response = {
        "id": uuid.uuid4().hex[:10], "question": question,
        "summary": summarize(question, result, plan.get("summary_hint"), payload),
        "title": plan.get("title", "Resultado"), "sql": sql,
        "columns": result["columns"], "rows": result["rows"],
        "chart": choose_chart(plan.get("chart", "auto"), result),
        "map": detect_map(result),
        "modules": payload.get("modules") or {"summary": True, "table": True, "chart": True, "map": True, "sql": True},
        "created_at": int(time.time()),
    }
    workspaces.add_message(session["conversation_id"], chat_id, response)
    return ok(response)


@app.post("/api/ask")
def ask():
    payload = request.get_json(force=True)
    question = str(payload.get("question", "")).strip()
    if not question:
        raise ValueError("Escribe una pregunta.")
    spec = selected_connection(payload)
    tables = payload.get("tables", [])
    profiles = payload.get("profiles", [])
    if not tables or not profiles:
        raise ValueError("Selecciona y analiza al menos una tabla.")
    modules = payload.get("modules", {})
    additional_context = str(payload.get("additional_context", "")).strip()[:12000]
    history = memory.setdefault(session["conversation_id"], [])
    context = history[-6:]
    if spec.get("demo") and not payload.get("model", {}).get("endpoint"):
        plan = demo_plan(question)
    else:
        dialect = {
            "impala": "Impala SQL", "hive": "HiveQL", "cloudera": "Cloudera SQL (Impala/Hive)",
            "trino": "Trino SQL", "postgresql": "PostgreSQL", "sqlite": "SQLite",
        }.get(spec["engine"], spec["engine"])
        system = f"""You are a data analyst. Return strict JSON with keys sql, title, summary_hint, chart.
Use only read-only {dialect}. Use only the supplied schema. Always include LIMIT 500 or less.
chart must be one of auto, bar, stacked_bar, line, multi_line, donut, none.
Never invent columns. Language for title and summary: {payload.get('model_language', 'es')}.
Schema/profile: {json.dumps(profiles, ensure_ascii=False)}
Editable context and user preferences (honor them unless they conflict with safety or the schema):
{additional_context or '(none)'}"""
        messages = [{"role": "system", "content": system}]
        for item in context:
            messages.append({"role": "user", "content": item["question"]})
            messages.append({"role": "assistant", "content": json.dumps({"sql": item["sql"], "summary": item["summary"]}, ensure_ascii=False)})
        messages.append({"role": "user", "content": question})
        plan = llm.parse_json(llm.complete(payload.get("model", {}), messages, json_mode=True))
    sql = plan.get("sql", "")
    result = catalog.query(spec, sql)
    summary = summarize(question, result, plan.get("summary_hint"), payload)
    response = {
        "id": uuid.uuid4().hex[:10], "question": question, "summary": summary,
        "title": plan.get("title", "Resultado"), "sql": sql,
        "columns": result["columns"], "rows": result["rows"],
        "chart": choose_chart(plan.get("chart", "auto"), result),
        "map": detect_map(result), "modules": modules, "created_at": int(time.time()),
    }
    history.append(response)
    if len(history) > 30:
        del history[:-30]
    return ok(response)


def demo_plan(question: str):
    q = question.lower()
    if any(word in q for word in ("apilad", "stacked")):
        return {
            "sql": "SELECT substr(sale_date, 1, 7) AS month, "
                   "SUM(CASE WHEN category = 'Electrónica' THEN revenue ELSE 0 END) AS electronics, "
                   "SUM(CASE WHEN category = 'Hogar' THEN revenue ELSE 0 END) AS home, "
                   "SUM(CASE WHEN category = 'Deporte' THEN revenue ELSE 0 END) AS sport "
                   "FROM sales GROUP BY substr(sale_date, 1, 7) ORDER BY month",
            "title": "Ingresos mensuales por categoría", "chart": "stacked_bar",
        }
    if any(word in q for word in ("ciudad", "mapa", "tienda", "store")):
        return {"sql": "SELECT s.store_name, s.city, s.country, s.latitude, s.longitude, ROUND(SUM(sa.revenue), 2) AS revenue FROM stores s JOIN sales sa ON s.store_id = sa.store_id GROUP BY s.store_id, s.store_name, s.city, s.country, s.latitude, s.longitude ORDER BY revenue DESC", "title": "Ingresos por tienda", "chart": "bar"}
    if any(word in q for word in ("categor", "producto", "donut", "toro")):
        return {"sql": "SELECT category, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units FROM sales GROUP BY category ORDER BY revenue DESC", "title": "Rendimiento por categoría", "chart": "donut"}
    return {"sql": "SELECT substr(sale_date, 1, 7) AS month, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units FROM sales GROUP BY substr(sale_date, 1, 7) ORDER BY month", "title": "Evolución mensual", "chart": "line"}


def summarize(question, result, hint, payload):
    rows = result["rows"]
    language = payload.get("model_language", "es")
    phrases = {
        "es": ("La consulta no devolvió resultados para los filtros solicitados.", "He encontrado", "resultados", "El primer registro incluye un valor principal de"),
        "en": ("The query returned no results for these filters.", "I found", "results", "The first row has a main value of"),
        "it": ("La query non ha restituito risultati per questi filtri.", "Ho trovato", "risultati", "La prima riga ha un valore principale di"),
        "de": ("Die Abfrage lieferte für diese Filter keine Ergebnisse.", "Ich habe", "Ergebnisse gefunden", "Der erste Datensatz hat einen Hauptwert von"),
        "fr": ("La requête n’a renvoyé aucun résultat pour ces filtres.", "J’ai trouvé", "résultats", "La première ligne a une valeur principale de"),
    }.get(language, ("La consulta no devolvió resultados para los filtros solicitados.", "He encontrado", "resultados", "El primer registro incluye un valor principal de"))
    if not rows:
        return phrases[0]
    numeric = []
    for value in rows[0].values():
        if isinstance(value, (int, float)):
            numeric.append(value)
    base = f"{phrases[1]} {len(rows)} {phrases[2]}"
    if numeric:
        base += f". {phrases[3]} {numeric[-1]:,.2f}"
    return (hint or base).rstrip(".") + "."


def choose_chart(requested, result):
    if requested != "auto":
        return requested
    columns, rows = result["columns"], result["rows"]
    if len(rows) <= 8 and len(columns) >= 2:
        return "bar"
    return "line"


def detect_map(result):
    names = {name.lower(): name for name in result["columns"]}
    lat = next((names[key] for key in names if key in {"lat", "latitude", "latitud"}), None)
    lon = next((names[key] for key in names if key in {"lon", "lng", "longitude", "longitud"}), None)
    return {"enabled": bool(lat and lon), "latitude": lat, "longitude": lon}


def resolve_bindings(environment=None):
    """Return one CML port when present; otherwise use the fixed local endpoint."""
    environment = os.environ if environment is None else environment
    for name in ("CDSW_APP_PORT", "CDSW_READONLY_PORT"):
        raw = environment.get(name)
        if raw:
            try:
                port = int(raw)
            except ValueError as exc:
                raise RuntimeError(f"{name} debe contener un puerto numérico.") from exc
            if not 1 <= port <= 65535:
                raise RuntimeError(f"{name} está fuera del rango de puertos válido.")
            return [("127.0.0.1", port)]
    return [("127.0.0.1", 8091)]


def serve():
    bindings = resolve_bindings()
    host, port = bindings[0]
    server = make_server(host, port, app, threaded=True)
    print(f"Talk to Data disponible en http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    serve()
