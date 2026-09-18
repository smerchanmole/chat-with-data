from __future__ import annotations

import json
import re
from typing import Any

import requests


class LLMClient:
    def complete(self, config: dict[str, Any], messages: list[dict[str, str]], json_mode: bool = False) -> str:
        endpoint = config.get("endpoint", "").rstrip("/")
        if not endpoint:
            raise ValueError("Configura primero el endpoint del modelo.")
        if not endpoint.endswith("/chat/completions"):
            endpoint += "/chat/completions"
        headers = {"Content-Type": "application/json"}
        auth_type = config.get("auth_type", "jwt")
        if auth_type in {"jwt", "cdp"}:
            headers["Authorization"] = f"Bearer {config.get('token', '')}"
        elif auth_type == "apikey":
            headers["X-API-Key-ID"] = config.get("api_key_id", "")
            headers["X-API-Key"] = config.get("api_key_value", "")
        payload = {"model": config.get("model", "default"), "messages": messages, "temperature": 0.1, "max_tokens": 1200}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        response = requests.post(endpoint, headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]

    @staticmethod
    def parse_json(text: str) -> dict[str, Any]:
        cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.I).strip()
        return json.loads(cleaned)

