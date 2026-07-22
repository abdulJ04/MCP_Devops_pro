#!/bin/bash
# DevOps AI Agents - One-click startup
# Usage: bash start.sh
# Processes survive terminal close (use 'stop.sh' to stop)

echo "Starting DevOps AI Agents..."
echo ""

# ============================================================
# LLM CONFIGURATION (Optional - Local AI works without any API!)
# ============================================================

# Ollama (LOCAL - Free, Fast)
export OLLAMA_URL="http://localhost:11434"
export OLLAMA_MODEL="qwen2.5:1.5b"

# Groq (FREE Cloud LLM) - Get key from https://console.groq.com
export GROQ_API_KEY=""

# Anthropic Claude (PAID - Best Quality) - Get key from https://console.anthropic.com
export ANTHROPIC_API_KEY=""

# ============================================================
# LLM Priority: Claude (paid) → Ollama (local/free) → Local AI Engine
# ============================================================

# Stop any existing servers first
pkill -f "uvicorn server:app.*8085" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "[1/3] Installing npm dependencies..."
  npm install
else
  echo "[1/3] npm dependencies already installed"
fi

echo "[2/3] Installing Python dependencies..."
pip3 install -r aws-mcp-server/requirements.txt -q 2>/dev/null

echo "[3/3] Starting servers..."
echo "  - Python MCP Backend: http://localhost:8085"
echo "  - Next.js Frontend:   http://localhost:3000"
echo ""

# Start Python backend (survives terminal close)
cd aws-mcp-server
nohup python3 -m uvicorn server:app --host 0.0.0.0 --port 8085 > /tmp/mcp_backend.log 2>&1 &
BACKEND_PID=$!
disown $BACKEND_PID
cd ..

# Wait for backend to be ready
sleep 3

# Start Next.js frontend (survives terminal close)
nohup npm run dev > /tmp/mcp_frontend.log 2>&1 &
FRONTEND_PID=$!
disown $FRONTEND_PID

echo ""
echo "Both servers started! (PIDs: backend=$BACKEND_PID, frontend=$FRONTEND_PID)"
echo "  Backend log:  tail -f /tmp/mcp_backend.log"
echo "  Frontend log: tail -f /tmp/mcp_frontend.log"
echo "  Stop: bash stop.sh"
