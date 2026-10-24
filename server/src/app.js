import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import folderRoutes from './routes/folders.js';
import statsRoutes from './routes/stats.js';
import audioRoutes from './routes/audio.js';
import imageRoutes from './routes/images.js';
import { notFound, errorHandler } from './middleware/error.js';

// CORS: the app calls its API same-origin, so cross-origin access is only for known front ends:
// CLIENT_URL (comma-separated, e.g. the production URL), this project's Vercel preview deployments,
// and localhost when not running on Vercel (local dev/QA). Anything else gets no CORS headers.
const PREVIEW_ORIGIN = /^https:\/\/noted-[a-z0-9-]+-ayman-issa-s-workspace\.vercel\.app$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export function allowedOrigin(origin) {
  if (!origin) return true; // same-origin and non-browser requests
  const list = (process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (list.includes(origin) || PREVIEW_ORIGIN.test(origin)) return true;
  return !process.env.VERCEL && LOCAL_ORIGIN.test(origin);
}
// Server-Timing helps local/preview debugging but tells anyone where time goes: off in production.
export const serverTimingOn = () => process.env.VERCEL_ENV !== 'production' && process.env.SERVER_TIMING !== 'off';

export function createApp() {
  const app = express();
  app.set('trust proxy', true); // Vercel's edge sets X-Forwarded-For (used only for the masked IP in login activity)
  // The API only returns JSON and audio: it never needs to load anything or be framed. Same strength as
  // the pages (vercel.json): HSTS 2 years with preload, deny framing, no sniffing.
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    frameguard: { action: 'deny' },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));
  app.use(cors({ origin: (origin, cb) => cb(null, allowedOrigin(origin)) }));
  app.use(express.json({ limit: '10mb' }));
  // API responses are per-user and change constantly: never let browsers, proxies, or the SW cache them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!serverTimingOn()) return next();
    // Server-Timing: total app time (+ any entries added earlier, e.g. db-connect in the serverless entry).
    const start = performance.now();
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      const parts = [...(res.serverTiming || []), `app;dur=${(performance.now() - start).toFixed(1)}`];
      res.setHeader('Server-Timing', parts.join(', '));
      return writeHead.apply(this, args);
    };
    next();
  });
  app.set('etag', false);
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api', audioRoutes); // /api/notes/:id/audio, /api/audio/:clipId
  app.use('/api', imageRoutes); // /api/notes/:id/images, /api/images/:imageId
  app.use('/api/notes', noteRoutes);
  app.use('/api/folders', folderRoutes);
  app.use('/api/stats', statsRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
