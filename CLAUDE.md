# File Exchange — Secure Upload Service

## Назначение
Файлообмен между клиентом (браузер) и AI-ассистентом (файловая система сервера).

## Архитектура
Browser → Caddy (TLS + Basic Auth) → Node.js :3500 (127.0.0.1) → ./uploads/

## URL
https://upload.baikodis.ru

## API
- POST /api/upload (multipart) → {id, originalName, size, mimeType, sha256, uploadedAt, expiresAt}
- GET /api/files?limit=50&offset=0 → paginated list (max 200)
- GET /api/files/:id → download
- DELETE /api/files/:id → remove (5/min per IP)

## Uploads
Путь: ./uploads/ (резолвится в /home/client/projects/file-exchange/uploads/)
Файлы: <uuid>.<ext> + <uuid>.meta.json
Логи: ./uploads/.logs/access.log
TTL: 7 дней, авточистка каждый час

## Allowed Types
jpeg, png, gif, webp, pdf, xlsx, docx, pptx, odt, txt, csv, zip, json

## Validation Pipeline
1. Content-Length → reject if > 500MB
2. Magic bytes → detect real MIME
3. MIME vs ALLOWED_TYPES whitelist
4. Last extension matches MIME
5. SHA256 hash
6. UUID rename (atomic, prevents TOCTOU)
7. Write .meta.json

## Security
- TLS: Let's Encrypt via Caddy, HSTS
- Auth: Basic Auth bcrypt at Caddy
- Rate limit: 10 uploads/min, 5 deletes/min
- Storage: UUID filenames, 640 perms, outside webroot
- Headers: CSP, nosniff, DENY, strict referrer, CORS from env
- Logging: Authorization header excluded
- XSS: filenames via textContent only, never innerHTML

## Config (.env)
PORT, UPLOAD_DIR, MAX_FILE_SIZE, RATE_LIMIT_UPLOADS, FILE_TTL_DAYS, CORS_ORIGIN, ALLOWED_TYPES

## Dependencies
express ^4.21, multer ^1.4, uuid ^11, express-rate-limit ^7, morgan ^1
PM2 в devDependencies. Нет helmet, dotenv, file-type (удалены при аудите).

## Нюансы
- ecosystem.config.cjs (НЕ .js — package.json type=module)
- Router монтируется через app.use(), НЕ app.post()
- PM2 watch на src/ — авторестарт при правках кода
- multer имеет DoS CVE, пакет заброшен — миграция в будущем

## github-release/
Чистая копия проекта без захардкоженных данных (паролей, доменов, путей).
Новые фичи переносятся сюда → пушатся в публичный GitHub-репозиторий.
Синхронизация ручная: после добавления фичи в src/ — скопировать в github-release/src/.
