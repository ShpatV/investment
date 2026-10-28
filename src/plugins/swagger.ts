import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Investment Management Platform API',
        description:
          'Role-based API for the client portal, admin portal and super-admin console. ' +
          'Monetary values in responses are decimal numbers rounded to 2 places; calculations are performed with exact decimals.',
        version: '1.0.0',
      },
      servers: [{ url: config.publicBaseUrl, description: 'API server' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth' },
        { name: 'Profile' },
        { name: 'Clients' },
        { name: 'Admins' },
        { name: 'Assignments' },
        { name: 'Institutions' },
        { name: 'Investments' },
        { name: 'Transactions' },
        { name: 'Documents' },
        { name: 'Prices' },
        { name: 'News' },
        { name: 'Dashboard' },
        { name: 'Audit' },
        { name: 'Notifications' },
        { name: 'Settings' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
