import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, type PublishedPrice } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { config } from '../src/config';
import { hashPassword } from '../src/lib/passwords';
import { recordAudit } from '../src/lib/audit';
import {
  allSettings,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
  setSetting,
  SETTING_KEYS,
} from '../src/services/settings';
import { notify } from '../src/services/notifications';
import { loadClientInvestments, project, projectionView, summarize } from '../src/services/investments';
import {
  canOverridePrices,
  clearManualOverride,
  evaluatePrice,
  isOverrideActive,
  priceHistory,
  refreshPrices,
  setManualOverride,
} from '../src/modules/prices/service';
import { getMarketNews } from '../src/modules/news/service';
import {
  assertAllowedFile,
  deleteStoredFile,
  normalizeOriginalFilename,
  readFileBuffer,
  resolveStoragePath,
  safeDownloadName,
  saveFile,
} from '../src/lib/storage';
import { runMaturityJob } from '../src/jobs';
import type { AuthUser } from '../src/lib/scope';

/**
 * Service-layer coverage against the real PostgreSQL database.
 *
 * These tests call the domain services directly (no HTTP) so that data
 * transformations, financial projections, price/news providers, file storage
 * and the scheduled maturity job are exercised with real persistence,
 * transactions and JSON round-trips.
 */

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const passwordHashPromise = hashPassword('ServiceSuite123!');

const fixtureUserIds: string[] = [];
const institutionIds: string[] = [];
const savedStorageKeys: string[] = [];

let passwordHash: string;
let superAdminId = '';
let adminId = '';
let clientId = '';
let maturityClientId = '';
let institutionId = '';
let projectionInvestmentId = '';

let publishedPriceSnapshot: PublishedPrice[] = [];
const priceSnapshotStart = new Date();

const originalNewsKey = config.newsApiKey;
const originalPriceProvider = config.priceProvider;
const originalAdminOverrideDefault = config.allowAdminPriceOverride;

const newsCacheKey = `news:${createHash('sha256').update(config.newsQuery).digest('hex').slice(0, 24)}`;

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

async function createUser(key: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'): Promise<string> {
  const user = await prisma.user.create({
    data: {
      firstName: key,
      lastName: 'Fixture',
      email: `${key}.${suffix}@example.com`,
      role,
      status: 'ACTIVE',
      passwordHash,
    },
  });
  fixtureUserIds.push(user.id);
  return user.id;
}

function actorFor(id: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', email: string): AuthUser {
  return { id, email, role, firstName: 'Fixture', lastName: 'Actor' };
}

function makePriceRow(overrides: Partial<PublishedPrice> = {}): PublishedPrice {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    commodity: 'GOLD',
    price: null,
    currency: 'USD',
    unit: 'troy ounce',
    provider: 'Stooq',
    providerPrice: null,
    providerFetchedAt: null,
    manualOverridePrice: null,
    overrideReason: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideById: null,
    lastPublishedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeAll(async () => {
  passwordHash = await passwordHashPromise;

  superAdminId = await createUser('servicesuper', 'SUPER_ADMIN');
  adminId = await createUser('serviceadmin', 'ADMIN');
  clientId = await createUser('serviceclient', 'USER');
  maturityClientId = await createUser('maturityclient', 'USER');

  const institution = await prisma.institution.create({
    data: { name: `Service Fixture Capital ${suffix}`, description: 'Service test institution' },
  });
  institutionId = institution.id;
  institutionIds.push(institution.id);

  const investment = await prisma.investment.create({
    data: {
      clientId,
      institutionId,
      name: `Projection Fixture ${suffix}`,
      principalAmount: new Prisma.Decimal('100000.00'),
      currency: 'USD',
      annualInterestRate: new Prisma.Decimal('10.0000'),
      compoundingFrequency: 'SIMPLE',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      maturityDate: new Date('2027-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      createdById: adminId,
    },
  });
  projectionInvestmentId = investment.id;

  await prisma.transaction.createMany({
    data: [
      {
        clientId,
        investmentId: investment.id,
        type: 'DEPOSIT',
        amount: new Prisma.Decimal('5000.00'),
        status: 'COMPLETED',
        affectsPrincipal: true,
        transactionDate: new Date('2026-07-01T00:00:00.000Z'),
        description: 'Completed principal deposit',
        createdById: adminId,
      },
      {
        clientId,
        investmentId: investment.id,
        type: 'WITHDRAWAL',
        amount: new Prisma.Decimal('1000.00'),
        status: 'PENDING',
        affectsPrincipal: true,
        transactionDate: new Date('2026-08-01T00:00:00.000Z'),
        description: 'Pending withdrawal is excluded',
        createdById: adminId,
      },
      {
        clientId,
        investmentId: investment.id,
        type: 'INTEREST',
        amount: new Prisma.Decimal('500.00'),
        status: 'COMPLETED',
        affectsPrincipal: false,
        transactionDate: new Date('2026-09-01T00:00:00.000Z'),
        description: 'Interest never changes principal',
        createdById: adminId,
      },
    ],
  });

  publishedPriceSnapshot = await prisma.publishedPrice.findMany();
}, 60_000);

afterAll(async () => {
  for (const storageKey of savedStorageKeys) await deleteStoredFile(storageKey);

  await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
  await prisma.notification.deleteMany({ where: { userId: { in: fixtureUserIds } } });
  await prisma.transaction.deleteMany({ where: { clientId: { in: fixtureUserIds } } });
  await prisma.document.deleteMany({ where: { clientId: { in: fixtureUserIds } } });
  await prisma.investment.deleteMany({ where: { clientId: { in: fixtureUserIds } } });
  await prisma.priceOverride.deleteMany({ where: { createdById: { in: fixtureUserIds } } });
  await prisma.priceSnapshot.deleteMany({ where: { fetchedAt: { gte: priceSnapshotStart } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: fixtureUserIds } }, { clientId: { in: fixtureUserIds } }] },
  });
  await prisma.adminAssignment.deleteMany({
    where: { OR: [{ clientId: { in: fixtureUserIds } }, { adminId: { in: fixtureUserIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
  await prisma.institution.deleteMany({ where: { id: { in: institutionIds } } });

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

  config.newsApiKey = originalNewsKey;
  config.priceProvider = originalPriceProvider;
  config.allowAdminPriceOverride = originalAdminOverrideDefault;

  await prisma.$disconnect();
}, 120_000);

describe('settings service', () => {
  const tempKey = `test.services.${suffix}`;

  it('reads defaults and explicit fallbacks for missing keys', async () => {
    expect(await getSetting<number>('missing.key', 7)).toBe(7);
    expect(await getSetting('missing.key')).toBeNull();
    expect(await getBooleanSetting('missing.flag', true)).toBe(true);
    expect(await getNumberSetting('missing.number', 12)).toBe(12);
  });

  it('persists, reads and deletes typed settings', async () => {
    try {
      await setSetting(tempKey, { enabled: true }, superAdminId, 'Temporary integration setting');

      const stored = await getSetting<{ enabled: boolean }>(tempKey);
      expect(stored).toEqual({ enabled: true });

      const row = await prisma.systemSetting.findUnique({ where: { key: tempKey } });
      expect(row?.updatedById).toBe(superAdminId);
      expect(row?.description).toBe('Temporary integration setting');

      await setSetting(tempKey, 45, superAdminId);
      expect(await getNumberSetting(tempKey, 1)).toBe(45);

      await setSetting(tempKey, 'not-a-number');
      expect(await getNumberSetting(tempKey, 33)).toBe(33);
    } finally {
      await prisma.systemSetting.deleteMany({ where: { key: tempKey } });
    }
  });

  it('merges database values over defaults', async () => {
    const settings = await allSettings();
    for (const key of Object.values(SETTING_KEYS)) {
      expect(settings).toHaveProperty(key);
    }
    expect(typeof settings[SETTING_KEYS.maturityReminderDays]).toBe('number');
  });
});

describe('notifications service', () => {
  it('creates notifications with optional fields nulled out', async () => {
    await notify({ userId: clientId, type: 'TEST', title: 'Service notification' });

    const created = await prisma.notification.findFirst({
      where: { userId: clientId, type: 'TEST', title: 'Service notification' },
    });
    expect(created).not.toBeNull();
    expect(created?.body).toBeNull();
    expect(created?.link).toBeNull();
    expect(created?.readAt).toBeNull();
  });
});

describe('audit service', () => {
  it('persists sanitized snapshots with redactions and JSON-safe values', async () => {
    const action = `TEST_AUDIT_${suffix}`;
    const entityId = `entity-${suffix}`;

    await recordAudit({
      actorId: superAdminId,
      actorRole: 'SUPER_ADMIN',
      action,
      entityType: 'TEST',
      entityId,
      clientId,
      summary: 'Audit persistence test',
      before: {
        password: 'plain-secret',
        amount: new Prisma.Decimal('1234.56'),
        when: new Date('2026-01-02T03:04:05.000Z'),
        nested: { token: 'abc', refreshToken: 'def' },
      },
      after: {
        authorization: 'Bearer xyz',
        storageKey: '2026/01/secret.pdf',
        deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } },
      },
    });

    const log = await prisma.auditLog.findFirst({ where: { action, entityId } });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(superAdminId);
    expect(log?.actorRole).toBe('SUPER_ADMIN');
    expect(log?.clientId).toBe(clientId);
    expect(log?.outcome).toBe('SUCCESS');

    const before = log?.beforeData as Record<string, unknown>;
    expect(before.password).toBe('[redacted]');
    expect(before.amount).toBe('1234.56');
    expect(before.when).toBe('2026-01-02T03:04:05.000Z');
    expect((before.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect((before.nested as Record<string, unknown>).refreshToken).toBe('[redacted]');

    const after = log?.afterData as Record<string, unknown>;
    expect(after.authorization).toBe('[redacted]');
    expect(after.storageKey).toBe('[redacted]');
    // Depth guard: seven nested objects exceed the limit and are truncated.
    expect(((after.deep as Record<string, unknown>).a as Record<string, unknown>).b).toBeDefined();
    expect(JSON.stringify(after)).toContain('[truncated]');
  });
});

describe('investment projection services', () => {
  const asOf = new Date('2026-10-01T00:00:00.000Z');

  it('loads client investments with institution and transactions', async () => {
    const investments = await loadClientInvestments(clientId);
    const investment = investments.find((row) => row.id === projectionInvestmentId);
    expect(investment).toBeDefined();
    expect(investment?.institution?.id).toBe(institutionId);
    expect(investment?.transactions).toHaveLength(3);
  });

  it('projects only completed principal-affecting flows', async () => {
    const investments = await loadClientInvestments(clientId);
    const investment = investments.find((row) => row.id === projectionInvestmentId)!;

    const breakdown = project(investment, asOf);
    expect(breakdown.currentPrincipal.toNumber()).toBe(105000);
    expect(breakdown.projectedMaturityBalance.toNumber()).toBe(115252.05);
    expect(breakdown.projectedReturn.toNumber()).toBe(10252.05);
    expect(breakdown.isMatured).toBe(false);

    const view = projectionView(investment, asOf);
    expect(view).toMatchObject({
      currentPrincipal: 105000,
      projectedMaturityBalance: 115252.05,
      projectedReturn: 10252.05,
      annualInterestRate: 10,
      isMatured: false,
      asOf: asOf.toISOString(),
    });
    expect(view.termYears).toBe(1);
    expect(view.remainingTermYears).toBeGreaterThan(0);
    expect(view.remainingTermYears).toBeLessThan(1);
    expect(view.methodology).toContain('Simple interest');
  });

  it('summarizes the active portfolio with weighted rates and allocation', async () => {
    const investments = await loadClientInvestments(clientId);
    const summary = summarize(investments, asOf);

    expect(summary).toMatchObject({
      totalInvested: 105000,
      projectedMaturityBalance: 115252.05,
      projectedReturn: 10252.05,
      averageInterestRate: 10,
      activeInvestments: 1,
    });
    expect(summary.allocation).toHaveLength(1);
    expect(summary.allocation[0]).toMatchObject({
      institutionId,
      amount: 105000,
      percentage: 100,
    });
  });
});

describe('price service', () => {
  const superActor = (): AuthUser =>
    actorFor(superAdminId, 'SUPER_ADMIN', `servicesuper.${suffix}@example.com`);
  const adminActor = (): AuthUser => actorFor(adminId, 'ADMIN', `serviceadmin.${suffix}@example.com`);
  const userActor = (): AuthUser => actorFor(clientId, 'USER', `serviceclient.${suffix}@example.com`);

  it('evaluates override windows', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const base = { manualOverridePrice: new Prisma.Decimal('4200.00'), overrideStartsAt: now };

    expect(isOverrideActive(makePriceRow() as PublishedPrice, now)).toBe(false);
    expect(isOverrideActive(makePriceRow(base) as PublishedPrice, now)).toBe(true);
    expect(
      isOverrideActive(
        makePriceRow({ ...base, overrideStartsAt: addDays(now, 1) }) as PublishedPrice,
        now,
      ),
    ).toBe(false);
    expect(
      isOverrideActive(
        makePriceRow({ ...base, overrideEndsAt: addDays(now, -1) }) as PublishedPrice,
        now,
      ),
    ).toBe(false);
    expect(
      isOverrideActive(makePriceRow({ ...base, overrideEndsAt: addDays(now, 1) }) as PublishedPrice, now),
    ).toBe(true);
  });

  it('derives LIVE, STALE, MANUAL_OVERRIDE and UNAVAILABLE statuses', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const fresh = makePriceRow({
      providerPrice: new Prisma.Decimal('4000.00'),
      providerFetchedAt: addDays(now, -1 / 24),
    });
    expect(evaluatePrice(fresh as PublishedPrice, now)).toMatchObject({
      status: 'LIVE',
      source: 'PROVIDER',
    });

    const stale = makePriceRow({
      providerPrice: new Prisma.Decimal('4000.00'),
      providerFetchedAt: new Date(now.getTime() - (config.priceStaleMinutes + 1) * 60 * 1000),
    });
    expect(evaluatePrice(stale as PublishedPrice, now).status).toBe('STALE');

    const overridden = makePriceRow({
      providerPrice: new Prisma.Decimal('4000.00'),
      providerFetchedAt: now,
      manualOverridePrice: new Prisma.Decimal('4200.00'),
      overrideStartsAt: addDays(now, -1),
    });
    expect(evaluatePrice(overridden as PublishedPrice, now)).toMatchObject({
      status: 'MANUAL_OVERRIDE',
      source: 'MANUAL_OVERRIDE',
    });

    expect(evaluatePrice(makePriceRow() as PublishedPrice, now)).toEqual({
      status: 'UNAVAILABLE',
      source: 'NONE',
      effectivePrice: null,
    });
  });

  it('authorizes overrides by role and setting', async () => {
    expect(await canOverridePrices(superActor())).toBe(true);
    expect(await canOverridePrices(userActor())).toBe(false);

    const previous = await getSetting<boolean>(
      SETTING_KEYS.allowAdminPriceOverride,
      config.allowAdminPriceOverride,
    );
    try {
      await setSetting(SETTING_KEYS.allowAdminPriceOverride, true);
      expect(await canOverridePrices(adminActor())).toBe(true);

      await setSetting(SETTING_KEYS.allowAdminPriceOverride, false);
      expect(await canOverridePrices(adminActor())).toBe(false);
    } finally {
      await setSetting(SETTING_KEYS.allowAdminPriceOverride, previous);
    }
  });

  it('refreshes provider prices and records snapshots', async () => {
    const originalFetch = globalThis.fetch;
    const csv = 'Symbol,Date,Time,Open,High,Low,Close\nXAUUSD,2026-10-30,12:00:00,1,1,1,4100.50\n';
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => csv,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const start = new Date();
    try {
      const results = await refreshPrices();
      expect(results).toHaveLength(2);
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.map((result) => result.price)).toEqual([4100.5, 4100.5]);

      const gold = await prisma.publishedPrice.findUnique({ where: { commodity: 'GOLD' } });
      expect(gold?.providerPrice?.toNumber()).toBe(4100.5);
      expect(gold?.price?.toNumber()).toBe(4100.5);
      expect(gold?.providerFetchedAt?.getTime()).toBeGreaterThanOrEqual(start.getTime());

      const snapshots = await prisma.priceSnapshot.count({
        where: { commodity: 'GOLD', fetchedAt: { gte: start } },
      });
      expect(snapshots).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports no provider when price fetching is disabled', async () => {
    const previous = config.priceProvider;
    config.priceProvider = 'none';
    try {
      const results = await refreshPrices();
      expect(results).toEqual([
        { commodity: 'GOLD', success: false, error: 'No price provider configured' },
        { commodity: 'OIL', success: false, error: 'No price provider configured' },
      ]);
    } finally {
      config.priceProvider = previous;
    }
  });

  it('applies, exposes and clears a manual override with history', async () => {
    const reason = `Service override ${suffix}`;
    try {
      const applied = await setManualOverride(
        'GOLD',
        { price: '4200.00', reason },
        superActor(),
        '127.0.0.1',
      );
      expect(applied.price.status).toBe('MANUAL_OVERRIDE');
      expect(applied.price.price).toBe(4200);

      const row = await prisma.publishedPrice.findUnique({ where: { commodity: 'GOLD' } });
      expect(row?.manualOverridePrice?.toNumber()).toBe(4200);
      expect(row?.overrideReason).toBe(reason);
      expect(row?.overrideById).toBe(superAdminId);
      expect(evaluatePrice(row!).status).toBe('MANUAL_OVERRIDE');

      const history = await priceHistory('GOLD');
      const override = history.overrides.find((item) => item.reason === reason);
      expect(override).toBeDefined();
      expect(override?.newPrice).toBe(4200);
      expect(override?.createdBy?.id).toBe(superAdminId);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'PRICE_OVERRIDDEN', actorId: superAdminId },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();

      const cleared = await clearManualOverride('GOLD', superActor(), '127.0.0.1');
      expect(cleared.cleared).toBe(true);
      expect(cleared.price.status).not.toBe('MANUAL_OVERRIDE');

      const after = await prisma.publishedPrice.findUnique({ where: { commodity: 'GOLD' } });
      expect(after?.manualOverridePrice).toBeNull();
      expect(after?.overrideReason).toBeNull();

      const again = await clearManualOverride('GOLD', superActor());
      expect(again.cleared).toBe(false);
    } finally {
      await clearManualOverride('GOLD', superActor());
    }
  });

  it('keeps an active override in place during a provider refresh', async () => {
    const originalFetch = globalThis.fetch;
    const csv = 'Symbol,Date,Time,Open,High,Low,Close\nXAUUSD,2026-10-30,12:00:00,1,1,1,4150.25\n';
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => csv,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    try {
      await setManualOverride('GOLD', { price: '4300.00', reason: `Pinned ${suffix}` }, superActor());
      await refreshPrices();

      const row = await prisma.publishedPrice.findUnique({ where: { commodity: 'GOLD' } });
      expect(row?.providerPrice?.toNumber()).toBe(4150.25);
      expect(row?.price?.toNumber()).toBe(4300);
      expect(evaluatePrice(row!).status).toBe('MANUAL_OVERRIDE');
    } finally {
      globalThis.fetch = originalFetch;
      await clearManualOverride('GOLD', superActor());
    }
  });
});

describe('news service', () => {
  it('reports unconfigured providers without fabricating articles', async () => {
    await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    const previous = config.newsApiKey;
    config.newsApiKey = '';
    try {
      const result = await getMarketNews(5);
      expect(result.status).toBe('unconfigured');
      expect(result.articles).toEqual([]);
      expect(result.fetchedAt).toBeNull();
      expect(result.message).toContain('not configured');
    } finally {
      config.newsApiKey = previous;
    }
  });

  it('maps provider articles, skips removed entries and serves cached results', async () => {
    await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    const previous = config.newsApiKey;
    config.newsApiKey = 'service-news-key';
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        text: async () => '',
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
      })) as unknown as typeof fetch;

      const fresh = await getMarketNews(5);
      expect(fresh.status).toBe('ok');
      expect(fresh.cached).toBe(false);
      expect(fresh.provider).toBe('NewsAPI');
      expect(fresh.articles).toHaveLength(1);
      expect(fresh.articles[0]).toMatchObject({
        title: 'Gold climbs on demand',
        summary: 'Gold prices rose.',
        source: 'Example News',
        url: 'https://news.example.com/gold',
        publishedAt: '2026-10-30T08:00:00.000Z',
        imageUrl: 'https://news.example.com/gold.png',
      });
      expect(fresh.articles[0]?.id).toHaveLength(24);

      // A provider outage while the cache is still valid serves the cache.
      globalThis.fetch = (async () => {
        throw new Error('provider down');
      }) as unknown as typeof fetch;
      const cached = await getMarketNews(5);
      expect(cached.status).toBe('ok');
      expect(cached.cached).toBe(true);
      expect(cached.articles).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
      config.newsApiKey = previous;
      await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    }
  });

  it('serves stale cache on provider failure and reports unavailability without cache', async () => {
    await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    const previous = config.newsApiKey;
    config.newsApiKey = 'service-news-key';
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async () => {
        throw new Error('provider down');
      }) as unknown as typeof fetch;

      const unavailable = await getMarketNews(5);
      expect(unavailable.status).toBe('unavailable');
      expect(unavailable.articles).toEqual([]);

      await prisma.newsCache.create({
        data: {
          key: newsCacheKey,
          payload: {
            articles: [
              {
                id: 'cachedarticle',
                title: 'Cached headline',
                summary: null,
                source: 'Cache',
                url: 'https://news.example.com/cached',
                publishedAt: null,
                imageUrl: null,
              },
            ],
            fetchedAt: new Date(Date.now() - 3_600_000).toISOString(),
            provider: 'NewsAPI',
          },
          fetchedAt: new Date(Date.now() - 3_600_000),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const stale = await getMarketNews(5);
      expect(stale.status).toBe('stale');
      expect(stale.cached).toBe(true);
      expect(stale.articles).toHaveLength(1);
      expect(stale.articles[0]?.title).toBe('Cached headline');
      expect(stale.message).toContain('temporarily unavailable');
    } finally {
      globalThis.fetch = originalFetch;
      config.newsApiKey = previous;
      await prisma.newsCache.deleteMany({ where: { key: newsCacheKey } });
    }
  });
});

describe('document storage', () => {
  const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

  it('stores, reads and deletes files with an integrity checksum', async () => {
    const stored = await saveFile(pdfBytes, 'application/pdf');
    savedStorageKeys.push(stored.storageKey);

    expect(stored.storageKey).toMatch(/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    expect(stored.fileSize).toBe(pdfBytes.byteLength);
    expect(stored.checksum).toBe(createHash('sha256').update(pdfBytes).digest('hex'));

    const readBack = await readFileBuffer(stored.storageKey);
    expect(readBack.equals(pdfBytes)).toBe(true);

    await deleteStoredFile(stored.storageKey);
    await expect(readFileBuffer(stored.storageKey)).rejects.toThrow(/unavailable/i);
  });

  it('rejects unsupported, empty and signature-mismatched uploads', async () => {
    expect(() => assertAllowedFile('text/html', 100)).toThrow(/Unsupported file type/);
    expect(() => assertAllowedFile('application/pdf', 0)).toThrow(/empty/i);
    await expect(saveFile(Buffer.from('<html></html>'), 'application/pdf')).rejects.toThrow(
      /does not match its declared type/,
    );
    await expect(saveFile(Buffer.from('%PDF-1.7'), 'text/html')).rejects.toThrow(/Unsupported file type/);
  });

  it('blocks path traversal outside the storage directory', () => {
    expect(() => resolveStoragePath('../escape.txt')).toThrow(/Invalid storage key/);
    expect(() => resolveStoragePath('2026/08/../../../escape.txt')).toThrow(/Invalid storage key/);
    expect(resolveStoragePath('2026/08/report.pdf')).toContain('2026');
  });

  it('sanitizes download filenames and normalizes original names', () => {
    expect(safeDownloadName('statements/Q3 "final".pdf')).toBe('statements_Q3 _final_.pdf');
    const safe = safeDownloadName('../secret.pdf');
    expect(safe).not.toContain('/');
    expect(safe).not.toContain('\\');
    expect(safeDownloadName('   ')).toBe('document');

    expect(normalizeOriginalFilename('a/b\\c.pdf')).toBe('a_b_c.pdf');
    expect(normalizeOriginalFilename('')).toBe('document');
    expect(normalizeOriginalFilename('x'.repeat(400))).toHaveLength(255);
  });
});

describe('maturity job', () => {
  it('matures past-due investments, audits them, and reminds once per upcoming maturity', async () => {
    const today = startOfTodayUtc();

    const matured = await prisma.investment.create({
      data: {
        clientId: maturityClientId,
        institutionId,
        name: `Matured Fixture ${suffix}`,
        principalAmount: new Prisma.Decimal('25000.00'),
        annualInterestRate: new Prisma.Decimal('3.5000'),
        compoundingFrequency: 'SIMPLE',
        startDate: addDays(today, -400),
        maturityDate: addDays(today, -5),
        status: 'ACTIVE',
        createdById: adminId,
      },
    });

    const upcoming = await prisma.investment.create({
      data: {
        clientId: maturityClientId,
        institutionId,
        name: `Upcoming Fixture ${suffix}`,
        principalAmount: new Prisma.Decimal('15000.00'),
        annualInterestRate: new Prisma.Decimal('4.0000'),
        compoundingFrequency: 'SIMPLE',
        startDate: addDays(today, -100),
        maturityDate: addDays(today, 10),
        status: 'ACTIVE',
        createdById: adminId,
      },
    });

    const previousReminderDays = await getSetting<number>(SETTING_KEYS.maturityReminderDays, 30);
    await setSetting(SETTING_KEYS.maturityReminderDays, 30);

    try {
      await runMaturityJob();

      const maturedAfter = await prisma.investment.findUnique({ where: { id: matured.id } });
      expect(maturedAfter?.status).toBe('MATURED');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'INVESTMENT_MATURED', entityId: matured.id },
      });
      expect(audit).not.toBeNull();
      expect(audit?.clientId).toBe(maturityClientId);

      const maturityNotice = await prisma.notification.findFirst({
        where: { userId: maturityClientId, type: 'MATURITY', link: `/investments/${matured.id}` },
      });
      expect(maturityNotice).not.toBeNull();

      const reminder = () =>
        prisma.notification.count({
          where: {
            userId: maturityClientId,
            type: 'MATURITY_REMINDER',
            link: `/investments/${upcoming.id}`,
          },
        });
      expect(await reminder()).toBe(1);

      // Re-running the job must not duplicate the reminder.
      await runMaturityJob();
      expect(await reminder()).toBe(1);
    } finally {
      await setSetting(SETTING_KEYS.maturityReminderDays, previousReminderDays);
    }
  });
});
