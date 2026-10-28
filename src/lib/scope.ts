import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}

export interface JwtPayload {
  sub: string;
  sid: string;
  role: Role;
  type: 'access';
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === 'SUPER_ADMIN';
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

/** Client-record scope for listing/reading users. */
export function clientWhereFor(user: AuthUser): Prisma.UserWhereInput {
  if (user.role === 'SUPER_ADMIN') return {};
  if (user.role === 'ADMIN') {
    return {
      role: 'USER',
      assignmentsAsClient: { some: { adminId: user.id, status: 'ACTIVE' } },
    };
  }
  return { id: user.id };
}

export function investmentWhereFor(user: AuthUser, extra: Prisma.InvestmentWhereInput = {}): Prisma.InvestmentWhereInput {
  if (user.role === 'SUPER_ADMIN') return extra;
  if (user.role === 'ADMIN') {
    return {
      AND: [
        extra,
        { client: { assignmentsAsClient: { some: { adminId: user.id, status: 'ACTIVE' } } } },
      ],
    };
  }
  return { AND: [extra, { clientId: user.id }] };
}

export function transactionWhereFor(user: AuthUser, extra: Prisma.TransactionWhereInput = {}): Prisma.TransactionWhereInput {
  if (user.role === 'SUPER_ADMIN') return extra;
  if (user.role === 'ADMIN') {
    return {
      AND: [
        extra,
        { client: { assignmentsAsClient: { some: { adminId: user.id, status: 'ACTIVE' } } } },
      ],
    };
  }
  return { AND: [extra, { clientId: user.id }] };
}

export function documentWhereFor(user: AuthUser, extra: Prisma.DocumentWhereInput = {}): Prisma.DocumentWhereInput {
  if (user.role === 'SUPER_ADMIN') return extra;
  if (user.role === 'ADMIN') {
    return {
      AND: [
        extra,
        { client: { assignmentsAsClient: { some: { adminId: user.id, status: 'ACTIVE' } } } },
      ],
    };
  }
  return { AND: [extra, { clientId: user.id }] };
}

export function assignmentWhereFor(user: AuthUser): Prisma.AdminAssignmentWhereInput {
  if (user.role === 'SUPER_ADMIN') return {};
  return {
    OR: [
      { adminId: user.id },
      { client: { assignmentsAsClient: { some: { adminId: user.id, status: 'ACTIVE' } } } },
    ],
  };
}

export async function assignedClientIds(adminId: string): Promise<string[]> {
  const rows = await prisma.adminAssignment.findMany({
    where: { adminId, status: 'ACTIVE' },
    select: { clientId: true },
  });
  return rows.map((row) => row.clientId);
}

/**
 * Resource-level client authorization. Returns 404 for inaccessible clients so
 * existence of other clients' records is never leaked.
 */
export async function assertClientAccess(user: AuthUser, clientId: string): Promise<void> {
  if (user.role === 'SUPER_ADMIN') return;
  if (user.role === 'USER') {
    if (user.id !== clientId) throw AppError.notFound('Client not found');
    return;
  }
  const assignment = await prisma.adminAssignment.findFirst({
    where: { clientId, adminId: user.id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!assignment) throw AppError.notFound('Client not found');
}

/** Only super admins may assign clients to other administrators. */
export function canAssignOthers(user: AuthUser): boolean {
  return user.role === 'SUPER_ADMIN';
}

/** Returns true when the user may mutate client records. */
export async function assertCanManageClient(user: AuthUser, clientId: string): Promise<void> {
  if (!isAdmin(user)) throw AppError.forbidden();
  await assertClientAccess(user, clientId);
}

export function assertAdmin(user: AuthUser): void {
  if (!isAdmin(user)) throw AppError.forbidden();
}

export function assertSuperAdmin(user: AuthUser): void {
  if (!isSuperAdmin(user)) throw AppError.forbidden('Super admin access required');
}
