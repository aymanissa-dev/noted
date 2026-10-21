export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) this.extra = extra;
  }
}

// Sign-up failures that must not reveal whether an account exists (see routes/auth.js).
export const REGISTER_FAILED = 'We couldn’t create an account with these details. If you already have an account, log in instead.';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (err.name === 'ValidationError') status = 400;
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; }
  if (err.code === 11000) { // duplicate key: a sign-up racing another for the same email says nothing specific
    if (err.keyPattern?.email) { status = 400; message = REGISTER_FAILED; } else { status = 409; message = 'That already exists'; }
  }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON'; }
  if (status >= 500) console.error(err);
  if (status === 429 && err.extra?.retryAfter) res.set('Retry-After', String(err.extra.retryAfter));
  res.status(status).json({ error: status >= 500 ? 'Server error' : message, ...(status < 500 && err.extra) });
}
