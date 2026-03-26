import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that id is a proper UUID. Prevents path traversal.
 * @param {string} id
 * @throws {Error} if id is not a valid UUID
 */
function validateUUID(id) {
  if (!UUID_RE.test(id)) {
    throw new Error(`Invalid file ID: ${id}`);
  }
}

/**
 * Compute SHA-256 hash of a file using streaming (safe for large files).
 * @param {string} filePath — absolute path to the file
 * @returns {Promise<string>} hex-encoded SHA-256 hash
 */
function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Create a metadata object matching the spec format.
 * @param {object} params
 * @param {string} params.id — UUID
 * @param {string} params.originalName
 * @param {string} params.storedName — e.g. "uuid.pdf"
 * @param {string} params.mimeType
 * @param {number} params.size — bytes
 * @param {string} params.sha256 — hex hash
 * @param {string} params.ip — uploader IP
 * @param {number} params.ttlDays — days until expiry
 * @returns {object} metadata object
 */
function createMetadata({ id, originalName, storedName, mimeType, size, sha256, ip, ttlDays }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    id,
    originalName,
    storedName,
    mimeType,
    size,
    sha256,
    uploadedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ip,
  };
}

/**
 * Write metadata JSON to disk.
 * @param {string} uploadDir — base upload directory
 * @param {string} id — file UUID
 * @param {object} metadata — metadata object
 */
async function saveMetadata(uploadDir, id, metadata) {
  validateUUID(id);
  const metaPath = path.join(uploadDir, `${id}.meta.json`);
  await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o640 });
}

/**
 * Read and parse metadata JSON from disk.
 * @param {string} uploadDir — base upload directory
 * @param {string} id — file UUID
 * @returns {Promise<object>} parsed metadata
 */
async function readMetadata(uploadDir, id) {
  validateUUID(id);
  const metaPath = path.join(uploadDir, `${id}.meta.json`);
  const raw = await fsp.readFile(metaPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Delete both the uploaded file and its metadata.
 * @param {string} uploadDir — base upload directory
 * @param {string} id — file UUID
 * @param {string} ext — file extension (e.g. ".pdf")
 */
async function deleteFileAndMeta(uploadDir, id, ext) {
  validateUUID(id);
  const normalizedExt = ext.startsWith('.') ? ext : '.' + ext;
  const filePath = path.join(uploadDir, `${id}${normalizedExt}`);
  const metaPath = path.join(uploadDir, `${id}.meta.json`);

  await Promise.all([
    fsp.rm(filePath, { force: true }),
    fsp.rm(metaPath, { force: true }),
  ]);
}

export { computeSha256, createMetadata, saveMetadata, readMetadata, deleteFileAndMeta };
