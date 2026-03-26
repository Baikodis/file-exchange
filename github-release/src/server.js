import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

import config from './config.js';
import { securityHeaders } from './middleware/headers.js';
import { httpLogger, log } from './utils/logger.js';
import { deleteFileAndMeta } from './utils/metadata.js';

import uploadRouter from './routes/upload.js';
import listRouter from './routes/list.js';
import downloadRouter from './routes/download.js';
import deleteRouter from './routes/delete.js';

/* ── __dirname equivalent for ESM ── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── Express app ── */
const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(securityHeaders);
app.use(httpLogger);
app.use(express.static(path.join(__dirname, 'public')));

/* ── Routes ── */
app.use('/api/upload', uploadRouter);
app.use('/api/files', listRouter);       // GET /api/files
app.use('/api/files', downloadRouter);   // GET /api/files/:id
app.use('/api/files', deleteRouter);     // DELETE /api/files/:id

/* ── Multer error handler ── */
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Maximum size: ${config.maxFileSize} bytes` });
    }
    return res.status(400).json({ error: err.message });
  }

  log('error', 'Unhandled error', { message: err.message });
  return res.status(500).json({ error: 'Internal server error' });
});

/* ── Ensure upload directory + logs directory exist ── */
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(path.join(config.uploadDir, '.logs'), { recursive: true });

/* ── TTL Cleanup (every hour) ── */
const ONE_HOUR = 60 * 60 * 1000;

async function cleanupExpiredFiles() {
  try {
    const entries = await fsp.readdir(config.uploadDir);
    const metaFiles = entries.filter((f) => f.endsWith('.meta.json'));

    for (const metaFile of metaFiles) {
      try {
        const raw = await fsp.readFile(path.join(config.uploadDir, metaFile), 'utf8');
        const meta = JSON.parse(raw);

        if (new Date() > new Date(meta.expiresAt)) {
          const ext = path.extname(meta.storedName);
          await deleteFileAndMeta(config.uploadDir, meta.id, ext);
          log('info', 'TTL cleanup: deleted expired file', {
            id: meta.id,
            originalName: meta.originalName,
            expiresAt: meta.expiresAt,
          });
        }
      } catch (err) {
        // Corrupt meta file — log and skip, don't crash
        log('warn', `TTL cleanup: failed to process ${metaFile}`, {
          error: err.message,
        });
      }
    }
  } catch (err) {
    log('error', 'TTL cleanup: failed to read upload directory', {
      error: err.message,
    });
  }
}

setInterval(cleanupExpiredFiles, ONE_HOUR);

// Run once at startup (after brief delay so server is ready)
setTimeout(cleanupExpiredFiles, 5_000);

/* ── Start server ── */
app.listen(config.port, '127.0.0.1', () => {
  log('info', `File Exchange server started on port ${config.port}`, {
    uploadDir: config.uploadDir,
    maxFileSize: config.maxFileSize,
    fileTtlDays: config.fileTtlDays,
    allowedTypes: config.allowedTypes.length,
  });
});
