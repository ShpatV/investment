import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery, parseWith } from '../../lib/http';
import { emailSchema, pageSchema, passwordSchema, trimmedOptional, uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { isSuperAdmin } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeAdminListItem, serializeUser } from '../../lib/serializers';
import { generateTemporaryPassword, hashPassword } from '../../lib/passwords';
import { createAuthToken, maybeExposeToken } from '../auth/service';
import { dec, moneyNumber } from '../../services/finance';
import { project } from '../../services/investments';

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: trimmedOptional(40),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']),
  initialPassword: passwordSchema.optional(),
});

const updateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: emailSchema.optional(),
    phone: trimmedOptional(40),
    role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

async function assertNotLastActiveSuperAdmin(targetId: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || target.role !== 'SUPER_ADMIN' || target.status !== 'ACTIVE') return;
  const otherActiveSuperAdmins = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: targetId } },
  });
  if (otherActiveSuperAdmins === 0) {
    throw AppError.conflict('The last active super admin cannot be disabled, demoted, or removed');
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/admins',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'List administrator accounts' },
    },
    async (request, reply) => {
      const query = parseQuery(
        z.object({
          ...pageSchema,
          role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
          status: z.enum(['ACTIVE', 'DISABLED']).optional(),
          search: z.string().trim().max(200).optional(),
        }),
        request.query,
      );
      const where: Prisma.UserWhereInput = {
        role: query.role ?? { in: ['ADMIN', 'SUPER_ADMIN'] },
        ...(query.status ? { status: query.status } : {}),
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
      const [total, admins] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: {
            _count: {
              select: { assignmentsAsAdmin: { where: { status: 'ACTIVE' } } },
            },
          },
          orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
          ...paginationArgs(query),
        }),
      ]);
      return reply.send(paginated(admins.map(serializeAdminListItem), total, query));
    },
  );

  app.post(
    '/admins',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'Create an administrator or user account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);
      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) throw AppError.conflict('An account with this email already exists');

      const passwordHash = await hashPassword(body.initialPassword ?? generateTemporaryPassword());
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            phone: body.phone ?? null,
            role: body.role,
            status: 'ACTIVE',
            passwordHash,
            mustChangePassword: !body.initialPassword,
          },
        });
        let invitation: { token: string; expiresAt: Date } | undefined;
        if (!body.initialPassword) {
          invitation = await createAuthToken(user.id, 'INVITE', auth.id, 7 * 24 * 60, tx);
        }
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: body.role === 'USER' ? 'USER_CREATED' : 'ADMIN_CREATED',
            entityType: 'USER',
            entityId: user.id,
            clientId: body.role === 'USER' ? user.id : null,
            summary: `${body.role} account ${user.email} created`,
            after: user,
            ipAddress: request.ip,
          },
          tx,
        );
        return { user, invitation };
      });

      return reply.status(201).send({
        data: {
          ...serializeUser(created.user),
          invitation: created.invitation
            ? {
                expiresAt: created.invitation.expiresAt,
                delivery: 'manual',
                ...maybeExposeToken(created.invitation.token),
              }
            : null,
        },
      });
    },
  );

  app.get(
    '/admins/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'Get an administrator account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      if (!isSuperAdmin(auth) && auth.id !== id) throw AppError.forbidden();
      const admin = await prisma.user.findFirst({
        where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        include: { _count: { select: { assignmentsAsAdmin: { where: { status: 'ACTIVE' } } } } },
      });
      if (!admin) throw AppError.notFound('Administrator not found');
      return reply.send({ data: serializeAdminListItem(admin) });
    },
  );

  app.patch(
    '/admins/:id',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'Update an administrator account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const body = parseBody(updateSchema, request.body);
      const before = await prisma.user.findFirst({
        where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      });
      if (!before) throw AppError.notFound('Administrator not found');

      if (body.email && body.email !== before.email) {
        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) throw AppError.conflict('An account with this email already exists');
      }
      if (body.role && body.role !== before.role) {
        await assertNotLastActiveSuperAdmin(id);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
            ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
            ...(body.email !== undefined ? { email: body.email } : {}),
            ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
          },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: body.role && body.role !== before.role ? 'ADMIN_ROLE_CHANGED' : 'ADMIN_UPDATED',
            entityType: 'USER',
            entityId: id,
            summary: `Administrator ${user.email} updated`,
            before,
            after: user,
            ipAddress: request.ip,
          },
          tx,
        );
        return user;
      });

      return reply.send({ data: serializeUser(updated) });
    },
  );

  app.post(
    '/admins/:id/disable',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'Disable an administrator account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      if (id === auth.id) throw AppError.forbidden('You cannot disable your own account');
      const admin = await prisma.user.findFirst({ where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
      if (!admin) throw AppError.notFound('Administrator not found');
      if (admin.status === 'DISABLED') return reply.send({ data: serializeUser(admin) });
      await assertNotLastActiveSuperAdmin(id);

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { status: 'DISABLED', disabledAt: new Date() },
        });
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'ADMIN_DISABLED',
            entityType: 'USER',
            entityId: id,
            summary: `Administrator ${user.email} disabled`,
            before: { status: admin.status },
            after: { status: user.status },
            ipAddress: request.ip,
          },
          tx,
        );
        return user;
      });
      return reply.send({ data: serializeUser(updated) });
    },
  );

  app.post(
    '/admins/:id/reactivate',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'Reactivate an administrator account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const admin = await prisma.user.findFirst({ where: { id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
      if (!admin) throw AppError.notFound('Administrator not found');
      if (admin.status === 'ACTIVE') return reply.send({ data: serializeUser(admin) });

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { status: 'ACTIVE', disabledAt: null },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'ADMIN_REACTIVATED',
            entityType: 'USER',
            entityId: id,
            summary: `Administrator ${user.email} reactivated`,
            before: { status: admin.status },
            after: { status: user.status },
            ipAddress: request.ip,
          },
          tx,
        );
        return user;
      });
      return reply.send({ data: serializeUser(updated) });
    },
  );

  app.get(
    '/admins/:id/clients',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Admins'], summary: 'List clients assigned to an administrator' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      if (!isSuperAdmin(auth) && auth.id !== id) throw AppError.forbidden();
      const query = parseQuery(z.object(pageSchema), request.query);

      const where = {
        role: 'USER' as const,
        assignmentsAsClient: { some: { adminId: id, status: 'ACTIVE' as const } },
      };
      const [total, clients] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: {
            investmentsAsClient: {
              where: { status: 'ACTIVE' as const },
              include: { institution: true, transactions: true },
            },
            assignmentsAsClient: {
              where: { adminId: id, status: 'ACTIVE' as const },
              take: 1,
            },
            _count: { select: { investmentsAsClient: true } },
          },
          orderBy: { createdAt: 'desc' },
          ...paginationArgs(query),
        }),
      ]);

      const data = clients.map((client) => {
        const totalInvested = client.investmentsAsClient.reduce(
          (sum, investment) => sum.plus(dec(project(investment).currentPrincipal)),
          dec(0),
        );
        return {
          ...serializeUser(client),
          investmentCount: client._count.investmentsAsClient,
          totalInvestedPrincipal: moneyNumber(totalInvested),
          assignedAt: client.assignmentsAsClient[0]?.assignedAt ?? null,
        };
      });

      return reply.send(paginated(data, total, query));
    },
  );
}
