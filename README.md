# File Exchange

Self-hosted secure file upload service. Drag-and-drop web UI, magic bytes validation, automatic file expiry, Basic Auth over HTTPS.

Built for exchanging files between a browser and a server — no third-party services, no accounts, no tracking.

## Features

- **Drag-and-drop UI** — single HTML page, zero external dependencies, mobile-friendly
- **Magic bytes validation** — files are verified by binary signature, not just extension
- **Automatic expiry** — files auto-delete after configurable TTL (default 7 days)
- **Rate limiting** — per-IP limits on uploads and deletes
- **Security headers** — CSP, HSTS, nosniff, CORS, X-Frame-Options
- **SHA-256 hashing** — every upload gets a content hash stored in metadata
- **Batch operations** — select multiple files to download or delete at once
- **JSON logging** — structured logs with rotation, no credentials leaked

## Deployment

Deployment is split into two phases. **Phase 1 does not require root** and can be done by an unprivileged user or automated agent. **Phase 2 requires root** for the reverse proxy and TLS.

### Phase 1 — App Setup (no root required)

Requires **Node.js 20+**.

```bash
git clone https://github.com/Baikodis/file-exchange.git
cd file-exchange
cp .env.example .env
```

Edit `.env` — set at minimum:
- `CORS_ORIGIN` — your domain (e.g. `https://files.example.com`)

Then:

```bash
mkdir -p uploads/.logs
npm install
```

**Test locally:**

```bash
npm start
# Server starts on http://localhost:3500
# Open in browser or: curl http://localhost:3500/api/files
```

**Run with PM2 (recommended):**

```bash
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

> Note: `pm2 startup` (systemd auto-start on reboot) requires root — see Phase 2.

After Phase 1, the app is running on `http://localhost:3500`. It works, but has no TLS and no password protection. Proceed to Phase 2 for production use.

### Phase 2 — Reverse Proxy & TLS (requires root)

These commands must be run by the server administrator (root or sudo).

**1. Install Caddy**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

**2. Configure Caddy with Basic Auth**

```bash
# Generate a random password (save it — you'll need it to log in)
PASS=$(openssl rand -base64 32)
echo "Password: $PASS"

# Hash it for Caddy config
HASH=$(caddy hash-password --plaintext "$PASS")
```

Copy `Caddyfile.example` to `/etc/caddy/Caddyfile`. Replace:
- `your-domain.example.com` → your actual domain
- `$2a$14$REPLACE_WITH_BCRYPT_HASH` → the hash from the command above

```bash
sudo systemctl restart caddy
```

**3. DNS**

Create an A record pointing your domain to the server IP.

**4. Firewall (if applicable)**

```bash
sudo ufw allow 80    # Let's Encrypt HTTP-01 challenge
sudo ufw allow 443   # HTTPS
```

Port 3500 should **not** be exposed — Caddy proxies to it on localhost.

**5. PM2 auto-start on reboot**

```bash
sudo env PATH=$PATH:/usr/bin npx pm2 startup systemd -u $(whoami) --hp $(eval echo ~$(whoami))
```

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3500` | Server port |
| `UPLOAD_DIR` | `./uploads` | Where files are stored |
| `MAX_FILE_SIZE` | `524288000` | Max file size in bytes (500 MB) |
| `RATE_LIMIT_UPLOADS` | `10` | Max uploads per minute per IP |
| `FILE_TTL_DAYS` | `7` | Days before auto-deletion |
| `CORS_ORIGIN` | request host | Your domain (e.g. `https://files.example.com`) |
| `ALLOWED_TYPES` | See .env.example | Comma-separated MIME whitelist |

## Allowed File Types

JPEG, PNG, GIF, WebP, PDF, XLSX, DOCX, PPTX, TXT, CSV, ZIP, JSON

Validated by magic bytes (binary signature), not just file extension. ZIP-based Office formats (xlsx/docx/pptx) are verified as ZIP containers with extension matching.

## API

All endpoints return JSON.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a file (multipart form, field: `file`) |
| `GET` | `/api/files` | List files (query: `limit`, `offset`) |
| `GET` | `/api/files/:id` | Download a file |
| `DELETE` | `/api/files/:id` | Delete a file |

### Upload response (201)

```json
{
  "id": "uuid",
  "originalName": "photo.jpg",
  "size": 1048576,
  "mimeType": "image/jpeg",
  "sha256": "e3b0c44...",
  "uploadedAt": "2026-01-01T12:00:00.000Z",
  "expiresAt": "2026-01-08T12:00:00.000Z"
}
```

### List response

```json
{
  "files": [...],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

## Server Administration

### PM2

```bash
pm2 status                    # check if running
pm2 restart file-exchange     # restart after .env changes
pm2 logs file-exchange        # view logs
pm2 logs file-exchange --lines 100
```

PM2 watch is enabled by default — the server auto-restarts when files in `src/` change. Manual restart is only needed for `.env` changes.

### Caddy

```bash
systemctl status caddy        # check status
systemctl restart caddy       # restart after Caddyfile changes
journalctl -u caddy -f        # view logs
```

### Changing the Basic Auth password

```bash
PASS=$(openssl rand -base64 32)
echo "New password: $PASS"
caddy hash-password --plaintext "$PASS"
# Replace the hash in /etc/caddy/Caddyfile, then:
sudo systemctl restart caddy
```

### Disk and uploads

```bash
du -sh uploads/                              # upload directory size
ls uploads/*.meta.json 2>/dev/null | wc -l   # file count
```

Files auto-delete after TTL expires (checked hourly).

## Security

- TLS via Caddy auto-cert (Let's Encrypt)
- Basic Auth with bcrypt hashing at the reverse proxy level
- Rate limiting: uploads (10/min), deletes (5/min) per IP
- Magic bytes validation — rejects files that don't match their claimed type
- UUID filenames — no user-controlled paths reach the filesystem
- Atomic file writes (`fs.rename`) to prevent race conditions
- All filenames rendered via `textContent` (never `innerHTML`) — XSS safe
- Content-Disposition sanitized per RFC 6266 — no header injection
- Authorization headers excluded from logs
- Log rotation: 10 MB max, 5 rotated files

## File Structure

```
file-exchange/
├── src/
│   ├── server.js              # Express app, TTL cleanup
│   ├── config.js              # .env parsing
│   ├── routes/
│   │   ├── upload.js          # POST /api/upload
│   │   ├── list.js            # GET /api/files
│   │   ├── download.js        # GET /api/files/:id
│   │   └── delete.js          # DELETE /api/files/:id
│   ├── middleware/
│   │   ├── validate.js        # Magic bytes + extension check
│   │   ├── rateLimit.js       # Per-IP rate limiters
│   │   └── headers.js         # Security headers + CORS
│   ├── utils/
│   │   ├── magic.js           # Binary signature detection
│   │   ├── metadata.js        # UUID validation, SHA-256, CRUD
│   │   └── logger.js          # JSON logging with rotation
│   └── public/
│       └── index.html         # Web UI (single file, no deps)
├── .env.example
├── Caddyfile.example
├── ecosystem.config.cjs       # PM2 config
├── package.json
├── LICENSE
└── README.md
```

## License

MIT
