/**
 * Security headers middleware.
 * Sets all headers from spec explicitly — no helmet defaults.
 */
function securityHeaders(req, res, next) {
  // Remove server identification
  res.removeHeader('X-Powered-By');

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
  );

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent framing
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature restrictions
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // CORS — same origin only
  const corsOrigin = process.env.CORS_ORIGIN || `${req.protocol}://${req.get('host')}`;
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);

  next();
}

export { securityHeaders };
