#!/usr/bin/env bash
# Run on the server after uploading /opt/wirehouse/release.tar.gz.
set -euo pipefail
umask 077
cd /opt/wirehouse
compose_args=(-p wirehouse -f compose.yml)
if [[ -f compose.network.yml ]]; then compose_args+=(-f compose.network.yml); fi
release_tag=${1:?Usage: update-wirehouse.sh RELEASE_TAG}
[[ "$release_tag" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 2
release="/opt/wirehouse/releases/$release_tag"
[[ ! -e "$release" ]] || { echo 'Release already exists'; exit 2; }
mkdir -p "$release"
tar -xzf release.tar.gz -C "$release"
previous_web=$(readlink -f /var/www/wirehouse/current)
cp .env "$release/previous.env"
cp compose.yml "$release/previous-compose.yml"
cp /etc/nginx/sites-available/wirehouse.conf "$release/previous-nginx.conf"
previous_schema=$(docker compose "${compose_args[@]}" exec -T db psql -U wirehouse -d wirehouse -Atc "SELECT coalesce(to_regclass('warehouse.storage_control')::text, 'legacy')")
if [[ "$previous_schema" != legacy ]]; then
  previous_schema=$(docker compose "${compose_args[@]}" exec -T db psql -U wirehouse -d wirehouse -Atc 'SELECT mode FROM warehouse.storage_control WHERE id')
fi
docker build -f "$release/infra/deploy/Dockerfile" -t "wirehouse-api:$release_tag" "$release" </dev/null
migration_applied=false
rollback() {
  trap - ERR
  docker compose "${compose_args[@]}" stop -t 30 api </dev/null
  if [[ "$migration_applied" == true && "$previous_schema" == legacy ]]; then
    # The old image cannot read relational tables. Export the current rows before
    # restarting it; never point it at a stale app_state archive.
    if ! docker compose "${compose_args[@]}" run --rm --no-deps api node apps/api/src/persistence/cli.js rollback-legacy > "$release/rollback-migration.json"; then
      echo 'Rollback export failed. API remains stopped; do not start the old image against the archive.' >&2
      exit 1
    fi
  fi
  cp "$release/previous-compose.yml" compose.yml
  cp "$release/previous.env" .env
  cp "$release/previous-nginx.conf" /etc/nginx/sites-available/wirehouse.conf
  ln -s "$previous_web" /var/www/wirehouse/rollback-link
  mv -Tf /var/www/wirehouse/rollback-link /var/www/wirehouse/current
  docker compose "${compose_args[@]}" up -d api </dev/null
  nginx -t && systemctl reload nginx
  exit 1
}
trap 'rollback' ERR
# Quiesce writes before the final consistent backup and schema transition.
docker compose "${compose_args[@]}" stop -t 30 api </dev/null
bash "$release/infra/deploy/backup-wirehouse.sh" > "$release/predeploy-backup.txt"
sed -i "s/^RELEASE_TAG=.*/RELEASE_TAG=$release_tag/" .env
cp "$release/infra/deploy/compose.wirehouse.yml" compose.yml
docker compose "${compose_args[@]}" run --rm --no-deps api node apps/api/src/persistence/cli.js migrate > "$release/migration.json"
migration_applied=true
docker compose "${compose_args[@]}" up -d api </dev/null
healthy=false
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:18044/health > "$release/health.json"; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]]
web="/var/www/wirehouse/releases/$release_tag"
mkdir -p "$web"
cp -a "$release/apps/web/dist/." "$web/"
find "$web" -type d -exec chmod 755 {} +
find "$web" -type f -exec chmod 644 {} +
ln -s "$web" /var/www/wirehouse/next-link
mv -Tf /var/www/wirehouse/next-link /var/www/wirehouse/current
cp "$release/infra/deploy/nginx.wirehouse.conf" /etc/nginx/sites-available/wirehouse.conf
chmod 644 /etc/nginx/sites-available/wirehouse.conf
nginx -t
systemctl reload nginx
cp "$release/infra/deploy/backup-wirehouse.sh" backup.sh
chmod 700 backup.sh
trap - ERR
printf 'Released %s\n' "$release_tag"
