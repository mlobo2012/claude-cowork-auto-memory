#!/usr/bin/env bash
set -euo pipefail

# ─── Claude CoWork Auto-Memory — Install ───
# One-time setup. Run this once after cloning the repo.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR/mcp-server"

echo "=== Claude CoWork Auto-Memory — Install ==="
echo ""

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required but not installed."
  echo "Install it from https://nodejs.org (v18+ recommended)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js v18+ required, found v$(node -v)"
  exit 1
fi
echo "[ok] Node.js $(node -v)"

# 2. Check/install cloudflared (for HTTPS tunnel)
if ! command -v cloudflared &>/dev/null; then
  echo ""
  echo "cloudflared is needed for the HTTPS tunnel."
  if command -v brew &>/dev/null; then
    echo "Installing via Homebrew..."
    brew install cloudflared
  elif [ "$(uname)" = "Linux" ]; then
    echo "Installing cloudflared for Linux..."
    curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
  else
    echo "ERROR: Please install cloudflared manually:"
    echo "  macOS:  brew install cloudflared"
    echo "  Linux:  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    exit 1
  fi
fi
echo "[ok] cloudflared $(cloudflared --version 2>&1 | head -1)"

# 3. Install Node dependencies
echo ""
echo "Installing MCP server dependencies..."
cd "$MCP_DIR"
npm install --silent 2>&1
echo "[ok] Dependencies installed"

# 4. Build TypeScript
echo "Building MCP server..."
npm run build 2>&1
echo "[ok] Server built"

# 5. Generate TLS cert for local HTTPS
CERT_DIR="$MCP_DIR/certs"
if [ ! -f "$CERT_DIR/cert.pem" ]; then
  echo ""
  echo "Generating local TLS certificate..."
  mkdir -p "$CERT_DIR"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -days 365 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
  echo "[ok] TLS certificate generated"
else
  echo "[ok] TLS certificate already exists"
fi

echo ""
echo "=== Install complete ==="
echo ""
echo "Next step: run ./start.sh to start the memory server"
