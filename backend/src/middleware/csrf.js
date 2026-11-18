const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'gapfinder_csrf';

function getSigningSecret() {
  return process.env.CSRF_SECRET || process.env.JWT_SECRET || 'gapfinder_csrf_fallback_secret';
}

function signTokenValue(rawToken) {
  return crypto.createHmac('sha256', getSigningSecret()).update(rawToken).digest('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = val;
  }
  return cookies;
}

function issueCsrfToken(req, res) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const signature = signTokenValue(rawToken);
  const cookieValue = `${rawToken}.${signature}`;

  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  res.cookie(CSRF_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 1000, // 1 hour
  });

  return res.json({
    success: true,
    csrfToken: rawToken,
  });
}

function requireCsrf(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieValue = cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieValue || !headerToken || typeof headerToken !== 'string') {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
    });
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 2) {
    return res.status(403).json({
      success: false,
      message: 'Malformed CSRF token. Please refresh the page and try again.',
    });
  }

  const [cookieRaw, cookieSig] = parts;
  const expectedSig = signTokenValue(cookieRaw);

  if (!safeEqual(cookieSig, expectedSig) || !safeEqual(headerToken, cookieRaw)) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token verification failed. Please refresh the page and try again.',
    });
  }

  return next();
}

module.exports = {
  issueCsrfToken,
  requireCsrf,
};
