import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { parseBody } from '../../lib/http';
import { dateOnlySchema, nullableOptional, trimmedOptional } from '../../lib/schemas';
import { authenticate, currentUser } from '../../plugins/auth';
import { recordAudit } from '../../lib/audit';
import { serializeUser } from '../../lib/serializers';

const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: trimmedOptional(40),
    address: nullableOptional(500),
    dateOfBirth: dateOnlySchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/profile',
    { preHandler: [authenticate], schema: { tags: ['Profile'], summary: 'Get own profile' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const user = await prisma.user.findUnique({ where: { id: auth.id } });
      if (!user) throw AppError.unauthorized();
      const assignment =
        user.role === 'USER'
          ? await prisma.adminAssignment.findFirst({
              where: { clientId: user.id, status: 'ACTIVE' },
              include: { admin: true },
            })
          : null;
      return reply.send({
        data: {
          ...serializeUser(user),
          advisor: assignment
            ? {
                id: assignment.admin.id,
                fullName: `${assignment.admin.firstName} ${assignment.admin.lastName}`.trim(),
                email: assignment.admin.email,
                phone: assignment.admin.phone,
              }
            : null,
        },
      });
    },
  );

  app.patch(
    '/profile',
    { preHandler: [authenticate], schema: { tags: ['Profile'], summary: 'Update own permitted profile fields' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(updateProfileSchema, request.body);
      const before = await prisma.user.findUnique({ where: { id: auth.id } });
      if (!before) throw AppError.unauthorized();

      const updated = await prisma.user.update({
        where: { id: auth.id },
        data: {
          ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
          ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth } : {}),
        },
      });

      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'PROFILE_UPDATED',
        entityType: 'USER',
        entityId: auth.id,
        clientId: auth.role === 'USER' ? auth.id : null,
        summary: 'Profile updated',
        before: before,
        after: updated,
        ipAddress: request.ip,
      });

      return reply.send({ data: serializeUser(updated) });
    },
  );
}
