import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');

const config = {
  port: parseInt(process.env.PORT, 10) || 3500,

  uploadDir: path.resolve(process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR),

  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 524_288_000,

  rateLimitUploads: parseInt(process.env.RATE_LIMIT_UPLOADS, 10) || 10,

  fileTtlDays: parseInt(process.env.FILE_TTL_DAYS, 10) || 7,

  allowedTypes: process.env.ALLOWED_TYPES
    ? process.env.ALLOWED_TYPES.split(',').map((t) => t.trim())
    : [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/json',
      ],
};

export default config;
