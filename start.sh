#!/usr/bin/env bash
set -euo pipefail

# ─── Claude CoWork Auto-Memory — Start ───
# Starts the MCP memory server + HTTPS tunnel.
# The tunnel URL is what you paste into CoWork.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$SCRIPT_DIR/mcp-server"
PID_FILE="$SCRIPT_DIR/.pids"
PORT="${CLAUDE_MEMORY_PORT:-3847}"

# Clean up on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  echo "Done."
}
trap cleanup EXIT INT TERM

# Check if already running
if [ -f "$PID_FILE" ]; then
  echo "Auto-memory appears to be already running."
  echo "Run ./stop.sh first, or delete .pids if stale."
  exit 1
fi

# Check that install was run
if [ ! -f "$MCP_DIR/dist/index.js" ]; then
  echo "ERROR: Server not built. Run ./install.sh first."
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  echo "ERROR: cloudflared not found. Run ./install.sh first."
  exit 1
fi

echo "=== Claude CoWork Auto-Memory ==="
echo ""

# 1. Start MCP server
echo "Starting MCP server on port $PORT..."
cd "$MCP_DIR"
node dist/index.js > /tmp/claude-memory-server.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Wait for server to be ready
for i in {1..10}; do
  if curl -sk "https://localhost:$PORT/health" >/dev/null 2>&1; then
    break
  fi
  if curl -s "http://localhost:$PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Verify server is up
if ! curl -sk "https://localhost:$PORT/health" >/dev/null 2>&1 && \
   ! curl -s "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "ERROR: Server failed to start. Check /tmp/claude-memory-server.log"
  exit 1
fi
echo "[ok] MCP server running (PID $SERVER_PID)"

# 2. Start cloudflared tunnel
echo "Starting HTTPS tunnel..."
cloudflared tunnel --url "https://localhost:$PORT" --no-tls-verify > /tmp/claude-memory-tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" >> "$PID_FILE"

# Wait for tunnel URL to appear
TUNNEL_URL=""
for i in {1..15}; do
  TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /tmp/claude-memory-tunnel.log 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Tunnel failed to start. Check /tmp/claude-memory-tunnel.log"
  exit 1
fi
echo "[ok] HTTPS tunnel running (PID $TUNNEL_PID)"

# 3. Display the URL
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   Your MCP Server URL (paste into CoWork):                   ║"
echo "║                                                              ║"
echo "║   ${TUNNEL_URL}/mcp"
echo "║                                                              ║"
echo "║   CoWork → Customize → Connectors → Add connector            ║"
echo "║   Name: Auto Memory                                          ║"
echo "║   URL:  (paste the URL above)                                ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Memory stored at: ${CLAUDE_MEMORY_DIR:-$HOME/Documents/claude-memory}"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

# Keep running until interrupted
wait
