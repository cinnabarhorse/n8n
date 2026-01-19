#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  n8n AI Builder Deployment Script     ${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo -e "${YELLOW}Copy env.example to .env and configure it:${NC}"
    echo "  cp env.example .env"
    echo "  nano .env"
    exit 1
fi

# Load environment variables
source .env

# Validate required variables
REQUIRED_VARS=("N8N_HOST" "POSTGRES_PASSWORD" "N8N_ENCRYPTION_KEY")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}Error: $var is not set in .env${NC}"
        exit 1
    fi
done

# Validate AI provider configuration
AI_PROVIDER="${AI_PROVIDER:-openrouter}"
if [ "$AI_PROVIDER" = "openrouter" ]; then
    if [ -z "$OPENROUTER_API_KEY" ]; then
        echo -e "${RED}Error: OPENROUTER_API_KEY is not set in .env${NC}"
        echo -e "${YELLOW}Get your key from: https://openrouter.ai/keys${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Using OpenRouter with model: ${OPENROUTER_MODEL:-anthropic/claude-sonnet-4-5}${NC}"
elif [ "$AI_PROVIDER" = "anthropic" ]; then
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo -e "${RED}Error: ANTHROPIC_API_KEY is not set in .env${NC}"
        echo -e "${YELLOW}Get your key from: https://console.anthropic.com/${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Using Anthropic directly${NC}"
else
    echo -e "${RED}Error: Invalid AI_PROVIDER '$AI_PROVIDER'. Use 'openrouter' or 'anthropic'${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configuration validated${NC}"

# Check if compiled directory exists
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$SCRIPT_DIR/../.."

if [ ! -d "$ROOT_DIR/compiled" ]; then
    echo -e "${YELLOW}Compiled n8n not found. Building now...${NC}"
    echo "This may take several minutes..."
    
    cd "$ROOT_DIR"
    
    # Check for pnpm
    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}Error: pnpm is not installed${NC}"
        echo "Install with: corepack enable && corepack prepare --activate"
        exit 1
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        pnpm install
    fi
    
    # Build for deployment
    echo "Building n8n..."
    pnpm build:deploy
    
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}✓ Build complete${NC}"
else
    echo -e "${GREEN}✓ Compiled n8n found${NC}"
fi

# Build and start containers
echo -e "${YELLOW}Starting Docker containers...${NC}"
docker compose up -d --build

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!                  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Your n8n instance will be available at:"
echo -e "  ${GREEN}https://${N8N_HOST}${NC}"
echo ""
echo -e "${YELLOW}Note: It may take 1-2 minutes for SSL certificate to be provisioned${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:     docker compose logs -f"
echo "  Stop:          docker compose down"
echo "  Restart:       docker compose restart"
