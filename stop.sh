#!/bin/bash
# Stop DevOps AI Agents servers

echo "Stopping DevOps AI Agents..."

pkill -f "uvicorn server:app.*8085" 2>/dev/null && echo "  Backend stopped" || echo "  Backend not running"
pkill -f "next dev" 2>/dev/null && echo "  Frontend stopped" || echo "  Frontend not running"

echo "Done."
