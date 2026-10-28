import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { recordAudit } from '../../lib/audit';
import { allSettings, getSetting, SETTING_KEYS, setSetting } from '../../services/settings';
import { config } from '../../config';

const updateSchema = z
  .object({
    allowAdminSelfAssign: z.boolean().optional(),
    allowAdminPriceOverride: z.boolean().optional(),
    maturityReminderDays: z.number().int().min(1).max(365).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one setting must be provided',
  });

export async function settingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/settings',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Settings'], summary: 'Get all system settings' },
    },
    async (_request, reply) => {
      const settings = await allSettings();
      return reply.send({
        data: {
          settings,
          editableKeys: Object.values(SETTING_KEYS),
        },
      });
    },
  );

  app.get(
    '/settings/effective',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Settings'], summary: 'Get permissions that affect the current admin UI' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const [allowAdminSelfAssign, allowAdminPriceOverride, maturityReminderDays] = await Promise.all([
        getSetting<boolean>(SETTING_KEYS.allowAdminSelfAssign, false),
        getSetting<boolean>(SETTING_KEYS.allowAdminPriceOverride, config.allowAdminPriceOverride),
        getSetting<number>(SETTING_KEYS.maturityReminderDays, 30),
      ]);
      return reply.send({
        data: {
          role: auth.role,
          canManageAdmins: auth.role === 'SUPER_ADMIN',
          canManageAssignments: auth.role === 'SUPER_ADMIN' || allowAdminSelfAssign,
          canOverridePrices: auth.role === 'SUPER_ADMIN' || allowAdminPriceOverride,
          canManageSettings: auth.role === 'SUPER_ADMIN',
          allowAdminSelfAssign,
          allowAdminPriceOverride,
          maturityReminderDays,
        },
      });
    },
  );

  app.patch(
    '/settings',
    {
      preHandler: [authenticate, requireRole('SUPER_ADMIN')],
      schema: { tags: ['Settings'], summary: 'Update system settings' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(updateSchema, request.body);
      const changes: Array<{ key: string; value: boolean | number }> = [];
      if (body.allowAdminSelfAssign !== undefined) {
        changes.push({ key: SETTING_KEYS.allowAdminSelfAssign, value: body.allowAdminSelfAssign });
      }
      if (body.allowAdminPriceOverride !== undefined) {
        changes.push({ key: SETTING_KEYS.allowAdminPriceOverride, value: body.allowAdminPriceOverride });
      }
      if (body.maturityReminderDays !== undefined) {
        changes.push({ key: SETTING_KEYS.maturityReminderDays, value: body.maturityReminderDays });
      }

      for (const change of changes) {
        await setSetting(change.key, change.value, auth.id);
      }
      await recordAudit({
        actorId: auth.id,
        actorRole: auth.role,
        action: 'SETTINGS_UPDATED',
        entityType: 'SYSTEM_SETTING',
        summary: `Settings updated: ${changes.map((change) => change.key).join(', ')}`,
        after: body,
        ipAddress: request.ip,
      });

      return reply.send({ data: { settings: await allSettings() } });
    },
  );
}
