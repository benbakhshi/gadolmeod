#!/usr/bin/env bash
# Simple helper to preview the static site at http://localhost:8000
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PORT=${PORT:-8000}
PYTHON_BIN=${PYTHON_BIN:-python3}
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Error: $PYTHON_BIN not found. Set PYTHON_BIN to your Python 3 executable." >&2
  exit 1
fi
printf 'Serving %s on http://localhost:%s (Ctrl+C to stop)\n' "$SCRIPT_DIR" "$PORT"
exec "$PYTHON_BIN" -m http.server "$PORT"
