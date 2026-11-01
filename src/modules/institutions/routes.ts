import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery } from '../../lib/http';
import { nullableOptional, pageSchema, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { isSuperAdmin } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeInstitution } from '../../lib/serializers';

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: nullableOptional(1000),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: nullableOptional(1000),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

export async function institutionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/institutions',
    { schema: { tags: ['Institutions'], summary: 'List institutions' } },
    async (request, reply) => {
      const query = parseQuery(
        z.object({
          ...pageSchema,
          status: z.enum(['ACTIVE', 'DISABLED']).optional(),
          search: z.string().trim().max(200).optional(),
        }),
        request.query,
      );
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.institution.count({ where }),
        prisma.institution.findMany({
          where,
          include: { _count: { select: { investments: true } } },
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
          ...paginationArgs(query),
        }),
      ]);
      return reply.send(
        paginated(
          rows.map((row) => ({ ...serializeInstitution(row), investmentCount: row._count.investments })),
          total,
          query,
        ),
      );
    },
  );

  app.post(
    '/institutions',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Institutions'], summary: 'Create an institution' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);
      const existing = await prisma.institution.findUnique({ where: { name: body.name } });
      if (existing) throw AppError.conflict('An institution with this name already exists');
      const created = await prisma.institution.create({
        data: { name: body.name, description: body.description ?? null },
      });
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'INSTITUTION_CREATED',
        entityType: 'INSTITUTION',
        entityId: created.id,
        summary: `Institution ${created.name} created`,
        after: created,
        ipAddress: request.ip,
      });
      return reply.status(201).send({ data: serializeInstitution(created) });
    },
  );

  app.patch(
    '/institutions/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Institutions'], summary: 'Update an institution' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      const body = parseBody(updateSchema, request.body);
      const before = await prisma.institution.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Institution not found');
      if (body.status && !isSuperAdmin(auth)) {
        throw AppError.forbidden('Only a super admin can change institution status');
      }
      if (body.name && body.name !== before.name) {
        const existing = await prisma.institution.findUnique({ where: { name: body.name } });
        if (existing) throw AppError.conflict('An institution with this name already exists');
      }
      const updated = await prisma.institution.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'INSTITUTION_UPDATED',
        entityType: 'INSTITUTION',
        entityId: id,
        summary: `Institution ${updated.name} updated`,
        before,
        after: updated,
        ipAddress: request.ip,
      });
      return reply.send({ data: serializeInstitution(updated) });
    },
  );

  app.delete(
    '/institutions/:id',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Institutions'], summary: 'Disable an unused institution' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      const institution = await prisma.institution.findUnique({
        where: { id },
        include: { _count: { select: { investments: true } } },
      });
      if (!institution) throw AppError.notFound('Institution not found');
      if (institution._count.investments > 0) {
        throw AppError.conflict('Institution has investment records and cannot be removed; disable it instead');
      }
      const updated = await prisma.institution.update({ where: { id }, data: { status: 'DISABLED' } });
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'INSTITUTION_DISABLED',
        entityType: 'INSTITUTION',
        entityId: id,
        summary: `Institution ${updated.name} disabled`,
        before: institution,
        after: updated,
        ipAddress: request.ip,
      });
      return reply.status(204).send();
    },
  );
}
