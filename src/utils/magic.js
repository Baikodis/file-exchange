/**
 * Magic bytes detection for file type validation.
 *
 * Binary signatures per spec:
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   PDF:  25 50 44 46
 *   ZIP/XLSX/DOCX/PPTX: 50 4B 03 04
 *   GIF:  47 49 46 38
 *
 * Text types (txt, csv, json) have no magic bytes —
 * accepted if no binary signature is detected.
 */

const SIGNATURES = [
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' }, // also xlsx, docx, pptx
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
];

// WebP has RIFF....WEBP structure — special case
function isWebP(buf) {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50   // P
  );
}

/**
 * Detect MIME type from a buffer's magic bytes.
 *
 * @param {Buffer} buffer — at least the first 12 bytes of the file
 * @returns {string|null} Detected MIME type, or null for text-like files (no binary signature)
 */
function detectMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  // Check WebP first (RIFF container)
  if (isWebP(buffer)) return 'image/webp';

  // Check standard signatures (ordered longest-first via array order)
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    const match = sig.bytes.every((byte, i) => buffer[i] === byte);
    if (match) return sig.mime;
  }

  // No binary signature detected → could be a text type (txt, csv, json)
  return null;
}

export { detectMimeType };
