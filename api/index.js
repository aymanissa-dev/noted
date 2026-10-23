// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
import { createApp, serverTimingOn } from '../server/src/app.js';
import { connectDB } from '../server/src/lib/db.js';

const app = createApp();
// Cold start: open the database connection while the instance finishes starting, instead of after the
// first request arrives (the request still awaits it; a failure is retried there).
if (process.env.MONGODB_URI) connectDB().catch(() => {});

let invocations = 0;

export default async function handler(req, res) {
  invocations += 1;
  // Server-Timing exposes where time goes (visible in browser devtools / curl -I).
  res.locals = res.locals || {};
  res.serverTiming = [];
  const timing = serverTimingOn(); // never in production (see app.js)
  if (timing) res.serverTiming.push(`inst;desc="${invocations === 1 ? 'cold' : 'warm'}"`);
  if (req.url.startsWith('/api/health')) return app(req, res);
  try {
    const t = performance.now();
    await connectDB();
    if (timing) res.serverTiming.push(`db-connect;dur=${(performance.now() - t).toFixed(1)}`);
  } catch (err) {
    console.error('DB connection failed:', err.name, err.code ?? '', err.codeName ?? '');
    return res.status(503).json({ error: 'Database unavailable' });
  }
  return app(req, res);
}
