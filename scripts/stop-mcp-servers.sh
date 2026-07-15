#!/bin/bash
# Stop all MCP servers

for env in dev staging prod; do
  PID_FILE="/tmp/mcp-server-$env.pid"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      echo "[$env] Stopped MCP server (PID $PID)"
    else
      echo "[$env] Not running"
    fi
    rm -f "$PID_FILE"
  fi
done

echo ""
echo "All MCP servers stopped."
