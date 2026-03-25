import rateLimit from 'express-rate-limit';

/** 10 uploads per minute per IP. */
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
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

/** 5 auth attempts per 15 minutes per IP (defense-in-depth behind Caddy). */
const authLimiter = rateLimit({
  windowMs: 900_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

export { uploadLimiter, deleteLimiter, authLimiter };
