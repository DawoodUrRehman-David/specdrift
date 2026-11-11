import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { reportsRouter } from './routes/reports.js';
import { connectionState } from './db.js';
import { errorHandler, notFound } from './middleware/error.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: '8mb' }));
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? true,
      methods: ['GET', 'POST'],
    }),
  );

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      data: {
        service: 'specdrift-api',
        status: 'up',
        db: connectionState(),
        uptime: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? '0.1.0',
      },
    });
  });

  app.use('/api', reportsRouter);

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get(['/', '/r/:slug'], (req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
