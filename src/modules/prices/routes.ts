import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { parseBody, parseQuery, parseWith } from '../../lib/http';
import { decimalStringSchema, isoDateTimeSchema, trimmedOptional } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { recordAudit } from '../../lib/audit';
import {
  COMMODITY_META,
  canOverridePrices,
  clearManualOverride,
  listPrices,
  priceForCommodity,
  priceHistory,
  refreshPrices,
  setManualOverride,
} from './service';

const commoditySchema = z.enum(['GOLD', 'OIL']);

const overrideSchema = z
  .object({
    price: decimalStringSchema.refine((value) => Number(value) > 0, 'Price must be greater than zero'),
    currency: z.literal('USD').optional(),
    unit: z.string().trim().min(1).max(50).optional(),
    reason: z.string().trim().min(3, 'A reason is required').max(1000),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.nullable().optional(),
  })
  .refine((value) => !value.endsAt || !value.startsAt || value.endsAt > value.startsAt, {
    message: 'Expiration must be after the effective date',
    path: ['endsAt'],
  });

export async function priceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/prices',
    { schema: { tags: ['Prices'], summary: 'Get published gold and oil prices' } },
    async (request, reply) => {
      let auth: ReturnType<typeof currentUser> | null = null;
      if (request.headers.authorization) {
        await authenticate(request, reply);
        auth = currentUser(request);
      }
      const prices = await listPrices();
      return reply.send({
        data: {
          prices,
          primaryProvider: config.priceProvider,
          activeProviders: [...new Set(prices.map((price) => price.provider))],
          staleAfterMinutes: config.priceStaleMinutes,
          canOverride: auth ? await canOverridePrices(auth) : false,
          notes:
            'Published prices are informational only and never alter contractual investment terms or balances.',
        },
      });
    },
  );

  app.post(
    '/prices/refresh',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
      schema: { tags: ['Prices'], summary: 'Refresh prices from the configured provider' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const results = await refreshPrices();
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'PRICES_REFRESHED',
        entityType: 'PUBLISHED_PRICE',
        summary: `Manual price refresh: ${results.filter((result) => result.success).length}/${results.length} succeeded`,
        after: results,
        ipAddress: request.ip,
      });
      return reply.send({ data: { results, prices: await listPrices() } });
    },
  );

  app.post(
    '/prices/:commodity/override',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Prices'], summary: 'Create or replace a manual price override' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { commodity } = parseWith(z.object({ commodity: commoditySchema }), request.params, 'params');
      const body = parseBody(overrideSchema, request.body);
      const result = await setManualOverride(
        commodity,
        {
          price: body.price,
          currency: body.currency,
          unit: body.unit,
          reason: body.reason,
          startsAt: body.startsAt,
          endsAt: body.endsAt ?? null,
        },
        auth,
        request.ip,
      );
      return reply.status(201).send({ data: result });
    },
  );

  app.delete(
    '/prices/:commodity/override',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Prices'], summary: 'Clear a manual price override' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { commodity } = parseWith(z.object({ commodity: commoditySchema }), request.params, 'params');
      const result = await clearManualOverride(commodity, auth, request.ip);
      return reply.send({ data: result });
    },
  );

  app.get(
    '/prices/:commodity',
    { preHandler: [authenticate], schema: { tags: ['Prices'], summary: 'Get one commodity price' } },
    async (request, reply) => {
      const { commodity } = parseWith(z.object({ commodity: commoditySchema }), request.params, 'params');
      return reply.send({
        data: {
          ...(await priceForCommodity(commodity)),
          meta: COMMODITY_META[commodity],
        },
      });
    },
  );

  app.get(
    '/prices/:commodity/history',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Prices'], summary: 'Get price override and provider history' },
    },
    async (request, reply) => {
      const { commodity } = parseWith(z.object({ commodity: commoditySchema }), request.params, 'params');
      return reply.send({ data: await priceHistory(commodity) });
    },
  );
}

// Referenced to keep route metadata types stable across Fastify versions.
void trimmedOptional;
void parseQuery;
