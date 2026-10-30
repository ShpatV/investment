import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Db } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery, parseWith } from '../../lib/http';
import { pageSchema, trimmedOptional, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { assignmentWhereFor, isSuperAdmin } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeAssignment, serializeUser } from '../../lib/serializers';
import { notify } from '../../services/notifications';
import { SETTING_KEYS, getBooleanSetting } from '../../services/settings';

const createSchema = z.object({
  clientId: uuidSchema,
  adminId: uuidSchema,
  notes: trimmedOptional(1000),
});

const updateSchema = z
  .object({
    adminId: uuidSchema.optional(),
    status: z.enum(['ACTIVE', 'REMOVED']).optional(),
    notes: trimmedOptional(1000),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

const assignmentInclude = {
  client: true,
  admin: true,
  assignedBy: true,
} as const;

async function assertAssignableAdmin(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') || admin.status !== 'ACTIVE') {
    throw AppError.validation('Selected administrator is not an active administrator');
  }
  return admin;
}

type AssignmentDb = Pick<Db, 'adminAssignment'>;

/**
 * Serialises assignment changes per client. Without this, two concurrent
 * requests can both see no active assignment and create two ACTIVE rows,
 * leaving a client visible to two advisors at once.
 */
async function lockClientAssignments(db: Db, clientId: string): Promise<void> {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`assignment:${clientId}`}))::text`;
}

async function activeAssignmentFor(clientId: string, db: AssignmentDb = prisma) {
  return db.adminAssignment.findFirst({
    where: { clientId, status: 'ACTIVE' },
    include: assignmentInclude,
  });
}

export async function assignmentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/assignments',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'List client assignments' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(
        z.object({
          ...pageSchema,
          adminId: uuidSchema.optional(),
          clientId: uuidSchema.optional(),
          status: z.enum(['ACTIVE', 'REPLACED', 'REMOVED']).optional(),
          search: z.string().trim().max(200).optional(),
        }),
        request.query,
      );

      const scope = assignmentWhereFor(auth);
      const where = {
        AND: [
          scope,
          ...(query.adminId ? [{ adminId: query.adminId }] : []),
          ...(query.clientId ? [{ clientId: query.clientId }] : []),
          ...(query.status ? [{ status: query.status }] : []),
          ...(query.search
            ? [
                {
                  OR: [
                    { client: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
                    { client: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
                    { client: { email: { contains: query.search, mode: 'insensitive' as const } } },
                    { admin: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
                    { admin: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
                  ],
                },
              ]
            : []),
        ],
      };

      const [total, assignments] = await Promise.all([
        prisma.adminAssignment.count({ where }),
        prisma.adminAssignment.findMany({
          where,
          include: assignmentInclude,
          orderBy: { assignedAt: 'desc' },
          ...paginationArgs(query),
        }),
      ]);

      return reply.send(paginated(assignments.map(serializeAssignment), total, query));
    },
  );

  app.get(
    '/assignments/unassigned',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'List clients without an active assignment' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(
        z.object({ ...pageSchema, search: z.string().trim().max(200).optional() }),
        request.query,
      );

      if (!isSuperAdmin(auth)) {
        // The list exposes client PII. Ordinary administrators only need it
        // when they are allowed to claim unassigned clients themselves.
        const allowed = await getBooleanSetting(SETTING_KEYS.allowAdminSelfAssign, false);
        if (!allowed) {
          throw AppError.forbidden('Administrators are not permitted to view unassigned clients');
        }
      }

      const where = {
        role: 'USER' as const,
        status: 'ACTIVE' as const,
        assignmentsAsClient: { none: { status: 'ACTIVE' as const } },
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' as const } },
                { lastName: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [total, clients] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...paginationArgs(query),
        }),
      ]);
      return reply.send(paginated(clients.map(serializeUser), total, query));
    },
  );

  app.post(
    '/assignments',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'Assign a client to an administrator' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);

      const client = await prisma.user.findFirst({ where: { id: body.clientId, role: 'USER' } });
      if (!client) throw AppError.validation('Client not found');
      if (client.status !== 'ACTIVE') throw AppError.validation('Client account is disabled');
      const admin = await assertAssignableAdmin(body.adminId);

      if (!isSuperAdmin(auth)) {
        const allowed = await getBooleanSetting(SETTING_KEYS.allowAdminSelfAssign, false);
        if (!allowed) {
          throw AppError.forbidden('Administrators are not permitted to create assignments');
        }
        if (body.adminId !== auth.id) {
          throw AppError.forbidden('Administrators can only assign clients to themselves');
        }
      }

      const existing = await activeAssignmentFor(body.clientId);
      if (existing && !isSuperAdmin(auth)) {
        throw AppError.conflict('This client already has an assigned administrator');
      }
      if (existing && existing.adminId === body.adminId) {
        throw AppError.conflict('This client is already assigned to that administrator');
      }

      const created = await prisma.$transaction(async (tx) => {
        await lockClientAssignments(tx, body.clientId);
        const existing = await activeAssignmentFor(body.clientId, tx);
        if (existing && !isSuperAdmin(auth)) {
          throw AppError.conflict('This client already has an assigned administrator');
        }
        if (existing && existing.adminId === body.adminId) {
          throw AppError.conflict('This client is already assigned to that administrator');
        }
        if (existing) {
          await tx.adminAssignment.update({
            where: { id: existing.id },
            data: { status: 'REPLACED', endedAt: new Date() },
          });
        }
        const assignment = await tx.adminAssignment.create({
          data: {
            clientId: body.clientId,
            adminId: body.adminId,
            assignedById: auth.id,
            notes: body.notes ?? null,
            status: 'ACTIVE',
          },
          include: assignmentInclude,
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: existing ? 'ASSIGNMENT_REPLACED' : 'ASSIGNMENT_CREATED',
            entityType: 'ADMIN_ASSIGNMENT',
            entityId: assignment.id,
            clientId: assignment.clientId,
            summary: existing
              ? `Client reassigned from ${existing.admin.email} to ${admin.email}`
              : `Client assigned to ${admin.email}`,
            before: existing ? { adminId: existing.adminId, status: existing.status } : undefined,
            after: { adminId: assignment.adminId, status: assignment.status },
            ipAddress: request.ip,
          },
          tx,
        );
        await notify(
          {
            userId: assignment.adminId,
            type: 'ASSIGNMENT',
            title: existing ? 'Client reassigned to you' : 'New client assigned',
            body: `${client.firstName} ${client.lastName} is now assigned to you.`,
            link: `/clients/${client.id}`,
          },
          tx,
        );
        await notify(
          {
            userId: client.id,
            type: 'ASSIGNMENT',
            title: 'Advisor updated',
            body: `${admin.firstName} ${admin.lastName} is now your assigned advisor.`,
            link: '/profile',
          },
          tx,
        );
        return assignment;
      });

      return reply.status(201).send({ data: serializeAssignment(created) });
    },
  );

  app.get(
    '/assignments/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'Get an assignment' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const assignment = await prisma.adminAssignment.findFirst({
        where: { AND: [assignmentWhereFor(auth), { id }] },
        include: assignmentInclude,
      });
      if (!assignment) throw AppError.notFound('Assignment not found');
      return reply.send({ data: serializeAssignment(assignment) });
    },
  );

  app.patch(
    '/assignments/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'Reassign or update an assignment' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const body = parseBody(updateSchema, request.body);
      const before = await prisma.adminAssignment.findFirst({ where: { id }, include: assignmentInclude });
      if (!before) throw AppError.notFound('Assignment not found');

      if (!isSuperAdmin(auth)) {
        if (before.adminId !== auth.id) throw AppError.forbidden();
        if (body.adminId && body.adminId !== auth.id) throw AppError.forbidden();
        if (body.status === 'ACTIVE') {
          throw AppError.forbidden('Administrators cannot reactivate assignments');
        }
      }

      if (body.adminId && body.adminId !== before.adminId) {
        const admin = await assertAssignableAdmin(body.adminId);
        const replacement = await prisma.$transaction(async (tx) => {
          await lockClientAssignments(tx, before.clientId);
          const currentAssignment = await tx.adminAssignment.findUnique({ where: { id } });
          if (!currentAssignment || currentAssignment.status !== 'ACTIVE') {
            throw AppError.conflict('This assignment is no longer active');
          }
          const otherActive = await tx.adminAssignment.findFirst({
            where: { clientId: before.clientId, status: 'ACTIVE', id: { not: id } },
            select: { id: true },
          });
          if (otherActive) {
            throw AppError.conflict('This client already has an assigned administrator');
          }
          await tx.adminAssignment.update({
            where: { id },
            data: { status: 'REPLACED', endedAt: new Date() },
          });
          const created = await tx.adminAssignment.create({
            data: {
              clientId: before.clientId,
              adminId: body.adminId!,
              assignedById: auth.id,
              notes: body.notes ?? before.notes,
              status: 'ACTIVE',
            },
            include: assignmentInclude,
          });
          await recordAudit(
            {
              actorId: auth.id,
              actorRole: auth.role,
              action: 'ASSIGNMENT_REPLACED',
              entityType: 'ADMIN_ASSIGNMENT',
              entityId: created.id,
              clientId: before.clientId,
              summary: `Client reassigned from ${before.admin.email} to ${admin.email}`,
              before: { adminId: before.adminId, status: before.status },
              after: { adminId: created.adminId, status: created.status },
              ipAddress: request.ip,
            },
            tx,
          );
          await notify(
            {
              userId: created.adminId,
              type: 'ASSIGNMENT',
              title: 'Client reassigned to you',
              body: `${before.client.firstName} ${before.client.lastName} is now assigned to you.`,
              link: `/clients/${before.clientId}`,
            },
            tx,
          );
          return created;
        });
        return reply.send({ data: serializeAssignment(replacement) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (body.status === 'ACTIVE') {
          await lockClientAssignments(tx, before.clientId);
          const current = await tx.adminAssignment.findUnique({
            where: { id },
            select: { status: true },
          });
          if (!current) throw AppError.notFound('Assignment not found');
          if (current.status !== 'ACTIVE') {
            const otherActive = await tx.adminAssignment.findFirst({
              where: { clientId: before.clientId, status: 'ACTIVE', id: { not: id } },
              select: { id: true },
            });
            if (otherActive) {
              throw AppError.conflict('This client already has an assigned administrator');
            }
          }
        }

        const assignment = await tx.adminAssignment.update({
          where: { id },
          data: {
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.status === 'REMOVED' ? { endedAt: new Date() } : {}),
            ...(body.status === 'ACTIVE' ? { endedAt: null } : {}),
            ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
          },
          include: assignmentInclude,
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: body.status === 'REMOVED' ? 'ASSIGNMENT_REMOVED' : 'ASSIGNMENT_UPDATED',
            entityType: 'ADMIN_ASSIGNMENT',
            entityId: id,
            clientId: assignment.clientId,
            summary: `Assignment ${body.status === 'REMOVED' ? 'removed' : 'updated'}`,
            before,
            after: assignment,
            ipAddress: request.ip,
          },
          tx,
        );
        return assignment;
      });

      return reply.send({ data: serializeAssignment(updated) });
    },
  );

  app.delete(
    '/assignments/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Assignments'], summary: 'Remove an assignment (history retained)' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const before = await prisma.adminAssignment.findFirst({ where: { id }, include: assignmentInclude });
      if (!before) throw AppError.notFound('Assignment not found');
      if (!isSuperAdmin(auth) && before.adminId !== auth.id) throw AppError.forbidden();
      if (before.status === 'REMOVED') return reply.status(204).send();

      await prisma.$transaction(async (tx) => {
        const assignment = await tx.adminAssignment.update({
          where: { id },
          data: { status: 'REMOVED', endedAt: new Date() },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'ASSIGNMENT_REMOVED',
            entityType: 'ADMIN_ASSIGNMENT',
            entityId: id,
            clientId: assignment.clientId,
            summary: 'Assignment removed',
            before: { adminId: before.adminId, status: before.status },
            after: { adminId: assignment.adminId, status: assignment.status },
            ipAddress: request.ip,
          },
          tx,
        );
      });
      return reply.status(204).send();
    },
  );
}
