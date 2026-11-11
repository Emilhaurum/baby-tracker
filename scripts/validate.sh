#!/usr/bin/env bash
# Run the checks from the Validate workflow locally.
#
#   scripts/validate.sh          lint, version check, card syntax and unit tests
#   scripts/validate.sh --e2e    also start Home Assistant and run the browser test
#
# Needs a Python 3.14 environment with requirements_test.txt and the
# home-assistant-frontend package installed (see README), and Node.js for the card.
# --e2e also needs `hass` from Home Assistant 2026.11 or newer (the minimum this
# integration supports) on PATH, and Playwright with Chromium for Node.js.
# hassfest and HACS validation only run in CI.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "ruff"
ruff check .
ruff format --check .

step "versions"
python scripts/set_version.py --check "$(python -c "import json; print(json.load(open('custom_components/baby_tracker/manifest.json'))['version'])")"

step "card"
node --check custom_components/baby_tracker/frontend/baby-tracker-card.js

step "unit tests"
pytest --cov -q

if [[ "${1:-}" == "--e2e" ]]; then
  step "end-to-end"
  work="$(mktemp -d)"
  cleanup() {
    if [[ -n "${hass_pid:-}" ]]; then
      kill "$hass_pid" 2>/dev/null || true
      wait "$hass_pid" 2>/dev/null || true
    fi
    rm -rf "$work"
  }
  trap cleanup EXIT
  mkdir -p "$work/config/custom_components"
  cp -r custom_components/baby_tracker "$work/config/custom_components/"
  printf 'default_config:\nlogger:\n  default: warning\n' > "$work/config/configuration.yaml"
  hass -c "$work/config" > "$work/hass.log" 2>&1 &
  hass_pid=$!
  python tests/e2e/setup_instance.py http://localhost:8123 > "$work/tokens.json"
  node tests/e2e/card.mjs http://localhost:8123 "$work/tokens.json" "$work/output"
  if grep -E "ERROR.*baby_tracker|Traceback.*baby_tracker" "$work/hass.log"; then
    echo "Errors from baby_tracker in the Home Assistant log" >&2
    exit 1
  fi
fi

step "all checks passed"
