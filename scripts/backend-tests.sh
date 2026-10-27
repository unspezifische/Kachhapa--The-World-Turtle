#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$project_root"
required_version=$(tr -d '[:space:]' < .python-version)
export PYTHONDONTWRITEBYTECODE=1

if [[ "${1:-}" == "--setup" ]]; then
  shift
  python_command="${BACKEND_PYTHON:-python3.13}"
  actual_version=$("$python_command" -c 'import platform; print(platform.python_version())')
  [[ "$actual_version" == "$required_version" ]] || {
    echo "Expected Python $required_version; found $actual_version. Set BACKEND_PYTHON to the required interpreter." >&2
    exit 1
  }
  if [[ -d .venv ]]; then
    backup_path=".venv.backup.$(date -u +%Y%m%dT%H%M%SZ)"
    [[ ! -e "$backup_path" ]]
    mv .venv "$backup_path"
    echo "Preserved previous environment at $backup_path"
  fi
  "$python_command" -m venv .venv
  .venv/bin/python -m pip install -r Flask/requirements.txt
fi

[[ -x .venv/bin/python ]] || { echo 'Run bash scripts/backend-tests.sh --setup first.' >&2; exit 1; }
actual_version=$(.venv/bin/python -c 'import platform; print(platform.python_version())')
[[ "$actual_version" == "$required_version" ]] || {
  echo "Expected Python $required_version; found $actual_version. Re-run with --setup." >&2
  exit 1
}
.venv/bin/python -c 'import gevent.monkey; import geventwebsocket'
cd Flask
if [[ $# -gt 0 ]]; then
  exec ../.venv/bin/python -m unittest "$@"
fi
exec ../.venv/bin/python -m unittest discover -s tests -v
