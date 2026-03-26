import { Router } from 'express';
import path from 'node:path';
import fsp from 'node:fs/promises';

import config from '../config.js';

const router = Router();

/**
 * GET /api/files
 *
 * Returns a paginated list of uploaded files sorted by uploadedAt descending.
 * Query params: limit (default 50, max 200), offset (default 0).
 */
router.get('/', async (req, res) => {
  try {
    // a. Parse and validate pagination params
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);

    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    // b. Read upload directory
    let entries;
    try {
      entries = await fsp.readdir(config.uploadDir);
    } catch {
      return res.json({ files: [], total: 0, limit, offset });
    }

    // c. Filter *.meta.json files
    const metaFiles = entries.filter((f) => f.endsWith('.meta.json'));

    if (metaFiles.length === 0) {
      return res.json({ files: [], total: 0, limit, offset });
    }

    // d. Read and parse all metadata files
    const metaPromises = metaFiles.map(async (filename) => {
      try {
        const raw = await fsp.readFile(path.join(config.uploadDir, filename), 'utf8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    });

    const allMeta = (await Promise.all(metaPromises)).filter(Boolean);

    // e. Sort by uploadedAt descending (newest first)
    allMeta.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    const total = allMeta.length;

    // f. Apply pagination
    const files = allMeta.slice(offset, offset + limit).map((m) => ({
      id: m.id,
      originalName: m.originalName,
      size: m.size,
      mimeType: m.mimeType,
      uploadedAt: m.uploadedAt,
      expiresAt: m.expiresAt,
    }));

    return res.json({ files, total, limit, offset });
  } catch {
    return res.status(500).json({ error: 'Failed to list files' });
  }
});

export default router;
