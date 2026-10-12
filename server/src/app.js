import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || '*' }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/notes', noteRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
