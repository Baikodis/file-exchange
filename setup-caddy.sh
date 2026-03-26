#!/bin/bash
# Run as root or with sudo
# Usage: ./setup-caddy.sh <domain> [password]
# If password is omitted, a random 32-char password is generated.
set -e

DOMAIN="${1:?Usage: ./setup-caddy.sh <domain> [password]}"
PASS="${2:-$(openssl rand -base64 32)}"

echo "=== Caddy Setup ==="

# Check if caddy is installed
if ! command -v caddy &> /dev/null; then
  echo "Installing Caddy..."
  apt install -y caddy
fi

HASH=$(caddy hash-password --plaintext "$PASS")

cat > /etc/caddy/Caddyfile << CADDYEOF
${DOMAIN} {
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
echo "URL:   https://${DOMAIN}"
echo "Login: admin"
echo "Pass:  ${PASS}"
echo ""
echo "Save this password — it is not stored anywhere in plaintext."
