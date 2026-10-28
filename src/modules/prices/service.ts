import { Prisma } from '@prisma/client';
import type { Commodity, PublishedPrice } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import type { AuthUser } from '../../lib/scope';
import { dec, moneyNumber } from '../../services/finance';
import { SETTING_KEYS, getBooleanSetting } from '../../services/settings';

export type PriceStatus = 'LIVE' | 'STALE' | 'MANUAL_OVERRIDE' | 'UNAVAILABLE';
export type PriceSource = 'PROVIDER' | 'MANUAL_OVERRIDE' | 'NONE';

export const COMMODITY_META: Record<
  Commodity,
  { label: string; unit: string; currency: string; symbol: string; yahooSymbol: string }
> = {
  GOLD: { label: 'Gold', unit: 'troy ounce', currency: 'USD', symbol: 'xauusd', yahooSymbol: 'GC=F' },
  OIL: { label: 'Oil (WTI)', unit: 'barrel', currency: 'USD', symbol: 'cl.f', yahooSymbol: 'CL=F' },
};

export function isOverrideActive(price: PublishedPrice, now = new Date()): boolean {
  if (!price.manualOverridePrice || !price.overrideStartsAt) return false;
  if (price.overrideStartsAt.getTime() > now.getTime()) return false;
  if (price.overrideEndsAt && price.overrideEndsAt.getTime() <= now.getTime()) return false;
  return true;
}

export function evaluatePrice(price: PublishedPrice, now = new Date()): {
  status: PriceStatus;
  source: PriceSource;
  effectivePrice: Prisma.Decimal | null;
} {
  if (isOverrideActive(price, now)) {
    return { status: 'MANUAL_OVERRIDE', source: 'MANUAL_OVERRIDE', effectivePrice: price.manualOverridePrice };
  }
  if (price.providerPrice) {
    const fetchedAt = price.providerFetchedAt?.getTime() ?? 0;
    const stale = now.getTime() - fetchedAt > config.priceStaleMinutes * 60 * 1000;
    return {
      status: stale ? 'STALE' : 'LIVE',
      source: 'PROVIDER',
      effectivePrice: price.providerPrice,
    };
  }
  return { status: 'UNAVAILABLE', source: 'NONE', effectivePrice: null };
}

export function serializePriceRow(price: PublishedPrice) {
  const evaluated = evaluatePrice(price);
  return {
    id: price.id,
    commodity: price.commodity,
    label: COMMODITY_META[price.commodity].label,
    price: evaluated.effectivePrice ? moneyNumber(evaluated.effectivePrice) : null,
    currency: price.currency,
    unit: price.unit,
    provider: price.provider,
    providerPrice: price.providerPrice ? moneyNumber(price.providerPrice) : null,
    providerFetchedAt: price.providerFetchedAt,
    manualOverridePrice: price.manualOverridePrice ? moneyNumber(price.manualOverridePrice) : null,
    overrideReason: price.overrideReason,
    overrideStartsAt: price.overrideStartsAt,
    overrideEndsAt: price.overrideEndsAt,
    lastPublishedAt: price.lastPublishedAt,
    status: evaluated.status,
    source: evaluated.source,
    updatedAt: price.updatedAt,
  };
}

export async function ensurePriceRows(): Promise<void> {
  for (const commodity of Object.keys(COMMODITY_META) as Commodity[]) {
    const meta = COMMODITY_META[commodity];
    await prisma.publishedPrice.upsert({
      where: { commodity },
      update: {},
      create: {
        commodity,
        currency: meta.currency,
        unit: meta.unit,
        provider: config.priceProvider === 'none' ? 'none' : 'Stooq',
        price: null,
      },
    });
  }
}

async function fetchStooqQuote(symbol: string): Promise<number> {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlc&h&e=csv`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'investment-platform/1.0 (+server-side price refresh)' },
      });
      if (!response.ok) throw new Error(`Provider responded ${response.status}`);
      const csv = (await response.text()).trim();
      const lines = csv.split(/\r?\n/);
      if (lines.length < 2) throw new Error('Provider returned no data');
      const header = lines[0]!.toLowerCase().split(',');
      const closeIndex = header.indexOf('close');
      const values = lines[1]!.split(',');
      const raw = closeIndex >= 0 ? values[closeIndex] : values[6];
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Provider returned an invalid price');
      return numeric;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Price provider unavailable');
}

/**
 * Keyless fallback used when Stooq is unreachable (it rate-limits/blocks some
 * networks). Yahoo's public chart endpoint returns the latest market price for
 * a futures symbol without an API key.
 */
async function fetchYahooQuote(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1d`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8_000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; investment-platform/1.0; +server-side price refresh)',
          Accept: 'application/json',
        },
      });
      if (!response.ok) throw new Error(`Provider responded ${response.status}`);
      const payload = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: { regularMarketPrice?: number };
            indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          }>;
        };
      };
      const result = payload.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const latestClose = [...closes].reverse().find((value) => typeof value === 'number');
      const numeric = result?.meta?.regularMarketPrice ?? latestClose;
      if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric <= 0) {
        throw new Error('Provider returned an invalid price');
      }
      return numeric;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Price provider unavailable');
}

async function fetchQuote(meta: (typeof COMMODITY_META)[Commodity]): Promise<{
  price: number;
  provider: string;
}> {
  const errors: string[] = [];
  try {
    return { price: await fetchStooqQuote(meta.symbol), provider: 'Stooq' };
  } catch (error) {
    errors.push(`Stooq: ${error instanceof Error ? error.message : 'unavailable'}`);
  }
  try {
    return { price: await fetchYahooQuote(meta.yahooSymbol), provider: 'Yahoo Finance' };
  } catch (error) {
    errors.push(`Yahoo Finance: ${error instanceof Error ? error.message : 'unavailable'}`);
  }
  throw new Error(`All price providers failed (${errors.join('; ')})`);
}

export interface RefreshResult {
  commodity: Commodity;
  success: boolean;
  price?: number;
  provider?: string;
  error?: string;
}

export async function refreshPrices(): Promise<RefreshResult[]> {
  await ensurePriceRows();
  const results: RefreshResult[] = [];

  for (const commodity of Object.keys(COMMODITY_META) as Commodity[]) {
    const meta = COMMODITY_META[commodity];
    if (config.priceProvider === 'none') {
      results.push({ commodity, success: false, error: 'No price provider configured' });
      continue;
    }
    try {
      const { price: value, provider } = await fetchQuote(meta);
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        const current = await tx.publishedPrice.findUnique({ where: { commodity } });
        if (!current) throw AppError.notFound('Price record not found');
        const overrideActive = isOverrideActive(current, now);
        await tx.publishedPrice.update({
          where: { commodity },
          data: {
            provider,
            providerPrice: new Prisma.Decimal(value),
            providerFetchedAt: now,
            price: overrideActive
              ? (current.manualOverridePrice ?? new Prisma.Decimal(value))
              : new Prisma.Decimal(value),
            lastPublishedAt: now,
          },
        });
        await tx.priceSnapshot.create({
          data: {
            commodity,
            price: new Prisma.Decimal(value),
            currency: meta.currency,
            unit: meta.unit,
            provider,
            fetchedAt: now,
          },
        });
      });
      results.push({ commodity, success: true, price: value, provider });
    } catch (error) {
      results.push({
        commodity,
        success: false,
        error: error instanceof Error ? error.message : 'Provider unavailable',
      });
    }
  }

  // Keep only the most recent snapshots to bound storage growth.
  await prisma.$executeRaw`
    DELETE FROM price_snapshots
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY commodity ORDER BY fetched_at DESC) AS rn
        FROM price_snapshots
      ) ranked WHERE rn > 500
    )`;

  return results;
}

export async function listPrices() {
  await ensurePriceRows();
  const rows = await prisma.publishedPrice.findMany({ orderBy: { commodity: 'asc' } });
  return rows.map(serializePriceRow);
}

export async function priceForCommodity(commodity: Commodity) {
  await ensurePriceRows();
  const row = await prisma.publishedPrice.findUnique({ where: { commodity } });
  if (!row) throw AppError.notFound('Price not found');
  return serializePriceRow(row);
}

export async function canOverridePrices(user: AuthUser): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'ADMIN') return false;
  return getBooleanSetting(SETTING_KEYS.allowAdminPriceOverride, config.allowAdminPriceOverride);
}

export interface OverrideInput {
  price: string;
  currency?: string;
  unit?: string;
  reason: string;
  startsAt?: Date;
  endsAt?: Date | null;
}

export async function setManualOverride(
  commodity: Commodity,
  input: OverrideInput,
  actor: AuthUser,
  ipAddress?: string,
) {
  if (!(await canOverridePrices(actor))) throw AppError.forbidden('Manual price overrides are not permitted');
  await ensurePriceRows();

  const meta = COMMODITY_META[commodity];
  const startsAt = input.startsAt ?? new Date();
  if (input.endsAt && input.endsAt.getTime() <= startsAt.getTime()) {
    throw AppError.validation('Override expiration must be after its effective date');
  }
  const numeric = Number(input.price);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw AppError.validation('Price must be greater than zero');
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.publishedPrice.findUnique({ where: { commodity } });
    if (!current) throw AppError.notFound('Price record not found');
    const evaluated = evaluatePrice(current);
    const previous = evaluated.effectivePrice;

    await tx.publishedPrice.update({
      where: { commodity },
      data: {
        manualOverridePrice: new Prisma.Decimal(input.price),
        overrideReason: input.reason,
        overrideStartsAt: startsAt,
        overrideEndsAt: input.endsAt ?? null,
        overrideById: actor.id,
        price: new Prisma.Decimal(input.price),
        currency: input.currency ?? meta.currency,
        unit: input.unit ?? meta.unit,
        lastPublishedAt: new Date(),
      },
    });

    const override = await tx.priceOverride.create({
      data: {
        commodity,
        previousPrice: previous ?? null,
        newPrice: new Prisma.Decimal(input.price),
        currency: input.currency ?? meta.currency,
        unit: input.unit ?? meta.unit,
        reason: input.reason,
        startsAt,
        endsAt: input.endsAt ?? null,
        createdById: actor.id,
      },
    });

    await recordAudit(
      {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'PRICE_OVERRIDDEN',
        entityType: 'PUBLISHED_PRICE',
        entityId: current.id,
        summary: `${meta.label} price overridden to ${input.price} ${meta.currency}/${meta.unit}`,
        before: { price: previous ? previous.toFixed(4) : null },
        after: { price: input.price, reason: input.reason, startsAt, endsAt: input.endsAt ?? null },
        ipAddress: ipAddress ?? null,
      },
      tx,
    );

    const updated = await tx.publishedPrice.findUnique({ where: { commodity } });
    return { price: serializePriceRow(updated!), overrideId: override.id };
  });
}

export async function clearManualOverride(
  commodity: Commodity,
  actor: AuthUser,
  ipAddress?: string,
) {
  if (!(await canOverridePrices(actor))) throw AppError.forbidden('Manual price overrides are not permitted');
  await ensurePriceRows();

  return prisma.$transaction(async (tx) => {
    const current = await tx.publishedPrice.findUnique({ where: { commodity } });
    if (!current) throw AppError.notFound('Price record not found');
    if (!current.manualOverridePrice) {
      return { price: serializePriceRow(current), cleared: false };
    }

    const now = new Date();
    await tx.priceOverride.updateMany({
      where: { commodity, clearedAt: null },
      data: { clearedAt: now },
    });
    await tx.publishedPrice.update({
      where: { commodity },
      data: {
        manualOverridePrice: null,
        overrideReason: null,
        overrideStartsAt: null,
        overrideEndsAt: null,
        overrideById: null,
        price: current.providerPrice,
        lastPublishedAt: now,
      },
    });

    await recordAudit(
      {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'PRICE_OVERRIDE_CLEARED',
        entityType: 'PUBLISHED_PRICE',
        entityId: current.id,
        summary: `${COMMODITY_META[commodity].label} manual override cleared`,
        before: { price: current.manualOverridePrice ? current.manualOverridePrice.toFixed(4) : null },
        after: { price: current.providerPrice ? current.providerPrice.toFixed(4) : null },
        ipAddress: ipAddress ?? null,
      },
      tx,
    );

    const updated = await tx.publishedPrice.findUnique({ where: { commodity } });
    return { price: serializePriceRow(updated!), cleared: true };
  });
}

export async function priceHistory(commodity: Commodity) {
  const [overrides, snapshots] = await Promise.all([
    prisma.priceOverride.findMany({
      where: { commodity },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.priceSnapshot.findMany({
      where: { commodity },
      orderBy: { fetchedAt: 'desc' },
      take: 100,
    }),
  ]);
  return {
    overrides: overrides.map((override) => ({
      id: override.id,
      previousPrice: override.previousPrice ? moneyNumber(override.previousPrice) : null,
      newPrice: moneyNumber(override.newPrice),
      currency: override.currency,
      unit: override.unit,
      reason: override.reason,
      startsAt: override.startsAt,
      endsAt: override.endsAt,
      clearedAt: override.clearedAt,
      createdBy: override.createdBy
        ? {
            id: override.createdBy.id,
            fullName: `${override.createdBy.firstName} ${override.createdBy.lastName}`.trim(),
          }
        : null,
      createdAt: override.createdAt,
    })),
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      price: moneyNumber(snapshot.price),
      currency: snapshot.currency,
      unit: snapshot.unit,
      provider: snapshot.provider,
      fetchedAt: snapshot.fetchedAt,
    })),
  };
}
