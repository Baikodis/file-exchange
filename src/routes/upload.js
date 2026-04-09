import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';

import config from '../config.js';
import { computeSha256, createMetadata, saveMetadata } from '../utils/metadata.js';
import { validateFile } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimit.js';

/** Reverse lookup: MIME type → file extension (no dot). */
const MIME_EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

/** Multer configured to stream to OS temp directory. */
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.maxFileSize },
});

/**
 * Silently remove a file (temp or partial). Ignores missing files.
 */
async function cleanup(filePath) {
  try {
    await fsp.rm(filePath, { force: true });
  } catch {
    // Already gone — fine
  }
}

const router = Router();

/**
 * POST /api/upload
 *
 * Pipeline: rate limit → multer (single file) → validate magic/ext → handler.
 * Handler: UUID rename, SHA-256 hash, metadata write, 201 response.
 */
router.post(
  '/',
  uploadLimiter,
  upload.single('file'),
  validateFile,
  async (req, res) => {
    const tempPath = req.file.path;
    let storedPath = null;

    try {
      // a. Generate UUID
      const id = uuidv4();

      // b. Determine extension from detected MIME
      const ext = MIME_EXT_MAP[req.detectedMime];
      if (!ext) {
        await cleanup(tempPath);
        return res.status(400).json({ error: `No extension mapping for type: ${req.detectedMime}` });
      }

      // c. Stored filename
      const storedName = `${id}.${ext}`;
      storedPath = path.join(config.uploadDir, storedName);

      // d. Compute SHA-256 hash (before rename — file is still in temp)
      const sha256 = await computeSha256(tempPath);

      // e. Atomic rename to upload directory
      await fsp.rename(tempPath, storedPath);

      // f. Set file permissions to 0640 (owner rw, group r, others none)
      await fsp.chmod(storedPath, 0o640);

      // g. Create and save metadata
      // Multer may decode filenames as latin1 (raw bytes) or as proper UTF-8.
      // If the string already has chars > U+00FF (e.g. Cyrillic), it's valid UTF-8 — use as-is.
      // Otherwise, re-decode latin1 bytes as UTF-8.
      const hasUnicode = /[^\x00-\xFF]/.test(req.file.originalname);
      const originalName = hasUnicode
        ? req.file.originalname
        : Buffer.from(req.file.originalname, 'latin1').toString('utf8');

      const metadata = createMetadata({
        id,
        originalName,
        storedName,
        mimeType: req.detectedMime,
        size: req.file.size,
        sha256,
        ip: req.ip,
        ttlDays: config.fileTtlDays,
      });

      await saveMetadata(config.uploadDir, id, metadata);

      // h. Respond 201
      return res.status(201).json({
        id: metadata.id,
        originalName: metadata.originalName,
        size: metadata.size,
        mimeType: metadata.mimeType,
        sha256: metadata.sha256,
        uploadedAt: metadata.uploadedAt,
        expiresAt: metadata.expiresAt,
      });
    } catch (err) {
      // Clean up temp file (may still exist if rename failed)
      await cleanup(tempPath);
      // Clean up stored file (may exist if chmod/metadata step failed)
      if (storedPath) {
        await cleanup(storedPath);
      }
      return res.status(500).json({ error: 'Upload failed' });
    }
  },
);

export default router;
