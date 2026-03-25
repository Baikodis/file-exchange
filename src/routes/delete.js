import { Router } from 'express';
import path from 'node:path';

import config from '../config.js';
import { readMetadata, deleteFileAndMeta } from '../utils/metadata.js';
import { deleteLimiter } from '../middleware/rateLimit.js';

const router = Router();

/**
 * DELETE /api/files/:id
 *
 * Deletes a file and its metadata. Rate limited to 5 deletes/min per IP.
 * UUID validation happens inside readMetadata/deleteFileAndMeta.
 */
router.delete('/:id', deleteLimiter, async (req, res) => {
  try {
    // a. Read metadata (validates UUID internally, throws on invalid/missing)
    let metadata;
    try {
      metadata = await readMetadata(config.uploadDir, req.params.id);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // b. Extract extension from storedName (e.g. "uuid.pdf" → ".pdf")
    const ext = path.extname(metadata.storedName);

    // c. Delete file and metadata
    await deleteFileAndMeta(config.uploadDir, req.params.id, ext);

    return res.json({ message: 'File deleted', id: req.params.id });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
