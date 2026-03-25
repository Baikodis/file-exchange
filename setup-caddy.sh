#!/bin/bash
# Run as root in Recovery Console or with sudo
set -e

echo "=== Caddy Setup ==="

# Check if caddy is installed
if ! command -v caddy &> /dev/null; then
  echo "Installing Caddy..."
  apt install -y caddy
fi

# Generate password
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

systemctl restart caddy

echo ""
echo "=== Caddy ready ==="
echo "URL:   https://upload.baikodis.ru"
echo "Login: admin"
echo "Pass:  $PASS"
