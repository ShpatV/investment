import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config';
import { prisma } from './lib/prisma';
import { registerAuth } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';
import { registerSwagger } from './plugins/swagger';
import { authRoutes } from './modules/auth/routes';
import { profileRoutes } from './modules/profile/routes';
import { clientRoutes } from './modules/clients/routes';
import { adminRoutes } from './modules/admins/routes';
import { assignmentRoutes } from './modules/assignments/routes';
import { institutionRoutes } from './modules/institutions/routes';
import { investmentRoutes } from './modules/investments/routes';
import { transactionRoutes } from './modules/transactions/routes';
import { documentRoutes } from './modules/documents/routes';
import { priceRoutes } from './modules/prices/routes';
import { newsRoutes } from './modules/news/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { auditRoutes } from './modules/audit/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { settingRoutes } from './modules/settings/routes';
import { ensureStorageDir } from './lib/storage';

export interface BuildOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["idempotency-key"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.newPassword',
                'req.body.currentPassword',
                'req.body.refreshToken',
                'req.body.securityAnswer',
              ],
              censor: '[redacted]',
            },
            ...(config.isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
                  },
                }),
          },
    trustProxy: config.trustProxy,
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // No Origin header (curl, server-to-server) is allowed; unknown browser
      // origins simply receive no CORS headers instead of a 500 error.
      callback(null, !origin || config.corsOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health' || request.url === '/ready',
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 20,
      parts: 25,
    },
  });

  await registerAuth(app);
  await ensureStorageDir();

  if (!config.isProduction) {
    await registerSwagger(app);
  }

  app.get(
    '/',
    { schema: { hide: true } },
    async () => ({
      name: 'Investment Management Platform API',
      version: '1.0.0',
      docs: config.isProduction ? null : '/docs',
      health: '/health',
    }),
  );

  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  }));

  app.get('/ready', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ready', database: 'connected' });
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: 'unavailable' });
    }
  });

  await registerErrorHandler(app);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(profileRoutes);
      await api.register(clientRoutes);
      await api.register(adminRoutes);
      await api.register(assignmentRoutes);
      await api.register(institutionRoutes);
      await api.register(investmentRoutes);
      await api.register(transactionRoutes);
      await api.register(documentRoutes);
      await api.register(priceRoutes);
      await api.register(newsRoutes);
      await api.register(dashboardRoutes);
      await api.register(auditRoutes);
      await api.register(notificationRoutes);
      await api.register(settingRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
