import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseQuery, parseWith } from '../../lib/http';
import { pageSchema, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { assignedClientIds, assertClientAccess } from '../../lib/scope';
import { serializeAudit } from '../../lib/serializers';

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) throw AppError.validation(`Invalid date: ${value}`);
  if (endOfDay && isDateOnly) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function auditFilterFor(user: ReturnType<typeof currentUser>) {
  if (user.role === 'SUPER_ADMIN') return {};
  const ids = await assignedClientIds(user.id);
  return {
    OR: [{ actorId: user.id }, ...(ids.length > 0 ? [{ clientId: { in: ids } }] : [])],
  } satisfies Prisma.AuditLogWhereInput;
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/audit-logs',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Audit'], summary: 'Search the append-only audit log' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(
        z.object({
          ...pageSchema,
          action: z.string().trim().max(100).optional(),
          entityType: z.string().trim().max(60).optional(),
          entityId: z.string().trim().max(100).optional(),
          actorId: uuidSchema.optional(),
          clientId: uuidSchema.optional(),
          outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
          from: z.string().trim().optional(),
          to: z.string().trim().optional(),
        }),
        request.query,
      );

      if (query.clientId && auth.role !== 'SUPER_ADMIN') {
        await assertClientAccess(auth, query.clientId);
      }
      const from = parseDate(query.from);
      const to = parseDate(query.to, true);
      if (from && to && from >= to) throw AppError.validation('The "from" date must be before the "to" date');

      const filters: Prisma.AuditLogWhereInput = {
        ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.outcome ? { outcome: query.outcome } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      };
      const scope = await auditFilterFor(auth);
      const where: Prisma.AuditLogWhereInput = { AND: [filters, scope] };

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
          ...paginationArgs(query),
        }),
      ]);

      return reply.send(paginated(logs.map(serializeAudit), total, query));
    },
  );

  app.get(
    '/audit-logs/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Audit'], summary: 'Get one audit event' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(
        z.object({ id: z.string().regex(/^\d+$/, 'Invalid audit event id') }),
        request.params,
        'params',
      );
      const scope = await auditFilterFor(auth);
      const log = await prisma.auditLog.findFirst({
        where: { AND: [{ id: BigInt(id) }, scope] },
        include: { actor: true },
      });
      if (!log) throw AppError.notFound('Audit event not found');
      return reply.send({ data: serializeAudit(log) });
    },
  );
}
