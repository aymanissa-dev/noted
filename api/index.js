// Vercel serverless entry: every /api/* request is routed here (see vercel.json).
import { createApp } from '../server/src/app.js';
import { connectDB } from '../server/src/lib/db.js';

const app = createApp();

export default async function handler(req, res) {
  if (req.url.startsWith('/api/health')) return app(req, res);
  try {
    await connectDB();
  } catch (err) {
    console.error('DB connection failed:', err.name);
    return res.status(503).json({ error: 'Database unavailable' });
  }
  return app(req, res);
}
