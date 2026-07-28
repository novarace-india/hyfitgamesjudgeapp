#!/usr/bin/env bash
set -euo pipefail

backup_dir="${HYFIT_BACKUP_DIR:-./backups}"
mkdir -p "${backup_dir}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${backup_dir}/hyfit-${timestamp}.dump"

pg_dump --format=custom --no-owner --no-acl "${DATABASE_URL:?DATABASE_URL is required}" > "${target}"
shasum -a 256 "${target}" > "${target}.sha256"
find "${backup_dir}" -name 'hyfit-*.dump' -mtime "+${HYFIT_BACKUP_RETENTION_DAYS:-14}" -delete
find "${backup_dir}" -name 'hyfit-*.dump.sha256' -mtime "+${HYFIT_BACKUP_RETENTION_DAYS:-14}" -delete
echo "Backup created: ${target}"
