#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/wirehouse
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="backups/$stamp"
mkdir "$target"
docker compose -p wirehouse -f compose.yml exec -T db pg_dump -U wirehouse -d wirehouse -Fc > "$target/database.dump"
docker compose -p wirehouse -f compose.yml exec -T api tar -czf - -C /data . > "$target/uploads.tar.gz"
cp .env "$target/deployment.env"
cp compose.yml "$target/compose.yml"
readlink -f /var/www/wirehouse/current > "$target/web-release.txt"
sha256sum "$target/database.dump" "$target/uploads.tar.gz" > "$target/SHA256SUMS"
printf '%s\n' "$target"
# Backups are retained; remove only after verifying off-server copies.
