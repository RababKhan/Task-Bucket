#!/usr/bin/env bash
# Restore a dump made by backup.sh. DESTRUCTIVE: it drops and recreates every
# object in the target database.
#
#   ./deploy/restore.sh backups/task-bucket-20260101-031500.sql.gz
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.prod}
DUMP=${1:-}

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  ls -1t backups/*.sql.gz 2>/dev/null | head -10 >&2 || true
  exit 1
fi

# shellcheck disable=SC1090
set -a; . "./${ENV_FILE}"; set +a

read -rp "This will overwrite ${POSTGRES_DB:-task_bucket}. Type the database name to confirm: " ANSWER
[[ "$ANSWER" == "${POSTGRES_DB:-task_bucket}" ]] || { echo "Aborted."; exit 1; }

echo "Stopping the app so nothing writes mid-restore..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop app

gunzip -c "$DUMP" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-task_bucket}" -v ON_ERROR_STOP=1

echo "Restarting the app..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" start app
echo "Restored from ${DUMP}."
