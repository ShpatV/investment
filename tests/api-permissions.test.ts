import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/passwords';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = 'ApiTestPass123!';

interface Fixtures {
  institutionId: string;
  superAdminId: string;
  adminAssignedId: string;
  adminOtherId: string;
  clientAId: string;
  clientBId: string;
  investmentAId: string;
}

const ids: Fixtures = {
  institutionId: '',
  superAdminId: '',
  adminAssignedId: '',
  adminOtherId: '',
  clientAId: '',
  clientBId: '',
  investmentAId: '',
};

let app: FastifyInstance;
const tokenCache = new Map<string, string>();

async function login(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode, response.body).toBe(200);
  const token = response.json().data.accessToken as string;
  tokenCache.set(email, token);
  return token;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function makeUser(
  key: keyof Fixtures,
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER',
  firstName: string,
) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName: 'Test',
      email: `${key.toLowerCase()}.${suffix}@example.com`,
      role,
      status: 'ACTIVE',
      passwordHash,
    },
  });
  ids[key] = user.id;
  return user;
}

beforeAll(async () => {
  app = await buildApp({ logger: false });

  await makeUser('superAdminId', 'SUPER_ADMIN', 'Fixture Super');
  await makeUser('adminAssignedId', 'ADMIN', 'Assigned Advisor');
  await makeUser('adminOtherId', 'ADMIN', 'Other Advisor');
  await makeUser('clientAId', 'USER', 'Client A');
  await makeUser('clientBId', 'USER', 'Client B');

  const institution = await prisma.institution.create({
    data: { name: `Test Institution ${suffix}`, description: 'Permission test fixture' },
  });
  ids.institutionId = institution.id;

  await prisma.adminAssignment.create({
    data: {
      clientId: ids.clientAId,
      adminId: ids.adminAssignedId,
      assignedById: ids.superAdminId,
      status: 'ACTIVE',
    },
  });

  const investment = await prisma.investment.create({
    data: {
      clientId: ids.clientAId,
      institutionId: institution.id,
      name: `Permission Test Investment ${suffix}`,
      principalAmount: 100000,
      currency: 'USD',
      annualInterestRate: 5,
      compoundingFrequency: 'SIMPLE',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      createdById: ids.superAdminId,
    },
  });
  ids.investmentAId = investment.id;
}, 60_000);

afterAll(async () => {
  await prisma.transaction.deleteMany({
    where: { clientId: { in: [ids.clientAId, ids.clientBId] } },
  });
  await prisma.document.deleteMany({
    where: { clientId: { in: [ids.clientAId, ids.clientBId] } },
  });
  await prisma.investment.deleteMany({ where: { id: ids.investmentAId } });
  await prisma.adminAssignment.deleteMany({
    where: { OR: [{ clientId: ids.clientAId }, { adminId: ids.adminAssignedId }] },
  });
  await prisma.notification.deleteMany({
    where: {
      userId: {
        in: [
          ids.superAdminId,
          ids.adminAssignedId,
          ids.adminOtherId,
          ids.clientAId,
          ids.clientBId,
        ],
      },
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: [ids.superAdminId, ids.adminAssignedId, ids.adminOtherId, ids.clientAId, ids.clientBId] } },
        { clientId: { in: [ids.clientAId, ids.clientBId] } },
      ],
    },
  });
  await prisma.session.deleteMany({
    where: {
      userId: {
        in: [
          ids.superAdminId,
          ids.adminAssignedId,
          ids.adminOtherId,
          ids.clientAId,
          ids.clientBId,
        ],
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ids.superAdminId,
          ids.adminAssignedId,
          ids.adminOtherId,
          ids.clientAId,
          ids.clientBId,
        ],
      },
    },
  });
  await prisma.institution.deleteMany({ where: { id: ids.institutionId } });

  await app.close();
  await prisma.$disconnect();
}, 60_000);

describe('client data isolation', () => {
  it('blocks clients from administrative listings and cross-client reads', async () => {
    const clientToken = await login(`clientaid.${suffix}@example.com`);

    const listClients = await app.inject({
      method: 'GET',
      url: '/api/clients',
      headers: auth(clientToken),
    });
    expect(listClients.statusCode).toBe(403);

    const readOtherClient = await app.inject({
      method: 'GET',
      url: `/api/clients/${ids.clientBId}`,
      headers: auth(clientToken),
    });
    expect(readOtherClient.statusCode).toBe(403);

    const readOtherInvestment = await app.inject({
      method: 'GET',
      url: `/api/investments/${ids.investmentAId}`, // belongs to client A, not B
      headers: auth(await login(`clientbid.${suffix}@example.com`)),
    });
    expect(readOtherInvestment.statusCode).toBe(404);

    const createTransaction = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(clientToken),
      payload: {
        clientId: ids.clientAId,
        investmentId: ids.investmentAId,
        type: 'DEPOSIT',
        amount: '1000',
        status: 'COMPLETED',
        transactionDate: '2025-02-01',
      },
    });
    expect(createTransaction.statusCode).toBe(403);
  });

  it('ignores a clientId filter supplied by a client instead of widening scope', async () => {
    const token = await login(`clientbid.${suffix}@example.com`);
    const response = await app.inject({
      method: 'GET',
      url: `/api/investments?clientId=${ids.clientAId}`,
      headers: auth(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });
});

describe('administrator scoping', () => {
  it('only exposes clients actively assigned to the administrator', async () => {
    const assignedToken = await login(`adminassignedid.${suffix}@example.com`);
    const otherToken = await login(`adminotherid.${suffix}@example.com`);

    const assignedClient = await app.inject({
      method: 'GET',
      url: `/api/clients/${ids.clientAId}`,
      headers: auth(assignedToken),
    });
    expect(assignedClient.statusCode).toBe(200);

    const unassignedClient = await app.inject({
      method: 'GET',
      url: `/api/clients/${ids.clientAId}`,
      headers: auth(otherToken),
    });
    expect(unassignedClient.statusCode).toBe(404);

    const unassignedInvestment = await app.inject({
      method: 'GET',
      url: `/api/investments/${ids.investmentAId}`,
      headers: auth(otherToken),
    });
    expect(unassignedInvestment.statusCode).toBe(404);

    const filteredList = await app.inject({
      method: 'GET',
      url: `/api/investments?clientId=${ids.clientAId}`,
      headers: auth(otherToken),
    });
    expect(filteredList.statusCode).toBe(200);
    expect(filteredList.json().data).toEqual([]);
  });

  it('prevents ordinary administrators from managing administrator accounts', async () => {
    const token = await login(`adminassignedid.${suffix}@example.com`);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admins',
      headers: auth(token),
      payload: {
        firstName: 'Escalated',
        lastName: 'Admin',
        email: `escalated.${suffix}@example.com`,
        role: 'ADMIN',
      },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('portal-scoped login', () => {
  it('allows a client into the client portal only', async () => {
    const clientEmail = `clientaid.${suffix}@example.com`;
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login/client',
      payload: { email: clientEmail, password },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.user.role).toBe('USER');
    expect(ok.json().data.portal).toBe('client');

    for (const url of ['/api/auth/login/admin', '/api/auth/login/super-admin']) {
      const denied = await app.inject({
        method: 'POST',
        url,
        payload: { email: clientEmail, password },
      });
      expect(denied.statusCode, denied.body).toBe(403);
      expect(denied.json().error.message).toContain('cannot sign in');
      expect(denied.json().data).toBeUndefined();
    }
  });

  it('allows an admin into the admin portal but not the super admin portal', async () => {
    const adminEmail = `adminassignedid.${suffix}@example.com`;

    const adminPortal = await app.inject({
      method: 'POST',
      url: '/api/auth/login/admin',
      payload: { email: adminEmail, password },
    });
    expect(adminPortal.statusCode, adminPortal.body).toBe(200);
    expect(adminPortal.json().data.user.role).toBe('ADMIN');

    const superPortal = await app.inject({
      method: 'POST',
      url: '/api/auth/login/super-admin',
      payload: { email: adminEmail, password },
    });
    expect(superPortal.statusCode, superPortal.body).toBe(403);

    const clientPortal = await app.inject({
      method: 'POST',
      url: '/api/auth/login/client',
      payload: { email: adminEmail, password },
    });
    expect(clientPortal.statusCode, clientPortal.body).toBe(403);
  });

  it('allows a super admin into the super admin and admin portals', async () => {
    const superEmail = `superadminid.${suffix}@example.com`;

    const superPortal = await app.inject({
      method: 'POST',
      url: '/api/auth/login/super-admin',
      payload: { email: superEmail, password },
    });
    expect(superPortal.statusCode, superPortal.body).toBe(200);
    expect(superPortal.json().data.user.role).toBe('SUPER_ADMIN');
    expect(superPortal.json().data.portal).toBe('super-admin');

    const adminPortal = await app.inject({
      method: 'POST',
      url: '/api/auth/login/admin',
      payload: { email: superEmail, password },
    });
    expect(adminPortal.statusCode, adminPortal.body).toBe(200);
  });

  it('does not issue tokens when the password is wrong on a portal route', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login/client',
      payload: { email: `clientaid.${suffix}@example.com`, password: 'WrongPassword123!' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().data).toBeUndefined();
  });
});

describe('financial mutation guards', () => {
  it('rejects withdrawals larger than the current principal', async () => {
    const token = await login(`superadminid.${suffix}@example.com`);
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(token),
      payload: {
        clientId: ids.clientAId,
        investmentId: ids.investmentAId,
        type: 'WITHDRAWAL',
        amount: '999999999',
        status: 'COMPLETED',
        transactionDate: '2025-02-01',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain('exceeds the current invested principal');
  });

  it('rejects interest transactions that change principal', async () => {
    const token = await login(`superadminid.${suffix}@example.com`);
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: auth(token),
      payload: {
        clientId: ids.clientAId,
        investmentId: ids.investmentAId,
        type: 'INTEREST',
        amount: '500',
        status: 'COMPLETED',
        affectsPrincipal: true,
        transactionDate: '2025-02-01',
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('super admin safety rails', () => {
  it('refuses to disable the last active super administrator', async () => {
    const token = await login(`superadminid.${suffix}@example.com`);

    // Temporarily disable every other active super admin so the fixture is the last one.
    const others = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: ids.superAdminId } },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: others.map((other) => other.id) } },
      data: { status: 'DISABLED' },
    });

    try {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admins/${ids.superAdminId}`,
        headers: auth(token),
        payload: { role: 'ADMIN' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toContain('last active super admin');
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((other) => other.id) } },
        data: { status: 'ACTIVE' },
      });
    }
  });

  it('prevents a super admin from disabling their own account', async () => {
    const token = await login(`superadminid.${suffix}@example.com`);
    const response = await app.inject({
      method: 'POST',
      url: `/api/admins/${ids.superAdminId}/disable`,
      headers: auth(token),
    });
    expect(response.statusCode).toBe(403);
  });
});

// Surface configuration mistakes early: API tests must never run against production.
if (config.isProduction) {
  throw new Error('API permission tests must not run with NODE_ENV=production');
}
