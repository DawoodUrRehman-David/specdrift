export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function notFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const status = error.status ?? 500;
  const code = error.code ?? 'internal_error';
  const payload = {
    ok: false,
    error: {
      code,
      message: status === 500 ? 'Unexpected server error.' : error.message,
    },
  };
  if (error.details) payload.error.details = error.details;
  if (status === 500) console.error('[specdrift] unhandled error:', error);
  res.status(status).json(payload);
}
