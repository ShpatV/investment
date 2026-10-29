import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { parseBody } from '../../lib/http';
import { emailSchema, passwordSchema } from '../../lib/schemas';
import { hashPassword, hashSecurityAnswer, verifyPassword } from '../../lib/passwords';
import { authenticate, currentUser } from '../../plugins/auth';
import { recordAudit } from '../../lib/audit';
import { serializeUser } from '../../lib/serializers';
import {
  authenticateCredentials,
  createAuthToken,
  issueSessionTokens,
  maybeExposeToken,
  revokeRefreshToken,
  rotateRefreshToken,
  hashNewPassword,
} from './service';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(500),
});

const resetSchema = z.object({
  token: z.string().min(10).max(500),
  newPassword: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

const forgotSchema = z.object({ email: emailSchema });

type Portal = 'client' | 'admin' | 'super-admin';

/**
 * Each portal is served by its own frontend, so a valid credential for the wrong
 * portal must not produce a session. The role list is enforced server-side.
 */
const PORTAL_ROLES: Record<Portal, readonly Role[]> = {
  client: ['USER'],
  admin: ['ADMIN', 'SUPER_ADMIN'],
  'super-admin': ['SUPER_ADMIN'],
};

const PORTALS: ReadonlyArray<{ path: string; portal: Portal; summary: string }> = [
  {
    path: '/auth/login/client',
    portal: 'client',
    summary: 'Client portal sign-in (client accounts only)',
  },
  {
    path: '/auth/login/admin',
    portal: 'admin',
    summary: 'Admin portal sign-in (admin and super admin accounts)',
  },
  {
    path: '/auth/login/super-admin',
    portal: 'super-admin',
    summary: 'Super admin portal sign-in (super admin accounts only)',
  },
];

async function handleLogin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  portal?: Portal,
) {
  const body = parseBody(loginSchema, request.body);
  try {
    const user = await authenticateCredentials(body.email, body.password);
    if (portal && !PORTAL_ROLES[portal].includes(user.role)) {
      throw AppError.forbidden(`This account cannot sign in to the ${portal} portal`);
    }
    const tokens = await issueSessionTokens(app, user, request);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      summary: portal ? `User signed in via the ${portal} portal` : 'User signed in',
      outcome: 'SUCCESS',
      ipAddress: request.ip,
    });

    const assignment =
      user.role === 'USER'
        ? await prisma.adminAssignment.findFirst({
            where: { clientId: user.id, status: 'ACTIVE' },
            include: { admin: true },
          })
        : null;

    return reply.send({
      data: {
        user: {
          ...serializeUser(user),
          advisor: assignment
            ? {
                id: assignment.admin.id,
                fullName: `${assignment.admin.firstName} ${assignment.admin.lastName}`.trim(),
                email: assignment.admin.email,
              }
            : null,
        },
        ...tokens,
        tokenType: 'Bearer',
        ...(portal ? { portal } : {}),
      },
    });
  } catch (error) {
    await recordAudit({
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'AUTH',
      summary: portal
        ? `Failed sign-in attempt (${portal} portal)`
        : 'Failed sign-in attempt',
      outcome: 'FAILURE',
      ipAddress: request.ip,
    });
    throw error;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in and receive access/refresh tokens (any role)',
        description:
          'Generic sign-in used by single-frontend deployments. When each role runs in its own ' +
          'frontend, prefer POST /auth/login/client, /auth/login/admin or /auth/login/super-admin.',
      },
    },
    async (request, reply) => handleLogin(app, request, reply),
  );

  for (const { path, portal, summary } of PORTALS) {
    app.post(
      path,
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: { tags: ['Auth'], summary },
      },
      async (request, reply) => handleLogin(app, request, reply, portal),
    );
  }

  app.post(
    '/auth/refresh',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['Auth'], summary: 'Rotate a refresh token' },
    },
    async (request, reply) => {
      const body = parseBody(refreshSchema, request.body);
      const { tokens, user } = await rotateRefreshToken(app, body.refreshToken);
      return reply.send({
        data: {
          user: serializeUser(user),
          ...tokens,
          tokenType: 'Bearer',
        },
      });
    },
  );

  app.post(
    '/auth/logout',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['Auth'], summary: 'Revoke a refresh token' },
    },
    async (request, reply) => {
      const body = parseBody(refreshSchema, request.body);
      await revokeRefreshToken(body.refreshToken);
      return reply.status(204).send();
    },
  );

  app.get(
    '/auth/me',
    { preHandler: [authenticate], schema: { tags: ['Auth'], summary: 'Current authenticated account' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const user = await prisma.user.findUnique({ where: { id: auth.id } });
      if (!user) throw AppError.unauthorized();
      const assignment =
        user.role === 'USER'
          ? await prisma.adminAssignment.findFirst({
              where: { clientId: user.id, status: 'ACTIVE' },
              include: { admin: true },
            })
          : null;
      const unread = await prisma.notification.count({
        where: { userId: user.id, readAt: null },
      });
      return reply.send({
        data: {
          ...serializeUser(user),
          advisor: assignment
            ? {
                id: assignment.admin.id,
                fullName: `${assignment.admin.firstName} ${assignment.admin.lastName}`.trim(),
                email: assignment.admin.email,
              }
            : null,
          unreadNotifications: unread,
        },
      });
    },
  );

  app.post(
    '/auth/change-password',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: ['Auth'], summary: 'Change the current account password' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(changePasswordSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: auth.id } });
      if (!user) throw AppError.unauthorized();
      const valid = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!valid) throw AppError.badRequest('Current password is incorrect');
      if (body.currentPassword === body.newPassword) {
        throw AppError.validation('New password must be different from the current password');
      }
      const passwordHash = await hashPassword(body.newPassword);
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
        prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await recordAudit({
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_PASSWORD_CHANGED',
        entityType: 'USER',
        entityId: user.id,
        clientId: user.role === 'USER' ? user.id : null,
        summary: 'Password changed; all sessions revoked',
        ipAddress: request.ip,
      });
      return reply.send({ data: { message: 'Password changed. Please sign in again.' } });
    },
  );

  app.post(
    '/auth/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: { tags: ['Auth'], summary: 'Request a password reset link' },
    },
    async (request, reply) => {
      const body = parseBody(forgotSchema, request.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      let devToken: string | undefined;
      if (user && user.status === 'ACTIVE') {
        const created = await createAuthToken(user.id, 'PASSWORD_RESET', null, 60);
        devToken = maybeExposeToken(created.token).token;
        await recordAudit({
          actorId: user.id,
          actorRole: user.role,
          action: 'AUTH_PASSWORD_RESET_REQUESTED',
          entityType: 'USER',
          entityId: user.id,
          clientId: user.role === 'USER' ? user.id : null,
          summary: 'Password reset requested',
          ipAddress: request.ip,
        });
      }
      return reply.send({
        data: {
          message: 'If an account exists for that email, a password reset link has been created.',
          ...(devToken ? { devToken } : {}),
        },
      });
    },
  );

  app.post(
    '/auth/reset-password',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: { tags: ['Auth'], summary: 'Set a password using an invitation or reset token' },
    },
    async (request, reply) => {
      const body = parseBody(resetSchema, request.body);
      const tokenHash = createHash('sha256').update(body.token).digest('hex');
      const record = await prisma.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!record || record.usedAt || record.expiresAt <= new Date()) {
        throw AppError.badRequest('This link is invalid or has expired');
      }
      if (record.user.status !== 'ACTIVE') throw AppError.forbidden('This account is disabled');

      const passwordHash = await hashNewPassword(body.newPassword);
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.authToken.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw AppError.badRequest('This link has already been used');
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash, mustChangePassword: false },
        });
        await tx.session.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: record.userId,
            actorRole: record.user.role,
            action: record.type === 'INVITE' ? 'AUTH_INVITE_ACCEPTED' : 'AUTH_PASSWORD_RESET_COMPLETED',
            entityType: 'USER',
            entityId: record.userId,
            clientId: record.user.role === 'USER' ? record.userId : null,
            summary: 'Password set via one-time token',
            outcome: 'SUCCESS',
            ipAddress: request.ip,
          },
        });
      });

      return reply.send({ data: { message: 'Password updated. You can now sign in.' } });
    },
  );

  // Kept for the security-question workflow: verify the current password before
  // replacing the security answer without ever returning the answer.
  app.get(
    '/auth/security-question',
    { preHandler: [authenticate], schema: { tags: ['Auth'], summary: 'Get the configured security question' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const user = await prisma.user.findUnique({
        where: { id: auth.id },
        select: { securityQuestion: true },
      });
      return reply.send({ data: { securityQuestion: user?.securityQuestion ?? null } });
    },
  );

  app.patch(
    '/auth/security-question',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: { tags: ['Auth'], summary: 'Replace the security question and answer' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(
        z.object({
          securityQuestion: z.string().trim().min(5).max(255),
          securityAnswer: z.string().trim().min(2).max(255),
          currentPassword: z.string().min(1).max(200),
        }),
        request.body,
      );
      const user = await prisma.user.findUnique({ where: { id: auth.id } });
      if (!user) throw AppError.unauthorized();
      if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
        throw AppError.badRequest('Current password is incorrect');
      }
      const securityAnswerHash = await hashSecurityAnswer(body.securityAnswer);
      await prisma.user.update({
        where: { id: user.id },
        data: { securityQuestion: body.securityQuestion, securityAnswerHash },
      });
      await recordAudit({
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_SECURITY_QUESTION_UPDATED',
        entityType: 'USER',
        entityId: user.id,
        clientId: user.role === 'USER' ? user.id : null,
        summary: 'Security question updated',
        ipAddress: request.ip,
      });
      return reply.send({ data: { message: 'Security question updated' } });
    },
  );
}
