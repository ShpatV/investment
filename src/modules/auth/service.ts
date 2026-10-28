import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from '../../lib/passwords';
import type { AuthUser } from '../../lib/scope';
import { config } from '../../config';

const DUMMY_HASH_PROMISE = hashPassword('invalid-password-placeholder');

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  refreshExpiresAt: Date;
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000);
}

export async function issueSessionTokens(
  app: FastifyInstance,
  user: Pick<User, 'id' | 'role'>,
  request: FastifyRequest,
): Promise<IssuedTokens> {
  const refreshToken = generateOpaqueToken();
  const expiresAt = refreshExpiry();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
    },
  });

  const accessToken = app.jwt.sign({
    sub: user.id,
    sid: session.id,
    role: user.role,
    type: 'access',
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: config.jwtAccessTtl,
    refreshExpiresAt: expiresAt,
  };
}

export async function authenticateCredentials(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Keep timing similar whether or not the account exists.
    await verifyPassword(await DUMMY_HASH_PROMISE, password);
    throw AppError.unauthorized('Invalid email or password');
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw AppError.unauthorized('Invalid email or password');
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact your administrator.');
  }
  return user;
}

export function authUserFrom(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export async function rotateRefreshToken(
  app: FastifyInstance,
  refreshToken: string,
): Promise<{ tokens: IssuedTokens; user: User; sessionId: string }> {
  const tokenHash = hashOpaqueToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw AppError.unauthorized('Refresh token is invalid or expired');
  }
  if (session.user.status !== 'ACTIVE') {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
  }

  const nextRefreshToken = generateOpaqueToken();
  const expiresAt = refreshExpiry();
  await prisma.session.update({
    where: { id: session.id },
    data: {
      tokenHash: hashOpaqueToken(nextRefreshToken),
      expiresAt,
      lastUsedAt: new Date(),
      ipAddress: session.ipAddress,
    },
  });

  const accessToken = app.jwt.sign({
    sub: session.user.id,
    sid: session.id,
    role: session.user.role,
    type: 'access',
  });

  return {
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: config.jwtAccessTtl,
      refreshExpiresAt: expiresAt,
    },
    user: session.user,
    sessionId: session.id,
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(refreshToken);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function createAuthToken(
  userId: string,
  type: 'INVITE' | 'PASSWORD_RESET',
  createdById?: string | null,
  ttlMinutes = 60,
  db: Pick<typeof prisma, 'authToken'> = prisma,
): Promise<{ token: string; expiresAt: Date }> {
  await db.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
      createdById: createdById ?? null,
    },
  });
  return { token, expiresAt };
}

export async function consumeAuthToken(
  token: string,
  type?: 'INVITE' | 'PASSWORD_RESET',
): Promise<{ user: User; tokenId: string; tokenType: 'INVITE' | 'PASSWORD_RESET' }> {
  const tokenHash = hashOpaqueToken(token);
  const record = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (
    !record ||
    (type && record.type !== type) ||
    record.usedAt ||
    record.expiresAt <= new Date()
  ) {
    throw AppError.badRequest('This link is invalid or has expired');
  }
  if (record.user.status !== 'ACTIVE') {
    throw AppError.forbidden('This account is disabled');
  }
  return { user: record.user, tokenId: record.id, tokenType: record.type };
}

/** Development convenience only; never returns tokens in production. */
export function maybeExposeToken(token: string): { token: string } | Record<string, never> {
  if (!config.isProduction && config.exposeDevTokens) return { token };
  return {};
}

export function randomPassword(): string {
  return generateOpaqueToken().slice(0, 24);
}

export async function hashNewPassword(password: string): Promise<string> {
  return hashPassword(password);
}

export function newSessionId(): string {
  return randomBytes(16).toString('hex');
}
