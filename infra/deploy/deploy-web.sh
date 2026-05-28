#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ ! -f "${SCRIPT_DIR}/server.local.env" ]]; then
  echo "Missing ${SCRIPT_DIR}/server.local.env"
  exit 1
fi

set -a
source "${SCRIPT_DIR}/server.local.env"
set +a

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"

cd "${ROOT_DIR}"
npm --workspace apps/web run build
rsync -avz --delete "${ROOT_DIR}/apps/web/dist/" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
