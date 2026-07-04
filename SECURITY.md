# Security

File Exchange is built to be safe to expose to the public internet behind a
reverse proxy. This document summarizes the security posture and the outcome of
an internal security review.

## Transport & access
- All traffic over TLS 1.2+/1.3 (Let's Encrypt); HTTP is redirected to HTTPS
- Every endpoint is protected by Basic Auth at the reverse-proxy layer
- The Node app binds to `127.0.0.1` only and is never exposed directly

## Secrets & configuration
- No secrets in the codebase — all configuration comes from environment
  variables in a git-ignored `.env`
- `.env`, `uploads/`, logs and `node_modules/` are git-ignored
- The Basic Auth password is generated at deploy time and stored only as a
  bcrypt hash; nothing sensitive is committed

## Upload safety
- Magic-bytes + extension cross-check — file-type spoofing is rejected
- UUID-based storage — path traversal is not possible
- `Content-Disposition` sanitized per RFC 6266
- SHA-256 content hash stored for every upload
- Automatic TTL cleanup removes expired files

## Web UI
- Rendering is 100% `textContent` — no `innerHTML` / `eval` / `document.write`
- CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` headers set
- No cookies, no third-party resources, no tracking

## Known limitations
- `multer@1.x` carries known DoS advisories with no upstream fix. Uploads are
  rate-limited per IP and the process manager auto-restarts on crash.

## Reporting
Found a security issue? Please open an issue (without sensitive details) or
reach out via the contact listed on the profile.
