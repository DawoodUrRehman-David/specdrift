import rateLimit from 'express-rate-limit';

export const diffLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: { code: 'rate_limited', message: 'Too many diff requests. Try again in a minute.' } },
});

export const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.SAVE_LIMIT_PER_10MIN ?? 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: { code: 'rate_limited', message: 'Too many saved reports. Try again later.' } },
});
