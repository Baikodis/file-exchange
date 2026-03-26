import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import morgan from 'morgan';
import config from '../config.js';

const LOG_DIR = path.join(config.uploadDir, '.logs');
const LOG_FILE = path.join(LOG_DIR, 'access.log');
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

/** Ensure log directory exists (sync, called once at startup). */
fs.mkdirSync(LOG_DIR, { recursive: true });

/** Rotate log files: access.log → access.log.1 → … → access.log.5 (oldest deleted). */
async function rotate() {
  try {
    const stat = await fsp.stat(LOG_FILE);
    if (stat.size < MAX_SIZE) return;
  } catch {
    return; // file doesn't exist yet
  }

  // Remove oldest
  const oldest = `${LOG_FILE}.${MAX_FILES}`;
  await fsp.rm(oldest, { force: true });

  // Shift .4 → .5, .3 → .4, … .1 → .2
  for (let i = MAX_FILES - 1; i >= 1; i--) {
    const src = `${LOG_FILE}.${i}`;
    const dst = `${LOG_FILE}.${i + 1}`;
    try {
      await fsp.rename(src, dst);
    } catch {
      // file may not exist, skip
    }
  }

  // Current → .1
  await fsp.rename(LOG_FILE, `${LOG_FILE}.1`);
}

/** Write stream that checks rotation before each write. */
function createLogStream() {
  let stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  let rotating = false;

  const writable = {
    write(line) {
      // Check rotation asynchronously; guard against concurrent rotations
      if (!rotating) {
        let needsRotation = false;
        try {
          const stat = fs.statSync(LOG_FILE);
          needsRotation = stat.size >= MAX_SIZE;
        } catch {
          // File doesn't exist yet, no rotation needed
        }

        if (needsRotation) {
          rotating = true;
          rotate()
            .then(() => {
              // Reopen stream after rotation
              stream.end();
              stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
              stream.write(line);
            })
            .catch(() => {
              // Rotation failed; keep writing to current stream
              stream.write(line);
            })
            .finally(() => {
              rotating = false;
            });
          return true;
        }
      }

      stream.write(line);
      return true;
    },
  };

  return writable;
}

const logStream = createLogStream();

/**
 * Morgan middleware — JSON lines format.
 * CRITICAL: Authorization header is excluded from the output.
 */
const httpLogger = morgan(
  (tokens, req, res) => {
    const entry = {
      timestamp: new Date().toISOString(),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: parseInt(tokens.status(req, res), 10) || 0,
      responseTime: parseFloat(tokens['response-time'](req, res)) || 0,
      ip: req.ip || req.socket?.remoteAddress || '-',
      contentLength: tokens.res(req, res, 'content-length') || '-',
    };
    return JSON.stringify(entry);
  },
  { stream: logStream },
);

/**
 * App-level structured logger.
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {object} [data]
 */
function log(level, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  logStream.write(JSON.stringify(entry) + '\n');
}

export { httpLogger, log };
