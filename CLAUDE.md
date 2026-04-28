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
jpeg, png, gif, webp, pdf, xlsx, docx, pptx, odt, txt, csv, zip, json, mp4, mp3, ogg, m4a

## Validation Pipeline
1. Content-Length → reject if > 500MB
2. Magic bytes → detect real MIME
3. MIME vs ALLOWED_TYPES whitelist
4. Last extension matches MIME
5. SHA256 hash
6. UUID rename (atomic, prevents TOCTOU)
7. Write .meta.json

## Добавление нового формата — чеклист

Все 4 точки обязательны, иначе будет ошибка на одном из шагов валидации.

1. `src/middleware/validate.js` → `EXT_MIME_MAP`: добавить `.ext: 'mime/type'`
2. `src/routes/upload.js` → `MIME_EXT_MAP`: добавить `'mime/type': 'ext'` (reverse lookup для сохранения)
3. `.env` → `ALLOWED_TYPES`: дописать `mime/type` в конец списка
4. `.env.example` → `ALLOWED_TYPES`: то же

Особые случаи (magic bytes отличаются от реального MIME):
- ZIP-контейнеры (xlsx, docx, pptx, odt): magic = `application/zip` → override по расширению через `ZIP_BASED_TYPES`
- FTYP-контейнеры (m4a): magic = `video/mp4` → override по расширению через `FTYP_BASED_TYPES`
- Текстовые (txt, csv, json): magic = null → resolve через `TEXT_TYPES`
Если новый формат попадает в эти категории — добавить его в соответствующий Set.

Если формат имеет уникальные magic bytes — добавить сигнатуру в `src/utils/magic.js`.

После правок — перезапуск:
```
kill $(ss -tlnp | grep 3500 | grep -oP 'pid=\K\d+')
```
systemd (Restart=always) перезапустит автоматически через ~5 сек.

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
Нет helmet, dotenv, file-type (удалены при аудите).

## Process Management
PM2 (основной способ перезапуска из sandbox):
- Перезапуск: `PM2_HOME=/tmp/pm2-home pm2 restart file-exchange`
- Если PM2 daemon не запущен: `PM2_HOME=/tmp/pm2-home pm2 start ecosystem.config.cjs`
- Статус: `PM2_HOME=/tmp/pm2-home pm2 status`
- Логи: `PM2_HOME=/tmp/pm2-home pm2 logs file-exchange --lines 50 --nostream`
- ВАЖНО: npx pm2 не работает (EROFS на .npm), использовать глобальный `pm2` с `PM2_HOME=/tmp/pm2-home`

systemd (альтернатива, требует sudo):
- Unit: `file-exchange.service` (`/etc/systemd/system/file-exchange.service`)
- ExecStart: `node --env-file=.env src/server.js`
- Restart=always, RestartSec=5
- Управление: `sudo systemctl restart/stop/status file-exchange`
- Логи: `journalctl -u file-exchange -f`

## Нюансы
- Router монтируется через app.use(), НЕ app.post()
- multer имеет DoS CVE, пакет заброшен — миграция в будущем

## github-release/
Чистая копия проекта без захардкоженных данных (паролей, доменов, путей).
Новые фичи переносятся сюда → пушатся в публичный GitHub-репозиторий.
Синхронизация ручная: после добавления фичи в src/ — скопировать в github-release/src/.
