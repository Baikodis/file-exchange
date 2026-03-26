import rateLimit from 'express-rate-limit';
import config from '../config.js';

/** Uploads per minute per IP (from config). */
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimitUploads,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Try again later.' },
});

/** 5 deletes per minute per IP. */
const deleteLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many delete requests. Try again later.' },
});

export { uploadLimiter, deleteLimiter };
