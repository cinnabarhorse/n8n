# Hetzner Deploy Notes

This file captures the key steps and decisions from the automated deploy
setup for the n8n fork running on Hetzner.

## Goal

- Work locally in Cursor and push changes to GitHub.
- GitHub Actions deploys to Hetzner via SSH.
- Server pulls repo and restarts Docker Compose service.

## Workflows

- YouTube Summary: Takes a YouTube URL, fetches transcript, and generates a summary.
- Add any additional workflows here as they become finalized.

## Repo + Paths (current defaults)

- GitHub fork: `git@github.com:cinnabarhorse/n8n.git`
- Server repo path: `/opt/n8n-repo`
- Compose file: `/opt/n8n/docker-compose.yml`
- Service name: `n8n`

## GitHub Actions Workflow

File: `/.github/workflows/deploy-hetzner.yml`

Behavior:
- Trigger: push to `master`
- SSH into server
- `cd /opt/n8n-repo`
- `git pull --ff-only origin master`
- `COMPOSE_FILE=/opt/n8n/docker-compose.yml bash ./scripts/deploy-hetzner.sh`
- Post-deploy health check:
  - `https://wealthapy.com/healthz` (HEAD request with retries)

## Server Deploy Script

File: `/scripts/deploy-hetzner.sh`

Defaults:
- `REPO_DIR=/opt/n8n-repo`
- `COMPOSE_FILE=/opt/n8n/docker-compose.yml`
- `COMPOSE_SERVICE=n8n`
- `RESTART_METHOD=pull`

Behavior:
- `docker compose pull n8n`
- `docker compose up -d n8n`

## Workflow Import on Deploy (optional)

The deploy script can import selected workflows into n8n after the container
starts. This updates the workflows stored in the n8n database.

Flags (environment variables):
- `WORKFLOW_IMPORT_ENABLED=true` to enable imports
- `WORKFLOW_IMPORT_LIST` comma-separated file paths relative to repo root
- `WORKFLOW_IMPORT_REACTIVATE=true` to re-activate imported workflows
- `WORKFLOW_IMPORT_API_URL` base URL for the n8n public API (e.g. `https://wealthapy.com`)
- `WORKFLOW_IMPORT_API_KEY` API key for the n8n public API

Example:
```bash
WORKFLOW_IMPORT_ENABLED=true \
WORKFLOW_IMPORT_LIST="deployment/hetzner/youtube-summary-workflow.json" \
WORKFLOW_IMPORT_REACTIVATE=true \
WORKFLOW_IMPORT_API_URL="https://wealthapy.com" \
WORKFLOW_IMPORT_API_KEY="your_api_key_here" \
COMPOSE_FILE=/opt/n8n/docker-compose.yml \
bash ./scripts/deploy-hetzner.sh
```

## GitHub Actions Secrets

Required:
- `SSH_HOST` = server IP/host
- `SSH_USER` = SSH username (e.g. root)
- `SSH_KEY` = private key contents for GitHub Actions
- `SSH_PORT` = optional (default 22)

## Server SSH Key (for git pull)

The server must authenticate to GitHub to run `git pull`.

Generate key on server:
```bash
ssh-keygen -t ed25519 -C "hetzner-server" -f /root/.ssh/github_deploy -N ""
cat /root/.ssh/github_deploy.pub
```

Add public key to GitHub:
- Repo → Settings → Deploy keys → Add key
- Paste the public key
- Check "Allow write access"

Configure SSH on server:
```bash
cat <<'EOF' > /root/.ssh/config
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 /root/.ssh/config
ssh -T git@github.com
```

Set repo remote on server:
```bash
cd /opt/n8n-repo
git remote set-url origin git@github.com:cinnabarhorse/n8n.git
git pull --ff-only origin master
```

## Initial Server Setup

Clone the fork on the server:
```bash
git clone git@github.com:cinnabarhorse/n8n.git /opt/n8n-repo
cd /opt/n8n-repo
chmod +x ./scripts/deploy-hetzner.sh
```

## Local SSH Key for GitHub Actions

Generate a dedicated deploy key locally:
```bash
ssh-keygen -t ed25519 -C "github-actions-hetzner" -f ~/.ssh/n8n_deploy -N ""
cat ~/.ssh/n8n_deploy
```

Use the private key contents as the `SSH_KEY` secret in GitHub Actions.

## Known Gotchas + Fixes

- `missing server host` in Actions:
  - `SSH_HOST` secret not set.
- `fatal: not a git repository`:
  - Workflow pointed to `/opt/n8n` but repo is `/opt/n8n-repo`.
- `Permission denied (publickey)` on server:
  - Add deploy key to GitHub and configure `/root/.ssh/config`.
- Health check prints HTML:
  - Use `/healthz` with `curl --head` and suppress output.
