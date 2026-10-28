import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import type { AuthUser, JwtPayload } from '../lib/scope';
import type { Role } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify<JwtPayload>();
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }

  const payload = request.user;
  if (!payload || payload.type !== 'access' || !payload.sub || !payload.sid) {
    throw AppError.unauthorized('Invalid access token');
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  const now = new Date();
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.userId !== payload.sub ||
    session.user.status !== 'ACTIVE'
  ) {
    throw AppError.unauthorized('Session is no longer valid');
  }

  request.authUser = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
  };
}

export function requireRole(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const user = request.authUser;
    if (!user) throw AppError.unauthorized();
    if (!roles.includes(user.role)) throw AppError.forbidden();
  };
}

export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) throw AppError.unauthorized();
  return request.authUser;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(import('@fastify/jwt'), {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtAccessTtl },
  });

  app.decorateRequest('authUser', undefined);
}
