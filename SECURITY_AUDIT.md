# Security Audit — upload.baikodis.ru
# Date: 2026-03-26
# Status: review only, no fixes applied

## Summary
- 0 critical (password in git history — already rotated 3x)
- 1 high (multer CVE, accepted risk, PM2 restarts on crash)
- 8 medium (details below)
- Overall: система крепкая, пароль 256 бит + bcrypt cost 14 = брутфорс нереален

## Passed ✓
- Port 3500 bound 127.0.0.1, not exposed
- TLS 1.2+/1.3, ECDHE forward secrecy, Let's Encrypt ECDSA P-256
- Port 80 → 308 redirect to HTTPS
- All endpoints require Basic Auth (401 without creds)
- UUID validation — path traversal impossible
- Magic bytes + extension cross-check — type spoofing impossible
- Content-Disposition sanitized (CR/LF/quotes/semicolons stripped, RFC 6266)
- Web UI — 100% textContent, zero innerHTML/eval/document.write
- JSON.stringify — metadata injection impossible
- No cookies, no external resources, no mixed content
- TTL cleanup works, log rotation configured
- github-release/ clean, no secrets
- .gitignore covers .env, uploads/, node_modules/, logs

## HIGH — Multer 3x DoS CVE (accepted)
- multer@1.4.4-lts.1: GHSA-4pg4-qvpc-4q3h, GHSA-g5hg-p3ph-g8qg, GHSA-fjgf-rc76-4x9p
- No upstream fix. PM2 auto-restarts on crash
- Alternative: migrate to busboy or formidable (decided: won't do)

## MEDIUM findings

### 1. No brute-force rate limit at Caddy layer
- Basic Auth checked by Caddy before Express → Express never sees failed attempts
- Bcrypt cost=14 makes brute force mathematically impractical (256-bit password)
- Fix: fail2ban watching Caddy logs, 3 attempts/min → 5 min ban → 24h ban

### 2. Server header leaks on 401
- `-Server` in Caddy header block only applies to proxied responses
- Caddy's own 401 responses include `Server: Caddy`
- Impact: info disclosure (attacker knows reverse proxy type)
- Fix: move header block to global options or before basicauth

### 3. HSTS missing on Caddy 401 responses
- Same root cause as #2 — security headers only on proxied responses
- First visit over HTTP vulnerable to MITM downgrade (until redirect)
- Fix: same as #2

### 4. No CAA DNS record
- Any CA can issue cert for upload.baikodis.ru
- Risk: low (CAs validate domain ownership, CT logs make rogue certs visible)
- Fix: add DNS CAA record `0 issue "letsencrypt.org"`

### 5. CORS origin fallback reflects Host header
- Without CORS_ORIGIN env var, falls back to req.protocol://req.get('host')
- Production .env has CORS_ORIGIN set → mitigated in prod
- Fix: remove fallback, require CORS_ORIGIN or hardcode

### 6. Multer fields/parts not limited
- upload.single('file') limits to 1 file, but no limit on non-file form fields
- Attacker can send thousands of text fields → memory pressure
- Fix: add `fields: 5, parts: 10` to multer limits (1 line)

### 7. Multer error messages passed to client
- err.message from MulterError goes directly to JSON response
- Minor info disclosure of internal error strings
- Fix: replace with generic "Upload failed" for non-size errors

### 8. GET /api/files reads all meta files on every request
- readdir + readFile for every .meta.json, then sort, then paginate
- With TTL 7 days and single user: not a real problem
- No rate limit on this endpoint (but behind auth, so low risk)
- Fix: not needed for current scale

## LOW findings
- Null bytes in filename not sanitized before metadata storage (no practical exploit)
- No CSRF tokens (mitigated by Basic Auth)
- Rate limit uses 1-minute fixed window (not sliding)
- No startup permission integrity check for legacy files

## Input validation results (all passed)
- Path traversal via file ID: UUID regex blocks (`^[0-9a-f-]{36}$`)
- Content-Disposition injection: CR/LF/quotes/semicolons stripped
- Polyglot files: mitigated by attachment + nosniff
- Extension spoofing: magic bytes + extension must match
- Double extensions (file.pdf.exe): last extension only → .exe rejected
- Unicode RTL override: textContent renders safely
- XSS via upload response: JSON content-type + nosniff
- Pagination abuse: limit capped at 200, offset validated
- Metadata JSON injection: JSON.stringify is inherently safe
- Web UI: zero innerHTML, zero eval, zero document.write

## Network scan results
- Port 3500: closed externally (bind 127.0.0.1) ✓
- Port 80: open (Caddy, redirects to 443) ✓
- Port 443: open (Caddy, TLS 1.2+/1.3) ✓
- TLS cipher suites: ECDHE + AES-GCM/ChaCha20 ✓
- Certificate: Let's Encrypt ECDSA P-256, CT compliant ✓
- OCSP stapling: not yet active (Caddy lazy-loads)

## Git audit
- No secrets in current code ✓
- Historical: password was in deploy.sh/setup-caddy.sh, removed in commit 046014b
- Password already rotated 3x on production — no risk
- github-release/ is a clean copy, no history exposure
