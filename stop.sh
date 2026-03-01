#!/usr/bin/env bash

# ─── Claude CoWork Auto-Memory — Stop ───

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pids"

if [ ! -f "$PID_FILE" ]; then
  echo "No running instance found."
  # Clean up any strays
  pkill -f "claude-cowork-memory" 2>/dev/null || true
  pkill -f "cloudflared tunnel.*3847" 2>/dev/null || true
  exit 0
fi

echo "Stopping auto-memory..."
while read -r pid; do
  kill "$pid" 2>/dev/null && echo "  Stopped PID $pid" || true
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "Done."
