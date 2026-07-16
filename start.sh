#!/bin/bash
# DevOps AI Agents - One-click startup
# Usage: bash start.sh

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

# Start Python backend
cd aws-mcp-server
python3 server.py &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 3

# Start Next.js frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Both servers started!"
echo "Open http://localhost:3000 in your browser"
echo "Press Ctrl+C to stop both servers"

# Handle Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
