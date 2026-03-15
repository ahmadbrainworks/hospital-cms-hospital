import { Router } from 'express';
import { Db } from 'mongodb';
import { existsSync } from 'node:fs';
import { logger } from '@hospital-cms/logger';

const LOCK_FILE =
  process.env['INSTALLER_LOCK_FILE'] ??
  `${process.env['HOME'] ?? '/home/ahmad'}/hospital-cms/installer.lock`;

const log = logger('api:health');

export function healthRouter(db: Db): Router {
  const router = Router();

  // GET /health — basic liveness
  router.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      isInstalled: existsSync(LOCK_FILE),
      timestamp: new Date().toISOString(),
    });
  });

  // GET /health/ready — readiness (db connectivity)
  router.get('/ready', async (_req, res) => {
    try {
      await db.command({ ping: 1 });
      res.status(200).json({
        status: 'ready',
        db: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, 'Readiness check failed');
      res.status(503).json({
        status: 'not_ready',
        db: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // GET /health/live — Kubernetes liveness probe
  router.get('/live', (_req, res) => {
    res.status(200).json({ status: 'live' });
  });

  return router;
}
