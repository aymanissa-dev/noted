import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import folderRoutes from './routes/folders.js';
import statsRoutes from './routes/stats.js';
import audioRoutes from './routes/audio.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', true); // Vercel's edge sets X-Forwarded-For (used only for the masked IP in login activity)
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || '*' }));
  app.use(express.json({ limit: '10mb' }));
  // API responses are per-user and change constantly: never let browsers, proxies, or the SW cache them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
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
  app.use('/api/notes', noteRoutes);
  app.use('/api/folders', folderRoutes);
  app.use('/api/stats', statsRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
