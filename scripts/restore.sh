#!/usr/bin/env bash
set -euo pipefail

backup="${1:?Usage: scripts/restore.sh path/to/backup.dump}"
test -f "${backup}"
test -f "${backup}.sha256"
shasum -a 256 -c "${backup}.sha256"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="${DATABASE_URL:?DATABASE_URL is required}" "${backup}"
echo "Restore complete: ${backup}"
