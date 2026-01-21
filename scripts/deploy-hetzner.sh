#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/n8n-repo}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/n8n/docker-compose.yml}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-n8n}"
RESTART_METHOD="${RESTART_METHOD:-pull}"
WORKFLOW_IMPORT_ENABLED="${WORKFLOW_IMPORT_ENABLED:-false}"
WORKFLOW_IMPORT_LIST="${WORKFLOW_IMPORT_LIST:-__ALL__}"
WORKFLOW_IMPORT_REACTIVATE="${WORKFLOW_IMPORT_REACTIVATE:-true}"
WORKFLOW_IMPORT_API_URL="${WORKFLOW_IMPORT_API_URL:-}"
WORKFLOW_IMPORT_API_KEY="${WORKFLOW_IMPORT_API_KEY:-}"
WORKFLOW_IMPORT_API_PATH="${WORKFLOW_IMPORT_API_PATH:-api/v1}"

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
  container_id="$(docker compose -f "${COMPOSE_FILE}" ps -q "${COMPOSE_SERVICE}")"
  if [[ -z "${container_id}" ]]; then
    echo "Could not find running container for service ${COMPOSE_SERVICE}" >&2
    exit 1
  fi

  if [[ "${WORKFLOW_IMPORT_LIST}" == "__ALL__" ]]; then
    workflow_paths=()
    for workflow_path in "${REPO_DIR}"/deployment/hetzner/*.json; do
      if [[ -f "${workflow_path}" ]]; then
        workflow_paths+=("${workflow_path#${REPO_DIR}/}")
      fi
    done
  else
    if [[ -z "${WORKFLOW_IMPORT_LIST}" ]]; then
      echo "WORKFLOW_IMPORT_ENABLED=true but WORKFLOW_IMPORT_LIST is empty. Skipping workflow import."
      exit 0
    fi
    IFS=',' read -r -a workflow_paths <<< "${WORKFLOW_IMPORT_LIST}"
  fi
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

    if [[ "${WORKFLOW_IMPORT_REACTIVATE}" == "true" ]]; then
      if [[ -z "${WORKFLOW_IMPORT_API_URL}" || -z "${WORKFLOW_IMPORT_API_KEY}" ]]; then
        echo "WORKFLOW_IMPORT_REACTIVATE=true but WORKFLOW_IMPORT_API_URL or WORKFLOW_IMPORT_API_KEY is missing." >&2
        exit 1
      fi

      workflow_id="$(
        docker compose -f "${COMPOSE_FILE}" exec -T "${COMPOSE_SERVICE}" node -e "
          const fs = require('fs');
          const data = JSON.parse(fs.readFileSync('${dest_path}', 'utf8'));
          if (!data.id) process.exit(2);
          console.log(data.id);
        "
      )"

      if [[ -z "${workflow_id}" ]]; then
        echo "Workflow ID not found in ${dest_path}" >&2
        exit 1
      fi

      docker compose -f "${COMPOSE_FILE}" exec -T "${COMPOSE_SERVICE}" node -e "
        const apiUrl = new URL('${WORKFLOW_IMPORT_API_URL}');
        if (!apiUrl.pathname.endsWith('/')) apiUrl.pathname += '/';
        const apiPath = '${WORKFLOW_IMPORT_API_PATH}'.replace(/^\/+/, '').replace(/\/+$/, '');
        const workflowId = '${workflow_id}';
        fetch(new URL(apiPath + '/workflows/' + workflowId + '/activate', apiUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': '${WORKFLOW_IMPORT_API_KEY}',
          },
        })
          .then(async (response) => {
            if (!response.ok) {
              const text = await response.text();
              console.error(text);
              process.exit(1);
            }
          })
          .catch((error) => {
            console.error(error);
            process.exit(1);
          });
      "
    fi

    index=$((index + 1))
  done
fi
