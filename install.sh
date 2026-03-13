#!/bin/bash

# AridV2 Installation Script
# Automated setup for production deployment

set -e

echo "🤖 AridV2 - Installation Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    echo "Please install Node.js >= 18 from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version must be >= 18 (current: $(node -v))${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not found${NC}"
    echo "Installing pnpm globally..."
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm $(pnpm -v)${NC}"

# Check Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ Git not found${NC}"
    echo "Please install Git from https://git-scm.com"
    exit 1
fi
echo -e "${GREEN}✓ Git $(git --version | awk '{print $3}')${NC}"

echo ""
echo "📁 Setting up directories..."

# Create necessary directories
mkdir -p data/backups
mkdir -p workspace/logs
mkdir -p workspace/skills
mkdir -p uploads

echo -e "${GREEN}✓ Directories created${NC}"

echo ""
echo "⚙️  Creating configuration..."

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ .env created from template${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANT: Edit .env with your API keys${NC}"
        echo "   vim .env"
        echo "   # or"
        echo "   nano .env"
        echo ""
        echo "   Required keys:"
        echo "   - TELEGRAM_BOT_TOKEN"
        echo "   - TELEGRAM_ALLOWED_USER_IDS"
        echo "   - GEMINI_API_KEY (or ANTHROPIC_API_KEY)"
        echo ""
    else
        echo -e "${RED}✗ .env.example not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env already exists${NC}"
fi

echo ""
echo "📦 Installing dependencies..."

# Install npm dependencies
pnpm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "🔨 Building project..."

# Build TypeScript
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build completed${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo "======================================"
echo -e "${GREEN}✓ Installation completed successfully!${NC}"
echo "======================================"
echo ""
echo "📖 Next steps:"
echo ""
echo "1️⃣  Edit your configuration:"
echo "   vim .env"
echo ""
echo "2️⃣  Start the bot:"
echo "   pnpm start"
echo ""
echo "3️⃣  Or use development mode:"
echo "   pnpm dev"
echo ""
echo "📚 For more information, see:"
echo "   - QUICKSTART.md - Quick setup guide"
echo "   - README.md - Full documentation"
echo ""
echo "💡 Tips:"
echo "   - Use 'pnpm run build' to compile after changes"
echo "   - Use 'pnpm test' to run tests"
echo "   - Check logs in workspace/logs/ for debugging"
echo ""
