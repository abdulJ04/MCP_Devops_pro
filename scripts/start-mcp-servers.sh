#!/bin/bash
# Start all 3 MCP servers independently
# These run as background processes (separate from Next.js)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_SCRIPT="$SCRIPT_DIR/mcp-env-server.js"

for env in dev staging prod; do
  PID_FILE="/tmp/mcp-server-$env.pid"
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[$env] Already running (PID $OLD_PID)"
      continue
    fi
  fi

  node "$SERVER_SCRIPT" "$env" &
  PID=$!
  echo $PID > "$PID_FILE"
  echo "[$env] Started MCP server (PID $PID)"
done

echo ""
echo "All MCP servers started. Check:"
echo "  curl http://localhost:8080/health  (prod)"
echo "  curl http://localhost:8081/health  (staging)"
echo "  curl http://localhost:8082/health  (dev)"
