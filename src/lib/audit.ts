import type { Prisma } from '@prisma/client';
import type { Db } from './prisma';
import { prisma } from './prisma';
import type { AuthUser } from './scope';
import type { Role } from '@prisma/client';

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'securityanswer',
  'securityanswerhash',
  'token',
  'tokenhash',
  'storagekey',
  'authorization',
  'access_token',
  'refreshtoken',
];

/** Removes secrets before persisting an audit snapshot. */
export function sanitizeAuditData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditData(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        result[key] = sanitizeAuditData(item, depth + 1);
      }
    }
    return result;
  }
  return value;
}

export interface AuditInput {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  clientId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  outcome?: 'SUCCESS' | 'FAILURE';
  ipAddress?: string | null;
}

type AuditDb = Pick<Db, 'auditLog'>;

export async function recordAudit(input: AuditInput, db: AuditDb = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      summary: input.summary ?? null,
      beforeData: input.before === undefined ? undefined : (sanitizeAuditData(input.before) as Prisma.InputJsonValue),
      afterData: input.after === undefined ? undefined : (sanitizeAuditData(input.after) as Prisma.InputJsonValue),
      outcome: input.outcome ?? 'SUCCESS',
      ipAddress: input.ipAddress ?? null,
    },
  });
}

export function auditActor(user: AuthUser | undefined) {
  return { actorId: user?.id ?? null, actorRole: user?.role ?? null };
}
