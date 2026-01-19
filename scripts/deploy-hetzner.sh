#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/n8n-repo}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/n8n/docker-compose.yml}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-n8n}"
RESTART_METHOD="${RESTART_METHOD:-pull}"
WORKFLOW_IMPORT_ENABLED="${WORKFLOW_IMPORT_ENABLED:-false}"
WORKFLOW_IMPORT_LIST="${WORKFLOW_IMPORT_LIST:-}"

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

if [[ "${WORKFLOW_IMPORT_ENABLED}" == "true" ]]; then
  if [[ -z "${WORKFLOW_IMPORT_LIST}" ]]; then
    echo "WORKFLOW_IMPORT_ENABLED=true but WORKFLOW_IMPORT_LIST is empty. Skipping workflow import."
    exit 0
  fi

  container_id="$(docker compose -f "${COMPOSE_FILE}" ps -q "${COMPOSE_SERVICE}")"
  if [[ -z "${container_id}" ]]; then
    echo "Could not find running container for service ${COMPOSE_SERVICE}" >&2
    exit 1
  fi

  IFS=',' read -r -a workflow_paths <<< "${WORKFLOW_IMPORT_LIST}"
  index=0

  for workflow_path in "${workflow_paths[@]}"; do
    trimmed_path="${workflow_path#"${workflow_path%%[![:space:]]*}"}"
    trimmed_path="${trimmed_path%"${trimmed_path##*[![:space:]]}"}"

    if [[ -z "${trimmed_path}" ]]; then
      continue
    fi

    host_path="${REPO_DIR}/${trimmed_path}"
    if [[ ! -f "${host_path}" ]]; then
      echo "Workflow file not found: ${host_path}" >&2
      exit 1
    fi

    dest_path="/tmp/n8n-workflow-import-${index}-$(basename "${trimmed_path}")"
    docker cp "${host_path}" "${container_id}:${dest_path}"
    docker compose -f "${COMPOSE_FILE}" exec -T "${COMPOSE_SERVICE}" n8n import:workflow --input "${dest_path}"

    index=$((index + 1))
  done
fi
