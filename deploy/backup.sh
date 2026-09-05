#!/usr/bin/env bash
# Nightly Postgres backup. Writes a gzipped dump into ./backups and prunes
# anything older than RETAIN_DAYS.
#
# Install (as the app user, from /opt/task-bucket):
#   crontab -e
#   15 3 * * * cd /opt/task-bucket && ./deploy/backup.sh >> backups/backup.log 2>&1
#
# A backup on the same disk as the database protects against a bad migration or
# a wrong DELETE, not against losing the machine. Copy the dumps somewhere else
# too — see UPLOAD below.
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env.prod}
RETAIN_DAYS=${RETAIN_DAYS:-7}
STAMP=$(date -u +%Y%m%d-%H%M%S)
OUT="backups/task-bucket-${STAMP}.sql.gz"

mkdir -p backups

# shellcheck disable=SC1090
set -a; . "./${ENV_FILE}"; set +a

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-task_bucket}" --clean --if-exists \
  | gzip -9 > "$OUT"

# A dump that failed halfway can still leave a small file behind; catch that.
SIZE=$(stat -c%s "$OUT")
if [[ "$SIZE" -lt 1024 ]]; then
  echo "$(date -u +%FT%TZ) FAILED: ${OUT} is only ${SIZE} bytes" >&2
  rm -f "$OUT"
  exit 1
fi

echo "$(date -u +%FT%TZ) wrote ${OUT} (${SIZE} bytes)"

# UPLOAD (optional): with the AWS CLI installed and an instance role attached,
# uncomment to ship the dump off the box.
# aws s3 cp "$OUT" "s3://YOUR-BUCKET/task-bucket/" --storage-class STANDARD_IA

find backups -name 'task-bucket-*.sql.gz' -mtime "+${RETAIN_DAYS}" -print -delete
