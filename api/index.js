// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
import { createApp } from '../server/src/app.js';
import { connectDB } from '../server/src/lib/db.js';

const app = createApp();

let invocations = 0;

export default async function handler(req, res) {
  invocations += 1;
  // Server-Timing exposes where time goes (visible in browser devtools / curl -I).
  res.locals = res.locals || {};
  res.serverTiming = [`inst;desc="${invocations === 1 ? 'cold' : 'warm'}"`];
  if (req.url.startsWith('/api/health')) return app(req, res);
  try {
    const t = performance.now();
    await connectDB();
    res.serverTiming.push(`db-connect;dur=${(performance.now() - t).toFixed(1)}`);
  } catch (err) {
    console.error('DB connection failed:', err.name, err.code ?? '', err.codeName ?? '');
    return res.status(503).json({ error: 'Database unavailable' });
  }
  return app(req, res);
}
