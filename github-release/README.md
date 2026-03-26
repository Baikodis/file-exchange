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

## Quick Start

Requires **Node.js 20+**.

```bash
git clone https://github.com/your-username/file-exchange.git
cd file-exchange
cp .env.example .env
# Edit .env — set CORS_ORIGIN to your domain
npm install
npm start
```

Server starts on `http://localhost:3500`. For production, put it behind a reverse proxy with TLS (see Caddy setup below).

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3500` | Server port |
| `UPLOAD_DIR` | `./uploads` | Where files are stored |
| `MAX_FILE_SIZE` | `524288000` | Max file size in bytes (500 MB) |
| `RATE_LIMIT_UPLOADS` | `10` | Max uploads per minute per IP |
| `FILE_TTL_DAYS` | `7` | Days before auto-deletion |
| `CORS_ORIGIN` | — | Your domain (e.g. `https://files.example.com`) |
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

## Production Setup with Caddy

[Caddy](https://caddyserver.com/) provides automatic HTTPS and Basic Auth.

### 1. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 2. Configure

```bash
# Generate a password
openssl rand -base64 32
# Hash it for Caddy
caddy hash-password --plaintext 'your-generated-password'
```

Copy `Caddyfile.example` to `/etc/caddy/Caddyfile`, replace the domain and password hash, then:

```bash
sudo systemctl restart caddy
```

### 3. DNS

Create an A record pointing your domain to your server's IP.

### 4. Firewall

```bash
sudo ufw allow 80    # Required for Let's Encrypt HTTP-01 challenge
sudo ufw allow 443   # HTTPS
```

Port 3500 should **not** be exposed — Caddy proxies to it on localhost.

## Running with PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # generates a systemd service for auto-start on reboot
```

## Server Administration

Commands for the server admin (requires shell access, typically as root).

### PM2 (process manager)

```bash
pm2 status                    # check if running
pm2 restart file-exchange     # restart after config changes
pm2 logs file-exchange        # view logs (Ctrl+C to exit)
pm2 logs file-exchange --lines 100  # last 100 lines
```

If PM2 watch is enabled (default in ecosystem.config.cjs), the server auto-restarts when files in `src/` change. Manual restart is only needed for `.env` changes.

### Caddy (reverse proxy + TLS)

```bash
systemctl status caddy        # check status
systemctl restart caddy       # restart after Caddyfile changes
journalctl -u caddy -f        # view logs
```

### Changing the Basic Auth password

```bash
# Generate new password
openssl rand -base64 32
# Hash it
caddy hash-password --plaintext 'new-password'
# Edit Caddyfile — replace the hash after "admin"
nano /etc/caddy/Caddyfile
systemctl restart caddy
```

### Firewall

```bash
ufw status                    # current rules
ufw allow 443                 # open HTTPS
ufw deny 3500                 # ensure app port is not directly exposed
```

### Disk and uploads

```bash
du -sh /path/to/uploads/      # check upload directory size
ls /path/to/uploads/*.meta.json | wc -l   # count files
```

Files auto-delete after TTL expires (checked hourly). To manually remove all files:

```bash
rm /path/to/uploads/*.meta.json /path/to/uploads/*.{jpg,png,pdf,zip,...}
```

### Sandboxed environments

If your app runs inside a sandbox (e.g. container or restricted user) where PM2 cannot write to `~/.pm2`, the admin must restart PM2 from a privileged shell (root or via recovery console). The sandbox can still edit source files — PM2 watch will pick up changes automatically if enabled.

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
