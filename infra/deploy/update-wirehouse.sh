#!/usr/bin/env bash
# Run on the server after uploading /opt/wirehouse/release.tar.gz.
set -euo pipefail
umask 077
cd /opt/wirehouse
exec 9>/opt/wirehouse/.deploy.lock
flock -n 9 || { echo 'Another Wirehouse deployment is running'; exit 2; }
compose_args=(-p wirehouse -f compose.yml)
if [[ -f compose.network.yml ]]; then compose_args+=(-f compose.network.yml); fi
release_tag=${1:?Usage: update-wirehouse.sh RELEASE_TAG [ARCHIVE] [migrate|status] [PREBUILT_IMAGE_ID]}
[[ "$release_tag" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 2
archive=$(realpath -- "${2:-release.tar.gz}")
[[ "$archive" == /opt/wirehouse/*.tar.gz && -f "$archive" ]] || exit 2
schema_action=${3:-migrate}
[[ "$schema_action" == migrate || "$schema_action" == status ]] || exit 2
release="/opt/wirehouse/releases/$release_tag"
[[ ! -e "$release" ]] || { echo 'Release already exists'; exit 2; }
mkdir -p "$release"
tar -xzf "$archive" -C "$release"
[[ -s "$release/REVISION" && -s "$release/apps/web/dist/index.html" ]]
nginx -t
# Private deployment inputs and the previous static pointer stay with this release.
mkdir "$release/previous-deployment"
cp .env compose.yml deployed-revision.txt "$release/previous-deployment/"
if [[ -f compose.network.yml ]]; then cp compose.network.yml "$release/previous-deployment/"; fi
readlink -f /var/www/wirehouse/current > "$release/previous-deployment/web-release.txt"
if [[ -f deployed-web-revision.txt ]]; then cp deployed-web-revision.txt "$release/previous-deployment/"; fi
cp /etc/nginx/sites-available/wirehouse.conf "$release/previous-deployment/nginx.conf"
if [[ -n "${4:-}" ]]; then
  [[ "$4" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$(docker image inspect --format '{{.Id}}' "wirehouse-api:$release_tag")" == "$4" ]]
else
  docker build -f "$release/infra/deploy/Dockerfile" -t "wirehouse-api:$release_tag" "$release" </dev/null
fi
# Quiesce writes before the final consistent backup and schema transition.
docker compose "${compose_args[@]}" stop -t 30 api </dev/null
bash "$release/infra/deploy/backup-wirehouse.sh" > "$release/predeploy-backup.txt"
sed -i "s/^RELEASE_TAG=.*/RELEASE_TAG=$release_tag/" .env
cp "$release/infra/deploy/compose.wirehouse.yml" compose.yml
docker compose "${compose_args[@]}" run --rm --no-deps api node apps/api/src/persistence/cli.js "$schema_action" > "$release/migration.json"
docker compose "${compose_args[@]}" up -d api </dev/null
healthy=false
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 -fsS http://127.0.0.1:18044/health > "$release/health.json"; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]]
web="/var/www/wirehouse/releases/$release_tag"
mkdir -p "$web"
# Keep published downloads and old hashed chunks for clients with an open tab.
previous_web=$(cat "$release/previous-deployment/web-release.txt")
[[ "$previous_web" == /var/www/wirehouse/releases/* && -d "$previous_web" ]]
if [[ -d "$previous_web/assets" ]]; then cp -a "$previous_web/assets" "$web/"; fi
if [[ -d "$previous_web/downloads" ]]; then cp -a "$previous_web/downloads" "$web/"; fi
cp -a "$release/apps/web/dist/." "$web/"
cp "$release/REVISION" "$web/WEB_REVISION"
find "$web" -type d -exec chmod 755 {} +
find "$web" -type f -exec chmod 644 {} +
ln -s "$web" "/var/www/wirehouse/next-link-$release_tag"
mv -Tf "/var/www/wirehouse/next-link-$release_tag" /var/www/wirehouse/current
# Application updates preserve the existing vhost and certificate configuration.
nginx -t
curl --connect-timeout 5 --max-time 30 -fsS --resolve sklad-kontur.92.118.115.96.nip.io:443:127.0.0.1 \
  https://sklad-kontur.92.118.115.96.nip.io/health > "$release/public-health.json"
cp "$release/infra/deploy/backup-wirehouse.sh" backup.sh
chmod 700 backup.sh
cp "$release/REVISION" deployed-revision.txt
cp "$release/REVISION" deployed-web-revision.txt
chmod 644 deployed-revision.txt deployed-web-revision.txt
# Keep prior releases, images and backups. Database rollback requires a deliberate
# restore: an older API rejects migrations newer than its own schema manifest.
printf 'Released %s\n' "$release_tag"
