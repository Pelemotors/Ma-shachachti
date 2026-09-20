#!/bin/sh
# Invokes a first-party cron route on the local Production Next server.
# Secrets come from the service EnvironmentFile, never from git.
set -eu
PATH_NAME="${1:?cron path required}"
PORT="${2:-3001}"
if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET missing" >&2
  exit 1
fi
exec curl -sS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/cron/${PATH_NAME}"
