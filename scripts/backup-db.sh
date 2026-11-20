#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${1:-core-api-postgres}"
DB_USER="${2:-postgres}"
DB_NAME="${3:-core_api}"
RETENTION_DAYS="${4:-30}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$ROOT_DIR/backups"

mkdir -p "$BACKUP_DIR"

if ! docker ps --filter "name=^/${CONTAINER_NAME}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: PostgreSQL container '${CONTAINER_NAME}' is not running." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"

echo "Backing up database '${DB_NAME}' from container '${CONTAINER_NAME}'..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists > "$OUTPUT_FILE"

if [ ! -s "$OUTPUT_FILE" ]; then
  rm -f "$OUTPUT_FILE"
  echo "Error: Backup file is empty." >&2
  exit 1
fi

find "$BACKUP_DIR" -type f -name "*.sql" -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: ${OUTPUT_FILE} ($(du -h "$OUTPUT_FILE" | cut -f1))"
