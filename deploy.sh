#!/bin/bash
set -e

echo "=== File Exchange Deploy ==="

# 1. Uploads directory
echo "[1/6] Creating uploads directory..."
mkdir -p /home/client/uploads/.logs
chown -R client:client /home/client/uploads
echo "  ✓ /home/client/uploads/.logs"

# 2. npm install
echo "[2/6] Installing dependencies..."
cd /home/client/projects/file-exchange
npm install --cache /tmp/npm-cache
echo "  ✓ node_modules"

# 3. .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  ✓ .env created from example"
else
  echo "  ✓ .env already exists"
fi

# 4. Generate password + Caddyfile
echo "[4/6] Setting up Caddy..."
PASS="c1247AufpVqwY0CuVVKwrZh/iUH3rDngJN3BWOMf2tI="
HASH=$(caddy hash-password --plaintext "$PASS")

cat > /etc/caddy/Caddyfile << CADDYEOF
upload.baikodis.ru {
    basicauth * {
        admin ${HASH}
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        -Server
    }
    reverse_proxy localhost:3500
}
CADDYEOF
echo "  ✓ Caddyfile written"
echo "  ✓ Password: $PASS"
echo "  ✓ Login: admin / $PASS"

# 5. Restart Caddy
echo "[5/6] Restarting Caddy..."
systemctl restart caddy
echo "  ✓ Caddy restarted"

# 6. PM2
echo "[6/6] Starting app with PM2..."
cd /home/client/projects/file-exchange
pm2 delete file-exchange 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
echo "  ✓ PM2 started"

echo ""
echo "=== Deploy complete ==="
echo "URL:   https://upload.baikodis.ru"
echo "Login: admin"
echo "Pass:  $PASS"
echo ""
echo "Test: curl -u admin:$PASS https://upload.baikodis.ru/api/files"
