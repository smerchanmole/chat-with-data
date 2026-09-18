from __future__ import annotations

import json
import re
from typing import Any

import requests


class LLMClient:
    def complete(self, config: dict[str, Any], messages: list[dict[str, str]], json_mode: bool = False) -> str:
        endpoint, model, headers = self.resolve(config)
        payload = {"model": model, "messages": messages, "temperature": 0.1, "max_tokens": 1200}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        response = requests.post(endpoint, headers=headers, json=payload, timeout=90)
        self._ensure_success(response, endpoint, model)
        data = response.json()
        return data["choices"][0]["message"]["content"]

    def resolve(self, config: dict[str, Any]):
        endpoint = self.normalize_endpoint(str(config.get("endpoint", "")))
        headers = self._headers(config)
        model = str(config.get("model", "")).strip()
        if not model or model.lower() == "default":
            model = self.discover_model(endpoint, headers)
        return endpoint, model, headers

    @staticmethod
    def normalize_endpoint(endpoint: str) -> str:
        endpoint = endpoint.strip().rstrip("/")
        if not endpoint:
            raise ValueError("Configura primero el endpoint del modelo.")
        if endpoint.endswith("/chat/completion"):
            return endpoint + "s"
        if endpoint.endswith("/chat/completions"):
            return endpoint
        if endpoint.endswith("/v1"):
            return endpoint + "/chat/completions"
        if "/v1/" in endpoint:
            return endpoint
        return endpoint + "/v1/chat/completions"

    @staticmethod
    def _headers(config: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        auth_type = config.get("auth_type", "jwt")
        if auth_type in {"jwt", "cdp"}:
            headers["Authorization"] = f"Bearer {config.get('token', '')}"
        elif auth_type == "apikey":
            headers["X-API-Key-ID"] = config.get("api_key_id", "")
            headers["X-API-Key"] = config.get("api_key_value", "")
        return headers

    def discover_model(self, endpoint: str, headers: dict[str, str]) -> str:
        models_endpoint = re.sub(r"/v1(?:/.*)?$", "/v1/models", endpoint)
        if models_endpoint == endpoint:
            models_endpoint = re.sub(r"/chat/completions$", "/models", endpoint)
        response = requests.get(models_endpoint, headers=headers, timeout=30)
        self._ensure_success(response, models_endpoint, "autodescubrimiento")
        data = response.json().get("data", [])
        model_ids = [str(item.get("id", "")).strip() for item in data if isinstance(item, dict)]
        model_ids = [item for item in model_ids if item]
        if not model_ids:
            raise RuntimeError("El endpoint /v1/models no devolvió ningún model ID. Cópialo desde Model Endpoint Details.")
        return model_ids[0]

    @staticmethod
    def _ensure_success(response, endpoint: str, model: str) -> None:
        if response.status_code < 400:
            return
        try:
            detail = json.dumps(response.json(), ensure_ascii=False)
        except Exception:
            detail = (response.text or "Sin detalle").strip()
        detail = detail[:600]
        if response.status_code == 404:
            hint = f"No se encontró la ruta o el model ID '{model}'."
        elif response.status_code in {401, 403}:
            hint = "La credencial no está autorizada para este endpoint."
        else:
            hint = "El endpoint rechazó la petición."
        raise RuntimeError(f"{hint} HTTP {response.status_code} en {endpoint}. Detalle: {detail}")

    @staticmethod
    def parse_json(text: str) -> dict[str, Any]:
        cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.I).strip()
        return json.loads(cleaned)
