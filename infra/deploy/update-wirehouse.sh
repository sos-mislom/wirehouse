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
./backup.sh > "$release/predeploy-backup.txt"
docker build -f "$release/infra/deploy/Dockerfile" -t "wirehouse-api:$release_tag" "$release" </dev/null
sed -i "s/^RELEASE_TAG=.*/RELEASE_TAG=$release_tag/" .env
rollback() {
  trap - ERR
  cp "$release/previous-compose.yml" compose.yml
  cp "$release/previous.env" .env
  cp "$release/previous-nginx.conf" /etc/nginx/sites-available/wirehouse.conf
  ln -s "$previous_web" /var/www/wirehouse/rollback-link
  mv -Tf /var/www/wirehouse/rollback-link /var/www/wirehouse/current
  docker compose "${compose_args[@]}" up -d api </dev/null
  nginx -t && systemctl reload nginx
}
trap 'rollback' ERR
cp "$release/infra/deploy/compose.wirehouse.yml" compose.yml
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
