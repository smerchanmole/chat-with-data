#!/usr/bin/env bash
set -euo pipefail

if [[ -x ".venv/bin/python" ]]; then
  exec .venv/bin/python app.py
fi

exec python3 app.py
