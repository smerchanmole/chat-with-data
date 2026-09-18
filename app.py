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
    "trino": "trino>=0.333,<1",
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
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.exceptions import HTTPException
from werkzeug.serving import make_server

from data_connector import DataCatalog
from llm_client import LLMClient


def resolve_base_dir(file_name=None, working_directory=None):
    """Support normal Python files and CML's notebook-style app runner."""
    if file_name:
        return Path(file_name).resolve().parent
    return Path(working_directory or Path.cwd()).resolve()


BASE_DIR = resolve_base_dir(globals().get("__file__"))
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "talk-to-data-dev-change-me")
app.config.update(JSON_SORT_KEYS=False, MAX_CONTENT_LENGTH=1_000_000)
catalog = DataCatalog(BASE_DIR / "runtime")
llm = LLMClient()
memory: dict[str, list[dict]] = {}


def ok(data=None, **extra):
    return jsonify({"ok": True, "data": data, **extra})


def selected_connection(payload):
    direct = payload.get("connection_spec") or {}
    if direct.get("engine") == "trino" and str(direct.get("jdbc_url", "")).startswith("jdbc:trino://"):
        return {"name": "direct-trino", "label": "Trino JDBC", "engine": "trino", **direct}
    name = payload.get("connection")
    for item in catalog.connections():
        if item["name"] == name:
            return item
    raise ValueError("Selecciona una conexión válida.")


@app.before_request
def ensure_session():
    if "conversation_id" not in session:
        session["conversation_id"] = uuid.uuid4().hex


@app.errorhandler(Exception)
def handle_error(exc):
    if isinstance(exc, HTTPException):
        return jsonify({"ok": False, "error": exc.description}), exc.code
    status = 400 if isinstance(exc, (ValueError, RuntimeError)) else 500
    return jsonify({"ok": False, "error": str(exc)}), status


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
    text = llm.complete(config, [{"role": "user", "content": "Reply only with: CONNECTED"}])
    return ok({"message": text.strip(), "latency_ms": round((time.perf_counter() - started) * 1000)})


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
    history = memory.setdefault(session["conversation_id"], [])
    context = history[-6:]
    if spec.get("demo") and not payload.get("model", {}).get("endpoint"):
        plan = demo_plan(question)
    else:
        dialect = {"impala": "Impala SQL", "hive": "HiveQL", "trino": "Trino SQL", "sqlite": "SQLite"}.get(spec["engine"], spec["engine"])
        system = f"""You are a data analyst. Return strict JSON with keys sql, title, summary_hint, chart.
Use only read-only {dialect}. Use only the supplied schema. Always include LIMIT 500 or less.
chart must be one of auto, bar, stacked_bar, line, multi_line, donut, none.
Never invent columns. Language for title and summary: {payload.get('model_language', 'es')}.
Schema/profile: {json.dumps(profiles, ensure_ascii=False)}"""
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
    if any(word in q for word in ("ciudad", "mapa", "tienda", "store")):
        return {"sql": "SELECT s.store_name, s.city, s.country, s.latitude, s.longitude, ROUND(SUM(sa.revenue), 2) AS revenue FROM stores s JOIN sales sa ON s.store_id = sa.store_id GROUP BY s.store_id, s.store_name, s.city, s.country, s.latitude, s.longitude ORDER BY revenue DESC", "title": "Ingresos por tienda", "chart": "bar"}
    if any(word in q for word in ("categor", "producto", "donut", "toro")):
        return {"sql": "SELECT category, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units FROM sales GROUP BY category ORDER BY revenue DESC", "title": "Rendimiento por categoría", "chart": "donut"}
    return {"sql": "SELECT substr(sale_date, 1, 7) AS month, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units FROM sales GROUP BY substr(sale_date, 1, 7) ORDER BY month", "title": "Evolución mensual", "chart": "line"}


def summarize(question, result, hint, payload):
    rows = result["rows"]
    if not rows:
        return "La consulta no devolvió resultados para los filtros solicitados."
    numeric = []
    for value in rows[0].values():
        if isinstance(value, (int, float)):
            numeric.append(value)
    base = f"He encontrado {len(rows)} resultados"
    if numeric:
        base += f". El primer registro incluye un valor principal de {numeric[-1]:,.2f}"
    return (hint or base) + "."


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
