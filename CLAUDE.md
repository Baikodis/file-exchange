# File Exchange — Secure Upload Service

## Purpose
Self-hosted secure file upload web service for exchanging files between the user (browser) and the AI assistant (server filesystem). Deployed on the assistant's server (142.93.239.85), NOT on Germany VPS.

## Architecture

```
Browser → HTTPS (TLS 1.2+, Let's Encrypt) → Caddy (Basic Auth + headers) → Node.js :3500 → /home/client/uploads/
```

## Domain
upload.baikodis.ru → A record → 142.93.239.85. Caddy auto-cert.

## Server
Ubuntu 24.04, Node.js v22, no Docker. Caddy as reverse proxy.

## 8 Security Layers

1. TLS: Caddy auto Let's Encrypt, TLS 1.2+, HSTS
2. Auth: Basic Auth at Caddy, 32+ char password, bcrypt
3. Rate limit: 10 uploads/min, 5 deletes/min, 5 auth fails/15min (express-rate-limit)
4. Validation: magic bytes → MIME whitelist → last-extension-only check → size (500MB). Multiple dots in filename OK (dates etc)
5. Storage: atomic rename to UUID filenames, outside webroot, 640 perms, SHA256 hash in metadata
6. Headers: explicit CSP, nosniff, DENY, strict referrer, CORS same-origin
7. Logging: JSON lines, Authorization header EXCLUDED from logs, rotation (10MB max, 5 files kept)
8. TTL: files auto-delete after 7 days. Agent can move file to project dir to preserve it

## Allowed Types
jpeg, png, gif, webp, pdf, xlsx, docx, pptx, txt, csv, zip, json

## API
- POST /api/upload (multipart) → {id, originalName, size, mimeType, sha256, uploadedAt, expiresAt}
- GET /api/files?limit=50&offset=0 → paginated list (default limit 50, max 200)
- GET /api/files/:id → download (Content-Disposition: attachment, originalName sanitized per RFC 6266)
- DELETE /api/files/:id → remove (rate limited: 5/min per IP)

## File Structure
```
file-exchange/
├── CLAUDE.md
├── package.json
├── src/
│   ├── server.js
│   ├── config.js
│   ├── routes/ (upload, download, list, delete)
│   ├── middleware/ (validate, rateLimit, headers)
│   ├── utils/ (magic, metadata, logger)
│   └── public/index.html (drag-and-drop UI)
├── Caddyfile
├── ecosystem.config.js
└── .env.example
```

## Storage Layout
```
/home/client/uploads/
├── <uuid>.<ext> + <uuid>.meta.json
└── .logs/access.log
```

## Meta format
```json
{
    "id": "uuid",
    "originalName": "report.pdf",
    "storedName": "uuid.pdf",
    "mimeType": "application/pdf",
    "size": 1048576,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "uploadedAt": "2026-03-24T12:00:00Z",
    "expiresAt": "2026-03-31T12:00:00Z",
    "ip": "203.0.113.1"
}
```

## Config (.env)
PORT=3500
UPLOAD_DIR=/home/client/uploads
MAX_FILE_SIZE=524288000
RATE_LIMIT_UPLOADS=10
FILE_TTL_DAYS=7
ALLOWED_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/json

## Caddyfile
```
upload.baikodis.ru {
    basicauth * {
        admin $BCRYPT_HASH
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
```

## Security Headers (explicit values)
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Access-Control-Allow-Origin: https://upload.baikodis.ru
```

## Dependencies
express ^4.21, multer ^1.4, uuid ^11, file-type ^19, express-rate-limit ^7, helmet ^8, morgan ^1

## Threat Model
| Threat | Mitigation |
|--------|-----------|
| MITM | TLS 1.2+ via Caddy + HSTS |
| Unauthorized access | Basic Auth bcrypt at Caddy |
| Brute force | Rate limit 5/15min |
| Malicious upload | Magic bytes + MIME whitelist + no execution |
| Path traversal | UUID filenames, no user paths |
| DoS | 500MB limit + rate limiting |
| XSS via upload | Content-Disposition: attachment + nosniff |
| Clickjacking | X-Frame-Options: DENY |
| Directory listing | Upload dir not in webroot |
| Zip bomb | Size limit, no server-side extraction |
| TOCTOU race | Atomic rename (fs.rename), UUID collision check before write |
| Stored XSS via filename | originalName rendered via textContent only, never innerHTML |
| Header injection via filename | Content-Disposition sanitized per RFC 6266 |
| Credential leak in logs | Morgan excludes Authorization header |
| Disk exhaustion | 7-day TTL auto-cleanup + log rotation (10MB x 5) |

## Validation Detail

### Magic Bytes Reference
```
JPEG: FF D8 FF
PNG:  89 50 4E 47 0D 0A 1A 0A
PDF:  25 50 44 46
ZIP/XLSX/DOCX/PPTX: 50 4B 03 04
GIF:  47 49 46 38
```

### Validation Pipeline (fail-fast)
1. Check Content-Length header → reject if > MAX_FILE_SIZE
2. Stream to temp file with size tracking → abort if exceeds limit
3. Read first 8 bytes → detect magic bytes → determine real type
4. Compare detected type against ALLOWED_TYPES whitelist → reject if not in list
5. Extract LAST extension only (multiple dots OK: report.2026.03.24.pdf → .pdf)
6. Check last extension matches detected MIME via whitelist map → reject if mismatch
7. Compute SHA256 hash of file content
8. Generate UUID filename → atomic rename (fs.rename) to UPLOAD_DIR (prevents TOCTOU race)
9. Write .meta.json (with sha256, expiresAt = now + FILE_TTL_DAYS) → log to access.log

## TTL Cleanup
- Cron job or setInterval in server.js: every hour scan .meta.json files
- If now > expiresAt → delete file + meta
- Agent integration: before expiry, agent can `mv /home/client/uploads/<uuid>.ext ~/projects/<project>/` to preserve

## Deploy Steps
1. DNS: A record upload.baikodis.ru → 142.93.239.85
2. Install Caddy: sudo apt install caddy
3. Generate password: openssl rand -base64 32 → caddy hash-password
4. Write Caddyfile to /etc/caddy/Caddyfile
5. cd file-exchange && npm install
6. mkdir -p /home/client/uploads/.logs
7. PM2: pm2 start ecosystem.config.js
8. sudo systemctl restart caddy
9. Test: curl -u admin:pass https://upload.baikodis.ru/api/files

## Integration with AI Assistant
- Files land in /home/client/uploads/
- Assistant reads via Read tool or shell commands
- .meta.json provides original filename and type
- Reverse direction: assistant writes file to uploads dir, user downloads via web UI
- List uploaded files: ls /home/client/uploads/*.meta.json | xargs cat

## Web UI Spec
- Single index.html, zero external dependencies
- Drag-and-drop zone (full-page) + click-to-browse button
- Upload progress bar via XHR onprogress
- File list table: name, size, type, date, download button, delete button
- Human-readable file sizes (KB/MB/GB)
- Responsive layout (mobile-friendly)
- All CSS + JS inline (CSP compliance)
- Error messages shown inline (red), success green
- CRITICAL: all filenames rendered via textContent, NEVER innerHTML (XSS prevention)
- Auto-refresh file list after upload/delete
