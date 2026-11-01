import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { parseBody } from '../../lib/http';
import { authenticate, currentUser } from '../../plugins/auth';
import { isoDateTimeSchema } from '../../lib/schemas';

const createSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(100),
  email: z.string().trim().email('Please enter a valid email').max(255),
  phone: z.string().trim().max(40).optional(),
  topic: z.string().min(1, 'Please choose a topic'),
  message: z.string().trim().min(10, 'A few more words would help').max(2000),
  consent: z.literal(true),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/contact',
    {
      schema: { tags: ['Contact'], summary: 'Submit a contact form enquiry' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);

      const created = await prisma.contactMessage.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone ?? null,
          topic: body.topic,
          message: body.message,
          consent: body.consent,
          ipAddress: request.ip,
        },
      });

      await recordAudit({
        actorId: auth?.id ?? null,
        actorRole: auth?.role ?? null,
        action: 'CONTACT_MESSAGE_CREATED',
        entityType: 'CONTACT_MESSAGE',
        entityId: created.id,
        summary: `Contact message from ${created.email}`,
        ipAddress: request.ip,
      });

      return reply.send({ data: { id: created.id, status: 'received' } });
    },
  );
}