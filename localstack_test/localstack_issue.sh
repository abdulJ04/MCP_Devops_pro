#!/usr/bin/env bash
# ============================================================
#  LocalStack Docker Restart Script
#  Use this when LocalStack has issues starting
# ============================================================

echo "[INFO] Restarting Docker and LocalStack..."

# Restart Docker services
sudo systemctl restart containerd
sudo systemctl restart docker

# Wait for Docker to be ready
sleep 3

# Remove old LocalStack container
docker rm -f localstack-main 2>/dev/null

# Start LocalStack fresh
docker run -d \
  --name localstack-main \
  -p 4566:4566 \
  -p 4510-4559:4510-4559 \
  localstack/localstack

# Wait for LocalStack to start
echo "[INFO] Waiting for LocalStack to start..."
sleep 10

# Check health
if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
  echo "[OK] LocalStack is running!"
  curl -s http://localhost:4566/_localstack/health | python3 -m json.tool 2>/dev/null || true
else
  echo "[WARN] LocalStack may still be starting. Check with: docker logs localstack-main"
fi
