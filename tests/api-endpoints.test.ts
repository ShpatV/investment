import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/passwords';
import { deleteStoredFile } from '../src/lib/storage';
import { getSetting, setSetting, SETTING_KEYS } from '../src/services/settings';

/**
 * End-to-end API coverage against the real PostgreSQL database.
 *
 * Every request is sent through Fastify's `inject`, which exercises the full
 * middleware chain (auth, validation, error handling, serialization) without
 * opening a network socket. Each request uses a unique `remoteAddress` so the
 * per-IP rate limits never interfere with the suite.
 */

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'ApiEndToEnd123!';
const changedPassword = 'ApiChanged456!';

let app: FastifyInstance;
let passwordHash: string;
let requestSeq = 0;

const fx = {
  superAdminId: '',
  adminId: '',
  admin2Id: '',
  clientAId: '',
  clientBId: '',
  flowClientId: '',
  institutionId: '',
  investmentAId: '',
  investmentBId: '',
  apiClientId: '',
  apiAdminId: '',
  toggleClientId: '',
  documentId: '',
};

const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

function nextIp(): string {
  requestSeq += 1;
  return `10.${(requestSeq >> 16) & 255}.${(requestSeq >> 8) & 255}.${requestSeq & 255}`;
}

async function call(options: InjectOptions) {
  return app.inject({ ...options, remoteAddress: nextIp() });
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const tokenCache = new Map<string, Tokens>();

async function login(email: string, portal?: 'client' | 'admin' | 'super-admin'): Promise<Tokens> {
  const cacheKey = `${portal ?? 'generic'}:${email}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;
  const response = await call({
    method: 'POST',
    url: portal ? `/api/auth/login/${portal}` : '/api/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode, response.body).toBe(200);
  const data = response.json().data;
  const tokens = { accessToken: data.accessToken as string, refreshToken: data.refreshToken as string };
  tokenCache.set(cacheKey, tokens);
  return tokens;
}

function emailFor(key: string): string {
  return `${key}.${suffix}@example.com`;
}

function multipart(
  fields: Record<string, string>,
  file: { filename: string; contentType: string; data: Buffer },
) {
  const boundary = `----investmenttest${Date.now()}${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  chunks.push(file.data);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function createFixtureUser(
  key: string,
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN',
  firstName: string,
) {
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName: 'Fixture',
      email: emailFor(key),
      role,
      status: 'ACTIVE',
      passwordHash,
    },
  });
  return user;
}

let publishedPriceSnapshot: Awaited<ReturnType<typeof prisma.publishedPrice.findMany>> = [];
const priceSnapshotStart = new Date();
const newsCacheKey = `news:${createHash('sha256').update(config.newsQuery).digest('hex').slice(0, 24)}`;
const publishedNewsKey = config.newsApiKey;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  passwordHash = await hashPassword(password);

  const superAdmin = await createFixtureUser('super', 'SUPER_ADMIN', 'Super');
  const admin = await createFixtureUser('admin', 'ADMIN', 'Assigned');
  const admin2 = await createFixtureUser('admin2', 'ADMIN', 'Other');
  const clientA = await createFixtureUser('clienta', 'USER', 'Client A');
  const clientB = await createFixtureUser('clientb', 'USER', 'Client B');
  const flowClient = await createFixtureUser('flowclient', 'USER', 'Flow Client');

  fx.superAdminId = superAdmin.id;
  fx.adminId = admin.id;
  fx.admin2Id = admin2.id;
  fx.clientAId = clientA.id;
  fx.clientBId = clientB.id;
  fx.flowClientId = flowClient.id;

  const institution = await prisma.institution.create({
    data: { name: `Fixture Capital ${suffix}`, description: 'Integration test institution' },
  });
  fx.institutionId = institution.id;

  await prisma.adminAssignment.create({
    data: {
      clientId: clientA.id,
      adminId: admin.id,
      assignedById: superAdmin.id,
      status: 'ACTIVE',
      notes: 'Primary fixture assignment',
    },
  });

  publishedPriceSnapshot = await prisma.publishedPrice.findMany();
}, 60_000);

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { contains: suffix } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const institutions = await prisma.institution.findMany({
    where: { name: { contains: suffix } },
    select: { id: true },
  });
  const institutionIds = institutions.map((institution) => institution.id);

  const documents = await prisma.document.findMany({
    where: { clientId: { in: userIds } },
    select: { storageKey: true },
  });
  for (const document of documents) await deleteStoredFile(document.storageKey);

  await prisma.authToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.document.deleteMany({ where: { clientId: { in: userIds } } });
  await prisma.transaction.deleteMany({ where: { clientId: { in: userIds } } });
  await prisma.investment.deleteMany({ where: { clientId: { in: userIds } } });
  await prisma.adminAssignment.deleteMany({
    where: { OR: [{ clientId: { in: userIds } }, { adminId: { in: userIds } }] },
  });
  await prisma.priceOverride.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.priceSnapshot.deleteMany({ where: { fetchedAt: { gte: priceSnapshotStart } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { clientId: { in: userIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } });
  await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });

  for (const row of publishedPriceSnapshot) {
    await prisma.publishedPrice.update({
      where: { commodity: row.commodity },
      data: {
        provider: row.provider,
        providerPrice: row.providerPrice,
        providerFetchedAt: row.providerFetchedAt,
        manualOverridePrice: row.manualOverridePrice,
        overrideReason: row.overrideReason,
        overrideStartsAt: row.overrideStartsAt,
        overrideEndsAt: row.overrideEndsAt,
        overrideById: row.overrideById,
        price: row.price,
        currency: row.currency,
        unit: row.unit,
        lastPublishedAt: row.lastPublishedAt,
      },
    });
  }

  config.newsApiKey = publishedNewsKey;

  await app.close();
  await prisma.$disconnect();
}, 120_000);

describe('service health and documentation', () => {
  it('reports liveness, database readiness and the root document', async () => {
    const health = await call({ method: 'GET', url: '/health' });
    expect(health.statusCode, health.body).toBe(200);
    expect(health.json().status).toBe('ok');

    const ready = await call({ method: 'GET', url: '/ready' });
    expect(ready.statusCode, ready.body).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready', database: 'connected' });

    const root = await call({ method: 'GET', url: '/' });
    expect(root.statusCode, root.body).toBe(200);
    expect(root.json().name).toContain('Investment');
  });

  it('serves the OpenAPI document', async () => {
    const response = await call({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode, response.body).toBe(200);
    const spec = response.json();
    expect(spec.openapi).toBeTruthy();
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/api/clients', '/api/investments']));
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    const response = await call({ method: 'GET', url: '/api/clients' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('authentication and account security', () => {
  it('signs in through the generic and role-scoped portals', async () => {
    const generic = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('clienta'), password },
    });
    expect(generic.statusCode, generic.body).toBe(200);
    expect(generic.json().data.user.id).toBe(fx.clientAId);
    expect(generic.json().data.user).not.toHaveProperty('passwordHash');
    expect(generic.json().data.tokenType).toBe('Bearer');

    const portal = await call({
      method: 'POST',
      url: '/api/auth/login/client',
      payload: { email: emailFor('clienta'), password },
    });
    expect(portal.statusCode, portal.body).toBe(200);
    expect(portal.json().data.portal).toBe('client');

    const wrongPortal = await call({
      method: 'POST',
      url: '/api/auth/login/admin',
      payload: { email: emailFor('clienta'), password },
    });
    expect(wrongPortal.statusCode).toBe(403);
  });

  it('returns the current account with advisor and unread counts', async () => {
    const { accessToken } = await login(emailFor('clienta'));
    const response = await call({ method: 'GET', url: '/api/auth/me', headers: auth(accessToken) });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.id).toBe(fx.clientAId);
    expect(response.json().data.advisor.id).toBe(fx.adminId);
    expect(typeof response.json().data.unreadNotifications).toBe('number');
  });

  it('updates permitted profile fields and audits the change', async () => {
    const { accessToken } = await login(emailFor('flowclient'));
    const updated = await call({
      method: 'PATCH',
      url: '/api/profile',
      headers: auth(accessToken),
      payload: { firstName: 'Updated', lastName: 'Flow', phone: '+1 555 0100', address: '1 Test Way' },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data).toMatchObject({
      firstName: 'Updated',
      lastName: 'Flow',
      phone: '+1 555 0100',
      address: '1 Test Way',
    });

    const fetched = await call({ method: 'GET', url: '/api/profile', headers: auth(accessToken) });
    expect(fetched.statusCode, fetched.body).toBe(200);
    expect(fetched.json().data.firstName).toBe('Updated');

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: fx.flowClientId, action: 'PROFILE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.afterData).toMatchObject({ firstName: 'Updated' });
  });

  it('stores a security question without ever returning the answer', async () => {
    const { accessToken } = await login(emailFor('flowclient'));
    const updated = await call({
      method: 'PATCH',
      url: '/api/auth/security-question',
      headers: auth(accessToken),
      payload: {
        securityQuestion: 'What is your favourite test?',
        securityAnswer: 'integration',
        currentPassword: password,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);

    const fetched = await call({
      method: 'GET',
      url: '/api/auth/security-question',
      headers: auth(accessToken),
    });
    expect(fetched.statusCode, fetched.body).toBe(200);
    expect(fetched.json().data.securityQuestion).toBe('What is your favourite test?');
    expect(fetched.json().data).not.toHaveProperty('securityAnswerHash');
  });

  it('changes a password, revokes sessions, and supports reset tokens', async () => {
    const session = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('flowclient'), password },
    });
    expect(session.statusCode, session.body).toBe(200);
    const accessToken = session.json().data.accessToken as string;

    const changed = await call({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: auth(accessToken),
      payload: { currentPassword: password, newPassword: changedPassword },
    });
    expect(changed.statusCode, changed.body).toBe(200);

    const revoked = await call({ method: 'GET', url: '/api/auth/me', headers: auth(accessToken) });
    expect(revoked.statusCode).toBe(401);

    const forgot = await call({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: emailFor('flowclient') },
    });
    expect(forgot.statusCode, forgot.body).toBe(200);
    const devToken = forgot.json().data.devToken as string;
    expect(devToken).toBeTruthy();

    const reset = await call({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: devToken, newPassword: password },
    });
    expect(reset.statusCode, reset.body).toBe(200);

    const relogin = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('flowclient'), password },
    });
    expect(relogin.statusCode, relogin.body).toBe(200);
  });

  it('rotates and revokes refresh tokens', async () => {
    const session = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('clienta'), password },
    });
    expect(session.statusCode, session.body).toBe(200);
    const refreshToken = session.json().data.refreshToken as string;

    const rotated = await call({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    });
    expect(rotated.statusCode, rotated.body).toBe(200);
    const nextRefresh = rotated.json().data.refreshToken as string;
    expect(nextRefresh).not.toBe(refreshToken);

    const logout = await call({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: nextRefresh },
    });
    expect(logout.statusCode).toBe(204);

    const reuse = await call({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: nextRefresh },
    });
    expect(reuse.statusCode).toBe(401);
  });
});

describe('client management', () => {
  it('creates a client with an initial password and an advisor', async () => {
    const { accessToken } = await login(emailFor('super'));
    const response = await call({
      method: 'POST',
      url: '/api/clients',
      headers: auth(accessToken),
      payload: {
        firstName: 'Api',
        lastName: 'Client',
        email: emailFor('apiclient'),
        phone: '+1 555 0111',
        assignedAdminId: fx.adminId,
        initialPassword: password,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json().data;
    expect(data.role).toBe('USER');
    expect(data.mustChangePassword).toBe(false);
    expect(data.advisor.id).toBe(fx.adminId);
    expect(data.invitation).toBeNull();
    fx.apiClientId = data.id;

    const duplicate = await call({
      method: 'POST',
      url: '/api/clients',
      headers: auth(accessToken),
      payload: {
        firstName: 'Duplicate',
        lastName: 'Client',
        email: emailFor('apiclient'),
        initialPassword: password,
      },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('lists only the clients an ordinary administrator is assigned to', async () => {
    const { accessToken } = await login(emailFor('admin'));

    const list = await call({
      method: 'GET',
      url: `/api/clients?search=${encodeURIComponent(suffix)}&pageSize=100`,
      headers: auth(accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    const ids = list.json().data.map((client: { id: string }) => client.id);
    expect(ids).toContain(fx.clientAId);
    expect(ids).toContain(fx.apiClientId);
    expect(ids).not.toContain(fx.clientBId);

    const own = await call({
      method: 'GET',
      url: `/api/clients/${fx.clientAId}`,
      headers: auth(accessToken),
    });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().data.advisor.id).toBe(fx.adminId);
    expect(own.json().data).toHaveProperty('portfolioSummary');
    expect(Array.isArray(own.json().data.investments)).toBe(true);

    const other = await call({
      method: 'GET',
      url: `/api/clients/${fx.clientBId}`,
      headers: auth(accessToken),
    });
    expect(other.statusCode).toBe(404);
  });

  it('prevents an administrator from assigning clients to a different administrator', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const response = await call({
      method: 'POST',
      url: '/api/clients',
      headers: auth(accessToken),
      payload: {
        firstName: 'Wrong',
        lastName: 'Advisor',
        email: emailFor('wrongclient'),
        assignedAdminId: fx.admin2Id,
        initialPassword: password,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('updates client personal information', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const response = await call({
      method: 'PATCH',
      url: `/api/clients/${fx.apiClientId}`,
      headers: auth(accessToken),
      payload: { phone: '+1 555 0999', address: '99 Updated Street' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ phone: '+1 555 0999', address: '99 Updated Street' });

    const profile = await prisma.user.findUnique({ where: { id: fx.apiClientId } });
    expect(profile?.phone).toBe('+1 555 0999');
  });

  it('issues a new invitation token in development mode', async () => {
    const { accessToken } = await login(emailFor('super'));
    const response = await call({
      method: 'POST',
      url: `/api/clients/${fx.apiClientId}/invite`,
      headers: auth(accessToken),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.delivery).toBe('manual');
    expect(typeof response.json().data.token).toBe('string');
  });

  it('disables and reactivates a client while revoking their sessions', async () => {
    const { accessToken } = await login(emailFor('super'));
    const created = await call({
      method: 'POST',
      url: '/api/clients',
      headers: auth(accessToken),
      payload: {
        firstName: 'Toggle',
        lastName: 'Client',
        email: emailFor('toggleclient'),
        assignedAdminId: fx.adminId,
        initialPassword: password,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    fx.toggleClientId = created.json().data.id;

    const clientTokens = await login(emailFor('toggleclient'));

    const disabled = await call({
      method: 'POST',
      url: `/api/clients/${fx.toggleClientId}/disable`,
      headers: auth(accessToken),
    });
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect(disabled.json().data.status).toBe('DISABLED');

    const blocked = await call({ method: 'GET', url: '/api/auth/me', headers: auth(clientTokens.accessToken) });
    expect(blocked.statusCode).toBe(401);

    const loginBlocked = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('toggleclient'), password },
    });
    expect(loginBlocked.statusCode).toBe(403);
    expect(loginBlocked.json().error.code).toBe('ACCOUNT_DISABLED');

    const reactivated = await call({
      method: 'POST',
      url: `/api/clients/${fx.toggleClientId}/reactivate`,
      headers: auth(accessToken),
    });
    expect(reactivated.statusCode, reactivated.body).toBe(200);
    expect(reactivated.json().data.status).toBe('ACTIVE');

    const loginAgain = await call({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: emailFor('toggleclient'), password },
    });
    expect(loginAgain.statusCode, loginAgain.body).toBe(200);
  });
});

describe('administrator and assignment management', () => {
  it('creates an administrator through the API and lists administrator accounts', async () => {
    const { accessToken } = await login(emailFor('super'));
    const created = await call({
      method: 'POST',
      url: '/api/admins',
      headers: auth(accessToken),
      payload: {
        firstName: 'Api',
        lastName: 'Admin',
        email: emailFor('apiadmin'),
        role: 'ADMIN',
        initialPassword: password,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data.role).toBe('ADMIN');
    fx.apiAdminId = created.json().data.id;

    const list = await call({
      method: 'GET',
      url: `/api/admins?search=${encodeURIComponent(suffix)}&pageSize=100`,
      headers: auth(accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    const ids = list.json().data.map((admin: { id: string }) => admin.id);
    expect(ids).toEqual(expect.arrayContaining([fx.adminId, fx.admin2Id, fx.apiAdminId]));

    const detail = await call({
      method: 'GET',
      url: `/api/admins/${fx.apiAdminId}`,
      headers: auth(accessToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.id).toBe(fx.apiAdminId);
  });

  it('lets a super admin update and disable/reactivate an administrator', async () => {
    const { accessToken } = await login(emailFor('super'));
    const updated = await call({
      method: 'PATCH',
      url: `/api/admins/${fx.apiAdminId}`,
      headers: auth(accessToken),
      payload: { firstName: 'Renamed', phone: '+1 555 0123' },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data).toMatchObject({ firstName: 'Renamed', phone: '+1 555 0123' });

    const disabled = await call({
      method: 'POST',
      url: `/api/admins/${fx.apiAdminId}/disable`,
      headers: auth(accessToken),
    });
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect(disabled.json().data.status).toBe('DISABLED');

    const reactivated = await call({
      method: 'POST',
      url: `/api/admins/${fx.apiAdminId}/reactivate`,
      headers: auth(accessToken),
    });
    expect(reactivated.statusCode, reactivated.body).toBe(200);
    expect(reactivated.json().data.status).toBe('ACTIVE');
  });

  it('enforces administrator self-scoping on admin detail endpoints', async () => {
    const { accessToken } = await login(emailFor('admin'));

    const self = await call({
      method: 'GET',
      url: `/api/admins/${fx.adminId}`,
      headers: auth(accessToken),
    });
    expect(self.statusCode, self.body).toBe(200);

    const other = await call({
      method: 'GET',
      url: `/api/admins/${fx.admin2Id}`,
      headers: auth(accessToken),
    });
    expect(other.statusCode).toBe(403);

    const otherClients = await call({
      method: 'GET',
      url: `/api/admins/${fx.admin2Id}/clients`,
      headers: auth(accessToken),
    });
    expect(otherClients.statusCode).toBe(403);

    const ownClients = await call({
      method: 'GET',
      url: `/api/admins/${fx.adminId}/clients?pageSize=100`,
      headers: auth(accessToken),
    });
    expect(ownClients.statusCode, ownClients.body).toBe(200);
    expect(ownClients.json().data.some((client: { id: string }) => client.id === fx.clientAId)).toBe(true);
  });

  it('assigns, updates and removes a client assignment', async () => {
    const { accessToken } = await login(emailFor('super'));

    const created = await call({
      method: 'POST',
      url: '/api/assignments',
      headers: auth(accessToken),
      payload: { clientId: fx.clientBId, adminId: fx.admin2Id, notes: 'Temporary coverage' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const assignmentId = created.json().data.id as string;
    expect(created.json().data.status).toBe('ACTIVE');

    const list = await call({
      method: 'GET',
      url: `/api/assignments?clientId=${fx.clientBId}`,
      headers: auth(accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data.some((row: { id: string }) => row.id === assignmentId)).toBe(true);

    const detail = await call({
      method: 'GET',
      url: `/api/assignments/${assignmentId}`,
      headers: auth(accessToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.adminId).toBe(fx.admin2Id);

    const patched = await call({
      method: 'PATCH',
      url: `/api/assignments/${assignmentId}`,
      headers: auth(accessToken),
      payload: { notes: 'Coverage extended' },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json().data.notes).toBe('Coverage extended');

    const removed = await call({
      method: 'DELETE',
      url: `/api/assignments/${assignmentId}`,
      headers: auth(accessToken),
    });
    expect(removed.statusCode).toBe(204);

    const unassigned = await call({
      method: 'GET',
      url: `/api/assignments/unassigned?search=${encodeURIComponent(emailFor('clientb'))}`,
      headers: auth(accessToken),
    });
    expect(unassigned.statusCode, unassigned.body).toBe(200);
    expect(unassigned.json().data.some((client: { id: string }) => client.id === fx.clientBId)).toBe(true);
  });

  it('blocks ordinary administrators from creating assignments when disabled', async () => {
    const previous = await getSetting<boolean>(SETTING_KEYS.allowAdminSelfAssign, false);
    await setSetting(SETTING_KEYS.allowAdminSelfAssign, false);
    try {
      const { accessToken } = await login(emailFor('admin2'));
      const response = await call({
        method: 'POST',
        url: '/api/assignments',
        headers: auth(accessToken),
        payload: { clientId: fx.clientBId, adminId: fx.admin2Id },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await setSetting(SETTING_KEYS.allowAdminSelfAssign, previous);
    }
  });
});

describe('institution management', () => {
  it('creates, filters, updates and disables an unused institution', async () => {
    const superTokens = await login(emailFor('super'));
    const adminTokens = await login(emailFor('admin'));

    const created = await call({
      method: 'POST',
      url: '/api/institutions',
      headers: auth(superTokens.accessToken),
      payload: { name: `Spare Institution ${suffix}`, description: 'Unused fixture' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const institutionId = created.json().data.id as string;
    expect(created.json().data.status).toBe('ACTIVE');

    const duplicate = await call({
      method: 'POST',
      url: '/api/institutions',
      headers: auth(superTokens.accessToken),
      payload: { name: `Spare Institution ${suffix}` },
    });
    expect(duplicate.statusCode).toBe(409);

    const list = await call({
      method: 'GET',
      url: `/api/institutions?search=${encodeURIComponent(suffix)}&pageSize=100`,
      headers: auth(adminTokens.accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data.some((row: { id: string }) => row.id === institutionId)).toBe(true);

    const patched = await call({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}`,
      headers: auth(adminTokens.accessToken),
      payload: { description: 'Updated by an administrator' },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    expect(patched.json().data.description).toBe('Updated by an administrator');

    const statusDenied = await call({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}`,
      headers: auth(adminTokens.accessToken),
      payload: { status: 'DISABLED' },
    });
    expect(statusDenied.statusCode).toBe(403);

    const statusAllowed = await call({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}`,
      headers: auth(superTokens.accessToken),
      payload: { status: 'DISABLED' },
    });
    expect(statusAllowed.statusCode, statusAllowed.body).toBe(200);
    expect(statusAllowed.json().data.status).toBe('DISABLED');

    const deleted = await call({
      method: 'DELETE',
      url: `/api/institutions/${institutionId}`,
      headers: auth(superTokens.accessToken),
    });
    expect(deleted.statusCode).toBe(204);
  });
});

describe('investment management', () => {
  it('creates an investment and returns its projection', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const response = await call({
      method: 'POST',
      url: '/api/investments',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        institutionId: fx.institutionId,
        name: `API Test Investment ${suffix}`,
        principalAmount: '100000.00',
        currency: 'USD',
        annualInterestRate: '5.25',
        compoundingFrequency: 'SIMPLE',
        startDate: '2025-01-01',
        maturityDate: '2027-01-01',
        status: 'ACTIVE',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json().data;
    expect(data).toMatchObject({
      clientId: fx.clientAId,
      name: `API Test Investment ${suffix}`,
      principalAmount: 100000,
      currentPrincipal: 100000,
      annualInterestRate: 5.25,
      compoundingFrequency: 'SIMPLE',
      startDate: '2025-01-01',
      maturityDate: '2027-01-01',
      status: 'ACTIVE',
    });
    expect(data.projectedMaturityBalance).toBeGreaterThan(100000);
    expect(data.institution.id).toBe(fx.institutionId);
    fx.investmentAId = data.id;
  });

  it('creates a second investment for another client', async () => {
    const { accessToken } = await login(emailFor('super'));
    const response = await call({
      method: 'POST',
      url: '/api/investments',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientBId,
        institutionId: fx.institutionId,
        name: `Second Test Investment ${suffix}`,
        principalAmount: '50000.00',
        annualInterestRate: '4.00',
        startDate: '2025-06-01',
        maturityDate: '2026-06-01',
        status: 'ACTIVE',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    fx.investmentBId = response.json().data.id;
  });

  it('lists and filters investments with role scoping', async () => {
    const superTokens = await login(emailFor('super'));
    const clientTokens = await login(emailFor('clienta'));

    const filtered = await call({
      method: 'GET',
      url: `/api/investments?search=${encodeURIComponent(suffix)}&pageSize=100`,
      headers: auth(superTokens.accessToken),
    });
    expect(filtered.statusCode, filtered.body).toBe(200);
    const ids = filtered.json().data.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([fx.investmentAId, fx.investmentBId]));

    const own = await call({
      method: 'GET',
      url: `/api/investments?clientId=${fx.clientBId}&pageSize=100`,
      headers: auth(clientTokens.accessToken),
    });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().data.map((row: { id: string }) => row.id)).toEqual([fx.investmentAId]);

    const detail = await call({
      method: 'GET',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(clientTokens.accessToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.id).toBe(fx.investmentAId);
    expect(Array.isArray(detail.json().data.transactions)).toBe(true);
    expect(Array.isArray(detail.json().data.documents)).toBe(true);

    const other = await call({
      method: 'GET',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth((await login(emailFor('clientb'))).accessToken),
    });
    expect(other.statusCode).toBe(404);
  });

  it('updates investment terms and rejects invalid date ranges', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const updated = await call({
      method: 'PATCH',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(accessToken),
      payload: { annualInterestRate: '6.5', name: `Renamed Investment ${suffix}` },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data.annualInterestRate).toBe(6.5);
    expect(updated.json().data.name).toBe(`Renamed Investment ${suffix}`);

    const invalid = await call({
      method: 'PATCH',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(accessToken),
      payload: { maturityDate: '2024-01-01' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('refuses to remove an institution that has investments', async () => {
    const { accessToken } = await login(emailFor('super'));
    const response = await call({
      method: 'DELETE',
      url: `/api/institutions/${fx.institutionId}`,
      headers: auth(accessToken),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('investment records');
  });
});

describe('transaction management', () => {
  let depositId = '';
  let withdrawalId = '';

  it('records a completed principal deposit', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const response = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        investmentId: fx.investmentAId,
        type: 'DEPOSIT',
        amount: '1000.00',
        status: 'COMPLETED',
        transactionDate: '2025-02-01',
        description: 'Integration deposit',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json().data;
    expect(data.affectsPrincipal).toBe(true);
    expect(data.status).toBe('COMPLETED');
    expect(data.investment.id).toBe(fx.investmentAId);
    depositId = data.id;

    const investment = await call({
      method: 'GET',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(accessToken),
    });
    expect(investment.json().data.currentPrincipal).toBe(101000);
  });

  it('records a pending withdrawal and only applies it once completed', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const created = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        investmentId: fx.investmentAId,
        type: 'WITHDRAWAL',
        amount: '500.00',
        status: 'PENDING',
        transactionDate: '2025-03-01',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    withdrawalId = created.json().data.id;

    const before = await call({
      method: 'GET',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(accessToken),
    });
    expect(before.json().data.currentPrincipal).toBe(101000);

    const completed = await call({
      method: 'PATCH',
      url: `/api/transactions/${withdrawalId}`,
      headers: auth(accessToken),
      payload: { status: 'COMPLETED' },
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json().data.status).toBe('COMPLETED');

    const after = await call({
      method: 'GET',
      url: `/api/investments/${fx.investmentAId}`,
      headers: auth(accessToken),
    });
    expect(after.json().data.currentPrincipal).toBe(100500);
  });

  it('keeps completed transactions immutable except for the description', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const rejected = await call({
      method: 'PATCH',
      url: `/api/transactions/${withdrawalId}`,
      headers: auth(accessToken),
      payload: { amount: '750.00' },
    });
    expect(rejected.statusCode).toBe(409);

    const allowed = await call({
      method: 'PATCH',
      url: `/api/transactions/${withdrawalId}`,
      headers: auth(accessToken),
      payload: { description: 'Corrected reference' },
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.json().data.description).toBe('Corrected reference');
  });

  it('lists transactions with filters and enforces client isolation', async () => {
    const adminTokens = await login(emailFor('admin'));
    const clientTokens = await login(emailFor('clienta'));
    const otherClientTokens = await login(emailFor('clientb'));

    const filtered = await call({
      method: 'GET',
      url: `/api/transactions?investmentId=${fx.investmentAId}&type=WITHDRAWAL&status=COMPLETED`,
      headers: auth(adminTokens.accessToken),
    });
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json().data.some((row: { id: string }) => row.id === withdrawalId)).toBe(true);

    const dated = await call({
      method: 'GET',
      url: `/api/transactions?investmentId=${fx.investmentAId}&from=2025-01-01&to=2025-12-31&pageSize=100`,
      headers: auth(adminTokens.accessToken),
    });
    expect(dated.statusCode, dated.body).toBe(200);
    const datedIds = dated.json().data.map((row: { id: string }) => row.id);
    expect(datedIds).toEqual(expect.arrayContaining([depositId, withdrawalId]));

    const own = await call({
      method: 'GET',
      url: `/api/transactions/${depositId}`,
      headers: auth(clientTokens.accessToken),
    });
    expect(own.statusCode, own.body).toBe(200);

    const forbidden = await call({
      method: 'GET',
      url: `/api/transactions/${depositId}`,
      headers: auth(otherClientTokens.accessToken),
    });
    expect(forbidden.statusCode).toBe(404);
  });

  it('validates principal-affecting rules', async () => {
    const { accessToken } = await login(emailFor('admin'));

    const interestWithPrincipal = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        investmentId: fx.investmentAId,
        type: 'INTEREST',
        amount: '100.00',
        status: 'COMPLETED',
        affectsPrincipal: true,
        transactionDate: '2025-04-01',
      },
    });
    expect(interestWithPrincipal.statusCode).toBe(400);

    const interestWithoutInvestment = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        type: 'INTEREST',
        amount: '100.00',
        status: 'COMPLETED',
        transactionDate: '2025-04-01',
      },
    });
    expect(interestWithoutInvestment.statusCode).toBe(400);

    const depositWithoutInvestment = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        type: 'DEPOSIT',
        amount: '100.00',
        status: 'COMPLETED',
        affectsPrincipal: true,
        transactionDate: '2025-04-01',
      },
    });
    expect(depositWithoutInvestment.statusCode).toBe(400);

    const wrongClient = await call({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(accessToken),
      payload: {
        clientId: fx.clientAId,
        investmentId: fx.investmentBId,
        type: 'DEPOSIT',
        amount: '100.00',
        status: 'COMPLETED',
        transactionDate: '2025-04-01',
      },
    });
    expect(wrongClient.statusCode).toBe(400);
  });
});

describe('document storage and signed downloads', () => {
  it('uploads a document, lists it, and downloads the exact bytes', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const body = multipart(
      {
        title: `Integration Statement ${suffix}`,
        category: 'STATEMENT',
        clientId: fx.clientAId,
        investmentId: fx.investmentAId,
        description: 'Quarterly statement',
      },
      { filename: 'statement.pdf', contentType: 'application/pdf', data: pdfBytes },
    );

    const uploaded = await call({
      method: 'POST',
      url: '/api/documents',
      headers: { ...auth(accessToken), ...body.headers },
      payload: body.payload,
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const data = uploaded.json().data;
    expect(data).toMatchObject({
      clientId: fx.clientAId,
      investmentId: fx.investmentAId,
      title: `Integration Statement ${suffix}`,
      category: 'STATEMENT',
      originalFilename: 'statement.pdf',
      mimeType: 'application/pdf',
      fileSize: pdfBytes.byteLength,
      status: 'ACTIVE',
      uploadedBy: { id: fx.adminId },
    });
    fx.documentId = data.id;

    const list = await call({
      method: 'GET',
      url: `/api/documents?clientId=${fx.clientAId}&search=${encodeURIComponent(suffix)}`,
      headers: auth(accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data.some((row: { id: string }) => row.id === fx.documentId)).toBe(true);

    const metadata = await call({
      method: 'GET',
      url: `/api/documents/${fx.documentId}`,
      headers: auth(accessToken),
    });
    expect(metadata.statusCode, metadata.body).toBe(200);
    expect(metadata.json().data.fileExtension).toBe('pdf');

    const downloaded = await call({
      method: 'GET',
      url: `/api/documents/${fx.documentId}/download`,
      headers: auth(accessToken),
    });
    expect(downloaded.statusCode, downloaded.body).toBe(200);
    expect(downloaded.headers['content-type']).toContain('application/pdf');
    expect(String(downloaded.headers['content-disposition'])).toContain('attachment');
    expect(downloaded.rawPayload.equals(pdfBytes)).toBe(true);
  });

  it('issues a short-lived signed URL and rejects a tampered signature', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const signed = await call({
      method: 'POST',
      url: `/api/documents/${fx.documentId}/signed-url`,
      headers: auth(accessToken),
    });
    expect(signed.statusCode, signed.body).toBe(200);
    const url = new URL(signed.json().data.url as string);

    const downloaded = await call({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(downloaded.statusCode, downloaded.body).toBe(200);
    expect(downloaded.rawPayload.equals(pdfBytes)).toBe(true);

    const tampered = new URL(url.toString());
    tampered.searchParams.set('signature', `${tampered.searchParams.get('signature')}x`);
    const rejected = await call({ method: 'GET', url: `${tampered.pathname}${tampered.search}` });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe('INVALID_SIGNATURE');
  });

  it('restricts client uploads to their own record and safe categories', async () => {
    const { accessToken } = await login(emailFor('clienta'));

    const allowedBody = multipart(
      { title: `Passport ${suffix}`, category: 'IDENTIFICATION' },
      { filename: 'passport.pdf', contentType: 'application/pdf', data: pdfBytes },
    );
    const allowed = await call({
      method: 'POST',
      url: '/api/documents',
      headers: { ...auth(accessToken), ...allowedBody.headers },
      payload: allowedBody.payload,
    });
    expect(allowed.statusCode, allowed.body).toBe(201);
    expect(allowed.json().data.clientId).toBe(fx.clientAId);

    const body = multipart(
      { title: 'Agreement', category: 'INVESTMENT_AGREEMENT' },
      { filename: 'agreement.pdf', contentType: 'application/pdf', data: pdfBytes },
    );
    const forbidden = await call({
      method: 'POST',
      url: '/api/documents',
      headers: { ...auth(accessToken), ...body.headers },
      payload: body.payload,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rejects unsupported content types', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const body = multipart(
      { title: 'Bad upload', category: 'OTHER', clientId: fx.clientAId },
      { filename: 'payload.html', contentType: 'text/html', data: Buffer.from('<html></html>') },
    );
    const response = await call({
      method: 'POST',
      url: '/api/documents',
      headers: { ...auth(accessToken), ...body.headers },
      payload: body.payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain('Unsupported file type');
  });

  it('archives a document through the dedicated archive endpoint', async () => {
    const admin = await login(emailFor('admin'));
    const body = multipart(
      { title: `Archive Me ${suffix}`, category: 'STATEMENT', clientId: fx.clientAId },
      { filename: 'archive.pdf', contentType: 'application/pdf', data: pdfBytes },
    );
    const uploaded = await call({
      method: 'POST',
      url: '/api/documents',
      headers: { ...auth(admin.accessToken), ...body.headers },
      payload: body.payload,
    });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const documentId = uploaded.json().data.id as string;

    const client = await login(emailFor('clienta'));
    const forbidden = await call({
      method: 'POST',
      url: `/api/documents/${documentId}/archive`,
      headers: auth(client.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);

    const archived = await call({
      method: 'POST',
      url: `/api/documents/${documentId}/archive`,
      headers: auth(admin.accessToken),
    });
    expect(archived.statusCode, archived.body).toBe(204);

    const metadata = await call({
      method: 'GET',
      url: `/api/documents/${documentId}`,
      headers: auth(admin.accessToken),
    });
    expect(metadata.statusCode, metadata.body).toBe(200);
    expect(metadata.json().data.status).toBe('ARCHIVED');
    expect(metadata.json().data.archivedAt).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DOCUMENT_ARCHIVED', entityId: documentId },
    });
    expect(audit).not.toBeNull();

    // Archiving is idempotent.
    const again = await call({
      method: 'POST',
      url: `/api/documents/${documentId}/archive`,
      headers: auth(admin.accessToken),
    });
    expect(again.statusCode).toBe(204);
  });

  it('prevents other clients from reading document metadata and archives for administrators', async () => {
    const otherClient = await login(emailFor('clientb'));
    const denied = await call({
      method: 'GET',
      url: `/api/documents/${fx.documentId}`,
      headers: auth(otherClient.accessToken),
    });
    expect(denied.statusCode).toBe(404);

    const admin = await login(emailFor('admin'));
    const archived = await call({
      method: 'DELETE',
      url: `/api/documents/${fx.documentId}`,
      headers: auth(admin.accessToken),
    });
    expect(archived.statusCode).toBe(204);

    const metadata = await call({
      method: 'GET',
      url: `/api/documents/${fx.documentId}`,
      headers: auth(admin.accessToken),
    });
    expect(metadata.statusCode, metadata.body).toBe(200);
    expect(metadata.json().data.status).toBe('ARCHIVED');
  });
});

describe('dashboards', () => {
  it('returns an accurate client dashboard', async () => {
    const { accessToken } = await login(emailFor('clienta'));
    const response = await call({ method: 'GET', url: '/api/dashboard/client', headers: auth(accessToken) });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.client.id).toBe(fx.clientAId);
    expect(data.summary.totalInvested).toBe(100500);
    expect(data.summary.activeInvestments).toBe(1);
    expect(data.portfolio.some((row: { id: string }) => row.id === fx.investmentAId)).toBe(true);
    expect(data.planning.timeline.some((row: { investmentId: string }) => row.investmentId === fx.investmentAId)).toBe(
      true,
    );
    expect(data.assumptions.dayCount).toBe('Actual/365');
  });

  it('scopes client dashboards for administrators', async () => {
    const admin = await login(emailFor('admin'));
    const allowed = await call({
      method: 'GET',
      url: `/api/dashboard/client?clientId=${fx.clientAId}`,
      headers: auth(admin.accessToken),
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.json().data.client.id).toBe(fx.clientAId);

    const denied = await call({
      method: 'GET',
      url: `/api/dashboard/client?clientId=${fx.clientBId}`,
      headers: auth(admin.accessToken),
    });
    expect(denied.statusCode).toBe(404);

    const clientToken = await login(emailFor('clienta'));
    const otherClient = await call({
      method: 'GET',
      url: `/api/dashboard/client?clientId=${fx.clientBId}`,
      headers: auth(clientToken.accessToken),
    });
    expect(otherClient.statusCode).toBe(404);
  });

  it('returns administrative metrics for the assigned scope', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const response = await call({ method: 'GET', url: '/api/dashboard/admin', headers: auth(accessToken) });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.scope).toBe('ASSIGNED_CLIENTS');
    expect(data.metrics.totalClients).toBeGreaterThanOrEqual(1);
    expect(data.metrics.totalInvestments).toBeGreaterThanOrEqual(1);
    expect(data.metrics.aum).toBe(100500);
    expect(Array.isArray(data.recentAudit)).toBe(true);
    expect(data.prices).toHaveLength(2);

    const client = await login(emailFor('clienta'));
    const forbidden = await call({
      method: 'GET',
      url: '/api/dashboard/admin',
      headers: auth(client.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('system settings', () => {
  it('exposes settings to super admins and effective permissions to administrators', async () => {
    const superTokens = await login(emailFor('super'));
    const adminTokens = await login(emailFor('admin'));

    const settings = await call({ method: 'GET', url: '/api/settings', headers: auth(superTokens.accessToken) });
    expect(settings.statusCode, settings.body).toBe(200);
    expect(settings.json().data.settings).toHaveProperty(SETTING_KEYS.maturityReminderDays);
    expect(settings.json().data.editableKeys).toEqual(expect.arrayContaining(Object.values(SETTING_KEYS)));

    const denied = await call({ method: 'GET', url: '/api/settings', headers: auth(adminTokens.accessToken) });
    expect(denied.statusCode).toBe(403);

    const effective = await call({
      method: 'GET',
      url: '/api/settings/effective',
      headers: auth(adminTokens.accessToken),
    });
    expect(effective.statusCode, effective.body).toBe(200);
    expect(effective.json().data).toMatchObject({
      role: 'ADMIN',
      canManageAdmins: false,
      canManageSettings: false,
    });
  });

  it('persists a super admin setting update and rejects administrator updates', async () => {
    const superTokens = await login(emailFor('super'));
    const adminTokens = await login(emailFor('admin'));
    const previous = await getSetting<number>(SETTING_KEYS.maturityReminderDays, 30);

    try {
      const updated = await call({
        method: 'PATCH',
        url: '/api/settings',
        headers: auth(superTokens.accessToken),
        payload: { maturityReminderDays: 45 },
      });
      expect(updated.statusCode, updated.body).toBe(200);
      expect(updated.json().data.settings[SETTING_KEYS.maturityReminderDays]).toBe(45);
      expect(await getSetting<number>(SETTING_KEYS.maturityReminderDays, 30)).toBe(45);

      const denied = await call({
        method: 'PATCH',
        url: '/api/settings',
        headers: auth(adminTokens.accessToken),
        payload: { maturityReminderDays: 10 },
      });
      expect(denied.statusCode).toBe(403);
    } finally {
      await setSetting(SETTING_KEYS.maturityReminderDays, previous);
    }
  });
});

describe('audit log', () => {
  it('lets a super admin search the audit trail', async () => {
    const { accessToken } = await login(emailFor('super'));
    const response = await call({
      method: 'GET',
      url: `/api/audit-logs?action=CLIENT_CREATED&entityId=${fx.apiClientId}&pageSize=100`,
      headers: auth(accessToken),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.length).toBeGreaterThanOrEqual(1);
    const log = response.json().data[0];
    expect(log.action).toBe('CLIENT_CREATED');
    expect(log.entityId).toBe(fx.apiClientId);
    expect(typeof log.id).toBe('string');

    const detail = await call({
      method: 'GET',
      url: `/api/audit-logs/${log.id}`,
      headers: auth(accessToken),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.id).toBe(log.id);
  });

  it('hides other clients from ordinary administrators and blocks clients', async () => {
    const adminTokens = await login(emailFor('admin'));
    const hidden = await call({
      method: 'GET',
      url: `/api/audit-logs?clientId=${fx.clientBId}`,
      headers: auth(adminTokens.accessToken),
    });
    expect(hidden.statusCode).toBe(404);

    const own = await call({
      method: 'GET',
      url: `/api/audit-logs?clientId=${fx.clientAId}&pageSize=100`,
      headers: auth(adminTokens.accessToken),
    });
    expect(own.statusCode, own.body).toBe(200);

    const clientTokens = await login(emailFor('clienta'));
    const forbidden = await call({
      method: 'GET',
      url: '/api/audit-logs',
      headers: auth(clientTokens.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('market prices', () => {
  it('lists published prices and per-commodity metadata', async () => {
    const { accessToken } = await login(emailFor('clienta'));
    const response = await call({ method: 'GET', url: '/api/prices', headers: auth(accessToken) });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    expect(data.prices).toHaveLength(2);
    expect(data.prices.map((row: { commodity: string }) => row.commodity).sort()).toEqual(['GOLD', 'OIL']);
    expect(data).toHaveProperty('staleAfterMinutes');
    expect(data.canOverride).toBe(false);

    const gold = await call({ method: 'GET', url: '/api/prices/GOLD', headers: auth(accessToken) });
    expect(gold.statusCode, gold.body).toBe(200);
    expect(gold.json().data.meta.label).toBe('Gold');
  });

  it('refreshes from the provider using a stubbed HTTP response', async () => {
    const { accessToken } = await login(emailFor('admin'));
    const originalFetch = globalThis.fetch;
    const csv = 'Symbol,Date,Time,Open,High,Low,Close\nXAUUSD,2026-10-30,12:00:00,1,1,1,4100.50\n';
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => csv,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    try {
      const response = await call({
        method: 'POST',
        url: '/api/prices/refresh',
        headers: auth(accessToken),
      });
      expect(response.statusCode, response.body).toBe(200);
      const results = response.json().data.results as Array<{ commodity: string; success: boolean; price?: number }>;
      expect(results).toHaveLength(2);
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.map((result) => result.price)).toEqual([4100.5, 4100.5]);

      const prices = await call({ method: 'GET', url: '/api/prices', headers: auth(accessToken) });
      const gold = prices.json().data.prices.find((row: { commodity: string }) => row.commodity === 'GOLD');
      expect(gold.status).toBe('LIVE');
      expect(gold.source).toBe('PROVIDER');
      expect(gold.price).toBe(4100.5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports manual overrides, history and clearing', async () => {
    const { accessToken } = await login(emailFor('super'));

    const overridden = await call({
      method: 'POST',
      url: '/api/prices/GOLD/override',
      headers: auth(accessToken),
      payload: { price: '4200.00', reason: `Integration override ${suffix}` },
    });
    expect(overridden.statusCode, overridden.body).toBe(201);
    expect(overridden.json().data.price.status).toBe('MANUAL_OVERRIDE');
    expect(overridden.json().data.price.price).toBe(4200);
    expect(overridden.json().data.overrideId).toBeTruthy();

    const current = await call({ method: 'GET', url: '/api/prices/GOLD', headers: auth(accessToken) });
    expect(current.json().data.status).toBe('MANUAL_OVERRIDE');
    expect(current.json().data.price).toBe(4200);

    const history = await call({
      method: 'GET',
      url: '/api/prices/GOLD/history',
      headers: auth(accessToken),
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(
      history.json().data.overrides.some((row: { reason: string }) => row.reason === `Integration override ${suffix}`),
    ).toBe(true);
    expect(history.json().data.snapshots.length).toBeGreaterThanOrEqual(1);

    const cleared = await call({
      method: 'DELETE',
      url: '/api/prices/GOLD/override',
      headers: auth(accessToken),
    });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().data.cleared).toBe(true);
    expect(cleared.json().data.price.status).not.toBe('MANUAL_OVERRIDE');

    const alreadyClear = await call({
      method: 'DELETE',
      url: '/api/prices/GOLD/override',
      headers: auth(accessToken),
    });
    expect(alreadyClear.statusCode, alreadyClear.body).toBe(200);
    expect(alreadyClear.json().data.cleared).toBe(false);
  });

  it('denies ordinary administrator overrides when the setting is off', async () => {
    const previous = await getSetting<boolean>(SETTING_KEYS.allowAdminPriceOverride, false);
    await setSetting(SETTING_KEYS.allowAdminPriceOverride, false);
    try {
      const { accessToken } = await login(emailFor('admin'));
      const response = await call({
        method: 'POST',
        url: '/api/prices/OIL/override',
        headers: auth(accessToken),
        payload: { price: '80.00', reason: 'Should be denied' },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await setSetting(SETTING_KEYS.allowAdminPriceOverride, previous);
    }
  });
});

describe('market news', () => {
  it('reports an unconfigured provider without fabricating articles', async () => {
    const { accessToken } = await login(emailFor('clienta'));
    await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    const previousKey = config.newsApiKey;
    config.newsApiKey = '';
    try {
      const response = await call({ method: 'GET', url: '/api/news', headers: auth(accessToken) });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.status).toBe('unconfigured');
      expect(response.json().data.articles).toEqual([]);
    } finally {
      config.newsApiKey = previousKey;
    }
  });

  it('maps provider articles, caches them, and falls back to stale cache', async () => {
    const { accessToken } = await login(emailFor('clienta'));
    await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    const previousKey = config.newsApiKey;
    config.newsApiKey = 'test-news-key';
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          articles: [
            {
              title: 'Gold climbs on demand',
              url: 'https://news.example.com/gold',
              description: 'Gold prices rose.',
              source: { name: 'Example News' },
              publishedAt: '2026-10-30T08:00:00.000Z',
              urlToImage: 'https://news.example.com/gold.png',
            },
            { title: '[Removed]', url: '[Removed]', source: { name: 'Removed' } },
          ],
        }),
        text: async () => '',
      })) as unknown as typeof fetch;

      const fresh = await call({ method: 'GET', url: '/api/news?limit=5', headers: auth(accessToken) });
      expect(fresh.statusCode, fresh.body).toBe(200);
      const freshData = fresh.json().data;
      expect(freshData.status).toBe('ok');
      expect(freshData.cached).toBe(false);
      expect(freshData.articles).toHaveLength(1);
      expect(freshData.articles[0]).toMatchObject({
        title: 'Gold climbs on demand',
        source: 'Example News',
        imageUrl: 'https://news.example.com/gold.png',
      });

      globalThis.fetch = (async () => {
        throw new Error('provider down');
      }) as unknown as typeof fetch;

      const cached = await call({ method: 'GET', url: '/api/news?limit=5', headers: auth(accessToken) });
      expect(cached.statusCode, cached.body).toBe(200);
      expect(cached.json().data.cached).toBe(true);
      expect(cached.json().data.articles).toHaveLength(1);

      await prisma.newsCache.update({
        where: { key: newsCacheKey },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const stale = await call({ method: 'GET', url: '/api/news?limit=5', headers: auth(accessToken) });
      expect(stale.statusCode, stale.body).toBe(200);
      expect(stale.json().data.status).toBe('stale');
      expect(stale.json().data.articles).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
      config.newsApiKey = previousKey;
      await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    }
  });
});

describe('notifications', () => {
  it('lists, filters, and marks notifications as read', async () => {
    const { accessToken } = await login(emailFor('clienta'));

    const list = await call({
      method: 'GET',
      url: '/api/notifications?pageSize=100',
      headers: auth(accessToken),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data.length).toBeGreaterThan(0);
    expect(typeof list.json().unreadCount).toBe('number');
    const notification = list.json().data[0];

    const unread = await call({
      method: 'GET',
      url: '/api/notifications?unread=true&pageSize=100',
      headers: auth(accessToken),
    });
    expect(unread.statusCode, unread.body).toBe(200);
    expect(unread.json().data.every((row: { isRead: boolean }) => row.isRead === false)).toBe(true);

    const read = await call({
      method: 'PATCH',
      url: `/api/notifications/${notification.id}/read`,
      headers: auth(accessToken),
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().data.isRead).toBe(true);

    const readAll = await call({
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: auth(accessToken),
    });
    expect(readAll.statusCode, readAll.body).toBe(200);
    expect(typeof readAll.json().data.updated).toBe('number');

    const otherClient = await login(emailFor('clientb'));
    const forbidden = await call({
      method: 'PATCH',
      url: `/api/notifications/${notification.id}/read`,
      headers: auth(otherClient.accessToken),
    });
    expect(forbidden.statusCode).toBe(404);
  });
});
