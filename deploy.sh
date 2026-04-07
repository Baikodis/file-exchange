#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== File Exchange Deploy ==="

# 1. Uploads directory (inside project, no root needed)
echo "[1/4] Creating uploads directory..."
mkdir -p ./uploads/.logs
echo "  done: ./uploads/.logs"

# 2. npm install
echo "[2/4] Installing dependencies..."
npm install --cache /tmp/npm-cache 2>&1 | tail -3
echo "  done: node_modules"

# 3. .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[3/4] .env created from example"
else
  echo "[3/4] .env already exists"
fi

# 4. PM2
echo "[4/4] Starting app with PM2..."
pm2 delete file-exchange 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save 2>/dev/null || true
echo "  done: PM2 started"

echo ""
echo "=== App running on http://localhost:3500 ==="
echo "Test: curl http://localhost:3500/api/files"
echo ""
echo "For HTTPS + Basic Auth, run setup-caddy.sh as root"
