import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery } from '../../lib/http';
import {
  dateOnlySchema,
  emailSchema,
  nullableOptional,
  pageSchema,
  passwordSchema,
  trimmedOptional,
  uuidSchema,
} from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { assertClientAccess, assertCanManageClient, isSuperAdmin } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { hashPassword, generateTemporaryPassword } from '../../lib/passwords';
import {
  dateOnly,
  serializeDocument,
  serializeInvestment,
  serializeTransaction,
  serializeUser,
} from '../../lib/serializers';
import { dec, moneyNumber } from '../../services/finance';
import { project, projectionView, summarize } from '../../services/investments';
import { notify } from '../../services/notifications';
import { createAuthToken, maybeExposeToken } from '../auth/service';

const createClientSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: trimmedOptional(40),
  address: nullableOptional(500),
  dateOfBirth: dateOnlySchema.nullable().optional(),
  assignedAdminId: uuidSchema.optional(),
  initialPassword: passwordSchema.optional(),
  notes: trimmedOptional(1000),
});

const updateClientSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: emailSchema.optional(),
    phone: nullableOptional(40),
    address: nullableOptional(500),
    dateOfBirth: dateOnlySchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

const listQuerySchema = z.object({
  ...pageSchema,
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  adminId: uuidSchema.optional(),
  sortBy: z.enum(['createdAt', 'firstName', 'lastName']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/clients',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'List clients visible to the current administrator' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(listQuerySchema, request.query);

      const where = {
        role: 'USER' as const,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' as const } },
                { lastName: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { phone: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(query.adminId || auth.role === 'ADMIN'
          ? {
              assignmentsAsClient: {
                some: {
                  status: 'ACTIVE' as const,
                  ...(isSuperAdmin(auth) ? (query.adminId ? { adminId: query.adminId } : {}) : { adminId: auth.id }),
                },
              },
            }
          : {}),
      };

      const [total, clients] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: {
            assignmentsAsClient: {
              where: { status: 'ACTIVE' },
              include: { admin: true },
              take: 1,
            },
            investmentsAsClient: {
              where: { status: 'ACTIVE' },
              include: { institution: true, transactions: true },
            },
            transactionsAsClient: { orderBy: { transactionDate: 'desc' }, take: 1, select: { transactionDate: true } },
            _count: { select: { investmentsAsClient: true } },
          },
          orderBy: { [query.sortBy]: query.sortDir } as Prisma.UserOrderByWithRelationInput,
          ...paginationArgs(query),
        }),
      ]);

      const data = clients.map((client) => {
        const activeAssignment = client.assignmentsAsClient[0];
        const totalInvested = client.investmentsAsClient.reduce(
          (sum, investment) => sum.plus(dec(project(investment).currentPrincipal)),
          dec(0),
        );
        const lastTransaction = client.transactionsAsClient[0]?.transactionDate;
        const lastActivityAt =
          lastTransaction && lastTransaction > client.updatedAt ? lastTransaction : client.updatedAt;
        return {
          ...serializeUser(client),
          assignedAdmin: activeAssignment
            ? {
                id: activeAssignment.admin.id,
                fullName: `${activeAssignment.admin.firstName} ${activeAssignment.admin.lastName}`.trim(),
                email: activeAssignment.admin.email,
                assignedAt: activeAssignment.assignedAt,
              }
            : null,
          investmentCount: client._count.investmentsAsClient,
          totalInvestedPrincipal: moneyNumber(totalInvested),
          lastActivityAt,
        };
      });

      return reply.send(paginated(data, total, query));
    },
  );

  app.post(
    '/clients',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'Create a client account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createClientSchema, request.body);

      let assignedAdminId: string | null = null;
      let assignedAdmin: { id: string; firstName: string; lastName: string; email: string } | null = null;
      if (body.assignedAdminId) {
        if (!isSuperAdmin(auth) && body.assignedAdminId !== auth.id) {
          throw AppError.forbidden('Administrators can only assign new clients to themselves');
        }
        const admin = await prisma.user.findUnique({ where: { id: body.assignedAdminId } });
        if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') || admin.status !== 'ACTIVE') {
          throw AppError.validation('Selected administrator is not an active administrator');
        }
        assignedAdmin = admin;
        assignedAdminId = admin.id;
      } else if (!isSuperAdmin(auth)) {
        assignedAdminId = auth.id;
        assignedAdmin = await prisma.user.findUnique({
          where: { id: auth.id },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }

      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) throw AppError.conflict('An account with this email already exists');

      const passwordHash = await hashPassword(body.initialPassword ?? generateTemporaryPassword());
      const adminIdToAssign = assignedAdminId;

      const result = await prisma.$transaction(async (tx) => {
        const client = await tx.user.create({
          data: {
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            phone: body.phone ?? null,
            address: body.address ?? null,
            dateOfBirth: body.dateOfBirth ?? null,
            role: 'USER',
            status: 'ACTIVE',
            passwordHash,
            mustChangePassword: !body.initialPassword,
          },
        });

        if (adminIdToAssign) {
          await tx.adminAssignment.create({
            data: {
              clientId: client.id,
              adminId: adminIdToAssign,
              assignedById: auth.id,
              notes: body.notes ?? null,
              status: 'ACTIVE',
            },
          });
        }

        let invitation:
          | { token: string; expiresAt: Date; delivery: string }
          | undefined;
        if (!body.initialPassword) {
          const created = await createAuthToken(client.id, 'INVITE', auth.id, 7 * 24 * 60, tx);
          invitation = { ...created, delivery: 'manual' };
        }

        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'CLIENT_CREATED',
            entityType: 'USER',
            entityId: client.id,
            clientId: client.id,
            summary: `Client ${client.email} created`,
            after: client,
            ipAddress: request.ip,
          },
          tx,
        );
        if (adminIdToAssign) {
          await recordAudit(
            {
              actorId: auth.id,
              actorRole: auth.role,
              action: 'ASSIGNMENT_CREATED',
              entityType: 'ADMIN_ASSIGNMENT',
              entityId: client.id,
              clientId: client.id,
              summary: 'Client assigned during onboarding',
              after: { clientId: client.id, adminId: adminIdToAssign },
              ipAddress: request.ip,
            },
            tx,
          );
        }
        await notify(
          {
            userId: client.id,
            type: 'ACCOUNT',
            title: 'Welcome to your investment portal',
            body: 'Your account has been created. Sign in to review your portfolio.',
            link: '/dashboard',
          },
          tx,
        );
        if (adminIdToAssign) {
          await notify(
            {
              userId: adminIdToAssign,
              type: 'ASSIGNMENT',
              title: 'New client assigned',
              body: `${client.firstName} ${client.lastName} has been assigned to you.`,
              link: `/clients/${client.id}`,
            },
            tx,
          );
        }

        return { client, invitation };
      });

      return reply.status(201).send({
        data: {
          ...serializeUser(result.client),
          advisor: assignedAdmin
            ? {
                id: assignedAdmin.id,
                fullName: `${assignedAdmin.firstName} ${assignedAdmin.lastName}`.trim(),
                email: assignedAdmin.email,
              }
            : null,
          invitation: result.invitation
            ? {
                expiresAt: result.invitation.expiresAt,
                delivery: result.invitation.delivery,
                ...(maybeExposeToken(result.invitation.token).token
                  ? { token: result.invitation.token }
                  : {}),
              }
            : null,
        },
      });
    },
  );

  app.get(
    '/clients/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'Get a client with portfolio and recent activity' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      await assertClientAccess(auth, id);

      const client = await prisma.user.findUnique({
        where: { id, role: 'USER' },
        include: {
          assignmentsAsClient: {
            where: { status: 'ACTIVE' },
            include: { admin: true },
            take: 1,
          },
          investmentsAsClient: { include: { institution: true, transactions: true }, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!client) throw AppError.notFound('Client not found');

      const [recentTransactions, recentDocuments, unread] = await Promise.all([
        prisma.transaction.findMany({
          where: { clientId: id },
          include: { investment: { select: { id: true, name: true } } },
          orderBy: { transactionDate: 'desc' },
          take: 8,
        }),
        prisma.document.findMany({
          where: { clientId: id, status: 'ACTIVE' },
          include: { uploadedBy: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.notification.count({ where: { userId: id, readAt: null } }),
      ]);

      const summary = summarize(client.investmentsAsClient);
      const activeAssignment = client.assignmentsAsClient[0];

      return reply.send({
        data: {
          ...serializeUser(client),
          advisor: activeAssignment
            ? {
                id: activeAssignment.admin.id,
                fullName: `${activeAssignment.admin.firstName} ${activeAssignment.admin.lastName}`.trim(),
                email: activeAssignment.admin.email,
                phone: activeAssignment.admin.phone,
                assignedAt: activeAssignment.assignedAt,
              }
            : null,
          portfolioSummary: summary,
          investments: client.investmentsAsClient.map((investment) =>
            serializeInvestment(investment, projectionView(investment)),
          ),
          recentTransactions: recentTransactions.map(serializeTransaction),
          recentDocuments: recentDocuments.map(serializeDocument),
          unreadNotifications: unread,
          lastUpdatedAt: client.updatedAt,
          memberSince: dateOnly(client.createdAt),
        },
      });
    },
  );

  app.patch(
    '/clients/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'Update client personal information' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      const body = parseBody(updateClientSchema, request.body);
      await assertCanManageClient(auth, id);

      const before = await prisma.user.findFirst({ where: { id, role: 'USER' } });
      if (!before) throw AppError.notFound('Client not found');

      if (body.email && body.email !== before.email) {
        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) throw AppError.conflict('An account with this email already exists');
      }

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
          ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth } : {}),
        },
      });

      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'CLIENT_UPDATED',
        entityType: 'USER',
        entityId: id,
        clientId: id,
        summary: `Client ${updated.email} updated`,
        before,
        after: updated,
        ipAddress: request.ip,
      });

      return reply.send({ data: serializeUser(updated) });
    },
  );

  app.post(
    '/clients/:id/disable',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'Disable a client account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      await assertCanManageClient(auth, id);
      const client = await prisma.user.findFirst({ where: { id, role: 'USER' } });
      if (!client) throw AppError.notFound('Client not found');
      if (client.status === 'DISABLED') {
        return reply.send({ data: serializeUser(client) });
      }

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
            action: 'CLIENT_DISABLED',
            entityType: 'USER',
            entityId: id,
            clientId: id,
            summary: `Client ${user.email} disabled`,
            before: { status: client.status },
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
    '/clients/:id/reactivate',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Clients'], summary: 'Reactivate a client account' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      await assertCanManageClient(auth, id);
      const client = await prisma.user.findFirst({ where: { id, role: 'USER' } });
      if (!client) throw AppError.notFound('Client not found');
      if (client.status === 'ACTIVE') {
        return reply.send({ data: serializeUser(client) });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { status: 'ACTIVE', disabledAt: null },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'CLIENT_REACTIVATED',
            entityType: 'USER',
            entityId: id,
            clientId: id,
            summary: `Client ${user.email} reactivated`,
            before: { status: client.status },
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
    '/clients/:id/invite',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: { tags: ['Clients'], summary: 'Issue a new account invitation link' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseQuery(z.object({ id: uuidSchema }), request.params);
      await assertCanManageClient(auth, id);
      const client = await prisma.user.findFirst({ where: { id, role: 'USER', status: 'ACTIVE' } });
      if (!client) throw AppError.notFound('Client not found');

      const created = await createAuthToken(client.id, 'INVITE', auth.id, 7 * 24 * 60);
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'CLIENT_INVITATION_ISSUED',
        entityType: 'USER',
        entityId: id,
        clientId: id,
        summary: 'Invitation reissued',
        ipAddress: request.ip,
      });
      return reply.send({
        data: {
          expiresAt: created.expiresAt,
          delivery: 'manual',
          ...maybeExposeToken(created.token),
        },
      });
    },
  );
}
