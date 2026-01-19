# n8n Hetzner Deployment with AI Workflow Builder

This guide helps you deploy a modified version of n8n with the AI Workflow Builder enabled using your own Anthropic API key.

## Prerequisites

- A Hetzner Cloud server (CX21 or larger recommended - 2 vCPU, 4GB RAM)
- A domain name pointed to your server's IP address
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)
- Docker and Docker Compose installed on your server

## Quick Start

### 1. Server Setup (Hetzner Cloud)

```bash
# SSH into your Hetzner server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Add your user to docker group (optional, for non-root usage)
usermod -aG docker $USER
```

### 2. Clone and Build

```bash
# Clone your modified n8n repository
git clone https://github.com/YOUR_USERNAME/n8n.git
cd n8n

# Install dependencies
corepack enable
corepack prepare --activate
pnpm install

# Build n8n for deployment
pnpm build:deploy
```

### 3. Configure Environment

```bash
cd deployment/hetzner

# Copy the example environment file
cp env.example .env

# Edit with your values
nano .env
```

**Required values in `.env`:**

```bash
# Your domain (DNS must point to this server)
N8N_HOST=n8n.yourdomain.com

# Database password (use a strong password)
POSTGRES_PASSWORD=your-secure-password-here

# Encryption key (generate with: openssl rand -hex 32)
N8N_ENCRYPTION_KEY=your-32-char-key-here

# AI Provider: 'openrouter' (recommended) or 'anthropic'
AI_PROVIDER=openrouter

# Your OpenRouter API key (get from https://openrouter.ai/keys)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Model to use (default: anthropic/claude-sonnet-4-5)
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
```

### 4. Deploy

```bash
# Build and start all services
docker compose up -d --build

# Check logs
docker compose logs -f
```

### 5. Access n8n

1. Wait 1-2 minutes for Caddy to obtain SSL certificate
2. Open `https://n8n.yourdomain.com` in your browser
3. Create your admin account
4. Start building workflows with AI!

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Internet                          │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Caddy (Reverse Proxy)                   │
│         - Automatic HTTPS/SSL via Let's Encrypt     │
│         - Port 80 & 443                             │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                    n8n                               │
│         - Workflow automation                        │
│         - AI Builder with Anthropic                  │
│         - Port 5678 (internal)                       │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              PostgreSQL 16                           │
│         - Persistent workflow storage                │
│         - Execution history                          │
└─────────────────────────────────────────────────────┘
```

## Useful Commands

```bash
# View all container logs
docker compose logs -f

# View n8n logs only
docker compose logs -f n8n

# Restart all services
docker compose restart

# Stop all services
docker compose down

# Stop and remove all data (CAUTION!)
docker compose down -v

# Update n8n (after pulling new code)
git pull
pnpm install
pnpm build:deploy
docker compose up -d --build
```

## Backup

### Database Backup

```bash
# Create backup
docker compose exec postgres pg_dump -U n8n n8n > backup_$(date +%Y%m%d).sql

# Restore backup
docker compose exec -T postgres psql -U n8n n8n < backup_20240101.sql
```

### n8n Data Backup

```bash
# Backup n8n data volume
docker run --rm -v n8n_data:/data -v $(pwd):/backup alpine tar czf /backup/n8n_data_backup.tar.gz /data
```

## Troubleshooting

### SSL Certificate Issues

```bash
# Check Caddy logs
docker compose logs caddy

# Ensure DNS is pointing to your server
dig +short n8n.yourdomain.com
```

### n8n Won't Start

```bash
# Check n8n logs
docker compose logs n8n

# Common issues:
# - Missing environment variables
# - Database connection issues
# - Invalid encryption key
```

### AI Builder Not Working

1. Verify `N8N_AI_ENABLED=true` is set
2. Check your API key is valid:
   - For OpenRouter: Verify at https://openrouter.ai/keys
   - For Anthropic: Verify at https://console.anthropic.com/
3. Verify the provider is set correctly (`AI_PROVIDER=openrouter` or `AI_PROVIDER=anthropic`)
4. Look for errors in n8n logs:

```bash
docker compose logs n8n | grep -i "ai\|anthropic\|openrouter\|builder"
```

### Supported OpenRouter Models

The AI Builder works best with Claude models. Recommended options:

| Model | OpenRouter Name | Notes |
|-------|-----------------|-------|
| Claude Sonnet 4.5 | `anthropic/claude-sonnet-4-5` | Default, best balance |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` | Cheaper alternative |
| Claude 3 Opus | `anthropic/claude-3-opus` | Most capable |

Set the model in your `.env`:
```bash
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

## Security Recommendations

1. **Firewall**: Only allow ports 80, 443, and 22 (SSH)
   ```bash
   ufw allow 22
   ufw allow 80
   ufw allow 443
   ufw enable
   ```

2. **SSH Key Authentication**: Disable password authentication
   ```bash
   # In /etc/ssh/sshd_config
   PasswordAuthentication no
   ```

3. **Regular Updates**: Keep system and Docker images updated
   ```bash
   apt update && apt upgrade -y
   docker compose pull
   docker compose up -d
   ```

4. **Backup Encryption Key**: Store `N8N_ENCRYPTION_KEY` securely. Without it, you cannot decrypt your credentials!

## Cost Estimate

| Resource | Hetzner Price |
|----------|---------------|
| CX21 Server (2 vCPU, 4GB RAM) | ~€5.39/month |
| 40GB SSD (included) | - |
| Anthropic API (Claude Sonnet) | ~$3/1M input tokens |

## Support

- [n8n Documentation](https://docs.n8n.io)
- [n8n Community Forum](https://community.n8n.io)
- [Anthropic Documentation](https://docs.anthropic.com)
