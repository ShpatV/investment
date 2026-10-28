import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../plugins/auth';
import { parseQuery } from '../../lib/http';
import { getMarketNews } from './service';

export async function newsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/news',
    { preHandler: [authenticate], schema: { tags: ['News'], summary: 'Get cached gold/oil market headlines' } },
    async (request, reply) => {
      const query = parseQuery(
        z.object({ limit: z.coerce.number().int().min(1).max(20).default(12) }),
        request.query,
      );
      const result = await getMarketNews(query.limit);
      return reply.send({ data: result });
    },
  );
}
