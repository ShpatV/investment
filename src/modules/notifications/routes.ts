import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseQuery, parseWith } from '../../lib/http';
import { booleanQuery, pageSchema, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser } from '../../plugins/auth';
import { serializeNotification } from '../../lib/serializers';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/notifications',
    { preHandler: [authenticate], schema: { tags: ['Notifications'], summary: 'List own notifications' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(
        z.object({ ...pageSchema, unread: booleanQuery }),
        request.query,
      );
      const where = { userId: auth.id, ...(query.unread ? { readAt: null } : {}) };
      const [total, rows, unreadCount] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginationArgs(query),
        }),
        prisma.notification.count({ where: { userId: auth.id, readAt: null } }),
      ]);

      return reply.send({
        ...paginated(rows.map(serializeNotification), total, query),
        unreadCount,
      });
    },
  );

  app.patch(
    '/notifications/:id/read',
    { preHandler: [authenticate], schema: { tags: ['Notifications'], summary: 'Mark a notification as read' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const existing = await prisma.notification.findFirst({ where: { id, userId: auth.id } });
      if (!existing) throw AppError.notFound('Notification not found');
      const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: existing.readAt ?? new Date() },
      });
      return reply.send({ data: serializeNotification(updated) });
    },
  );

  app.post(
    '/notifications/read-all',
    { preHandler: [authenticate], schema: { tags: ['Notifications'], summary: 'Mark all notifications as read' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const result = await prisma.notification.updateMany({
        where: { userId: auth.id, readAt: null },
        data: { readAt: new Date() },
      });
      return reply.send({ data: { updated: result.count } });
    },
  );
}
