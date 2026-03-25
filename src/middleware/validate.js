import { readFile, unlink } from 'node:fs/promises';
import { detectMimeType } from '../utils/magic.js';
import config from '../config.js';

/**
 * Extension-to-MIME mapping.
 * Used to verify that the file extension matches the detected binary type,
 * and to identify text-based files (txt, csv, json) that lack magic bytes.
 */
const EXT_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.json': 'application/json',
};

/** Text MIME types that have no magic bytes signature. */
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'application/json']);

/**
 * ZIP-based OOXML types — magic bytes detect as application/zip,
 * but the real type is determined by extension.
 */
const ZIP_BASED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/**
 * Extract the LAST extension from a filename.
 * Multiple dots are OK: report.2026.03.24.pdf → .pdf
 */
function getLastExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Delete the temporary file uploaded by multer.
 */
async function removeTempFile(filePath) {
  try {
    await unlink(filePath);
  } catch {
    // File may already be gone — ignore
  }
}

/**
 * File validation middleware (runs AFTER multer).
 *
 * Fail-fast pipeline:
 * 1. Read first 12 bytes → detect MIME via magic bytes
 * 2. Check detected type against allowedTypes whitelist
 * 3. For text types (magic returns null): resolve via extension
 * 4. Verify last extension matches detected MIME
 * 5. Attach detectedMime to req on success
 */
async function validateFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { path: tempPath, originalname } = req.file;

  try {
    // Step 1: Read first 12 bytes and detect magic bytes
    const header = await readFile(tempPath).then((buf) => buf.subarray(0, 12));
    let detectedMime = detectMimeType(header);

    // Step 2: Extract last extension
    const ext = getLastExtension(originalname);
    if (!ext) {
      await removeTempFile(tempPath);
      return res.status(400).json({ error: 'File has no extension' });
    }

    const extMime = EXT_MIME_MAP[ext];
    if (!extMime) {
      await removeTempFile(tempPath);
      return res.status(400).json({ error: `Unsupported file extension: ${ext}` });
    }

    // Step 3: Text types — magic returns null, resolve via extension
    if (detectedMime === null) {
      if (TEXT_TYPES.has(extMime)) {
        detectedMime = extMime;
      } else {
        await removeTempFile(tempPath);
        return res.status(400).json({ error: 'File content does not match any allowed type' });
      }
    }

    // Step 4: ZIP-based OOXML — magic detects as zip, real type from extension
    if (detectedMime === 'application/zip' && ZIP_BASED_TYPES.has(extMime)) {
      detectedMime = extMime;
    }

    // Step 5: Check detected type against allowed whitelist
    if (!config.allowedTypes.includes(detectedMime)) {
      await removeTempFile(tempPath);
      return res.status(400).json({ error: `File type not allowed: ${detectedMime}` });
    }

    // Step 6: Verify extension matches detected MIME
    if (extMime !== detectedMime) {
      await removeTempFile(tempPath);
      return res.status(400).json({
        error: `Extension mismatch: ${ext} does not match detected type ${detectedMime}`,
      });
    }

    // Validation passed — attach detected MIME for downstream use
    req.detectedMime = detectedMime;
    next();
  } catch (err) {
    await removeTempFile(tempPath);
    return res.status(500).json({ error: 'Validation failed' });
  }
}

export { validateFile };
