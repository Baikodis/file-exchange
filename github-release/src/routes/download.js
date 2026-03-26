import { Router } from 'express';
import path from 'node:path';
import fsp from 'node:fs/promises';

import config from '../config.js';
import { readMetadata } from '../utils/metadata.js';

/**
 * Sanitize a filename for use in the Content-Disposition header (RFC 6266).
 *
 * Returns an object with two forms:
 * - ascii: stripped to safe ASCII characters for the filename="" parameter
 * - encoded: percent-encoded UTF-8 for the filename*= parameter
 *
 * Dangerous characters (newlines, quotes, semicolons, backslashes) are removed
 * to prevent header injection.
 */
function sanitizeDisposition(originalName) {
  // Strip header-injection characters: CR, LF, ", ;, backslash
  const safe = originalName.replace(/[\r\n"\\;]/g, '');

  // ASCII-only version: replace non-ASCII with underscores
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_');

  // UTF-8 percent-encoded version
  const encoded = encodeURIComponent(safe);

  return { ascii, encoded };
}

const router = Router();

/**
 * GET /api/files/:id
 *
 * Streams the file to the client with proper Content-Disposition (RFC 6266)
 * and security headers. UUID validation happens inside readMetadata.
 */
router.get('/:id', async (req, res) => {
  try {
    // a. Read metadata (validates UUID internally, throws on invalid/missing)
    let metadata;
    try {
      metadata = await readMetadata(config.uploadDir, req.params.id);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // b. Build absolute file path
    const filePath = path.join(config.uploadDir, metadata.storedName);

    // c. Check file exists on disk
    try {
      await fsp.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // d + e. Set Content-Disposition with sanitized filename (RFC 6266)
    const { ascii, encoded } = sanitizeDisposition(metadata.originalName);
    const isAsciiOnly = /^[\x20-\x7E]*$/.test(metadata.originalName.replace(/[\r\n"\\;]/g, ''));

    if (isAsciiOnly) {
      res.set('Content-Disposition', `attachment; filename="${ascii}"`);
    } else {
      // Provide both forms: ASCII fallback + UTF-8 encoded
      res.set(
        'Content-Disposition',
        `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
      );
    }

    // f. Set Content-Type from metadata
    res.set('Content-Type', metadata.mimeType);

    // g. Prevent MIME sniffing
    res.set('X-Content-Type-Options', 'nosniff');

    // h. Stream the file
    return res.sendFile(filePath);
  } catch {
    return res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
