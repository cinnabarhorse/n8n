#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/n8n-repo}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/n8n/docker-compose.yml}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-n8n}"
RESTART_METHOD="${RESTART_METHOD:-pull}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

cd "${REPO_DIR}"

if [[ "${RESTART_METHOD}" == "build" ]]; then
  docker compose -f "${COMPOSE_FILE}" up -d --build "${COMPOSE_SERVICE}"
else
  docker compose -f "${COMPOSE_FILE}" pull "${COMPOSE_SERVICE}"
  docker compose -f "${COMPOSE_FILE}" up -d "${COMPOSE_SERVICE}"
fi
