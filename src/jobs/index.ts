import type { FastifyInstance } from 'fastify';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { recordAudit } from '../lib/audit';
import { notify } from '../services/notifications';
import { refreshPrices } from '../modules/prices/service';
import { getNumberSetting, SETTING_KEYS } from '../services/settings';

const tasks: ScheduledTask[] = [];

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function runMaturityJob(): Promise<void> {
  const today = startOfToday();
  const matured = await prisma.investment.findMany({
    where: { status: 'ACTIVE', maturityDate: { lt: today } },
    include: { client: true, institution: true },
  });

  for (const investment of matured) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.investment.update({
        where: { id: investment.id },
        data: { status: 'MATURED' },
      });
      await recordAudit(
        {
          action: 'INVESTMENT_MATURED',
          entityType: 'INVESTMENT',
          entityId: investment.id,
          clientId: investment.clientId,
          summary: `Investment ${investment.name} reached maturity and was marked MATURED`,
          before: { status: investment.status },
          after: { status: updated.status },
        },
        tx,
      );
      await notify(
        {
          userId: investment.clientId,
          type: 'MATURITY',
          title: 'Investment matured',
          body: `${investment.name} reached its maturity date.`,
          link: `/investments/${investment.id}`,
        },
        tx,
      );
    });
  }

  const reminderDays = await getNumberSetting(SETTING_KEYS.maturityReminderDays, 30);
  const upcoming = await prisma.investment.findMany({
    where: {
      status: 'ACTIVE',
      maturityDate: {
        gte: today,
        lte: new Date(today.getTime() + reminderDays * 86_400_000),
      },
    },
  });

  for (const investment of upcoming) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: investment.clientId,
        type: 'MATURITY_REMINDER',
        link: `/investments/${investment.id}`,
      },
      select: { id: true },
    });
    if (!existing) {
      await notify({
        userId: investment.clientId,
        type: 'MATURITY_REMINDER',
        title: 'Upcoming investment maturity',
        body: `${investment.name} matures on ${investment.maturityDate.toISOString().slice(0, 10)}.`,
        link: `/investments/${investment.id}`,
      });
    }
  }
}

export async function startScheduledJobs(app: FastifyInstance): Promise<void> {
  if (config.priceProvider !== 'none') {
    tasks.push(
      cron.schedule(config.priceRefreshCron, async () => {
        try {
          const results = await refreshPrices();
          app.log.info({ results }, 'Scheduled price refresh completed');
        } catch (error) {
          app.log.error({ err: error }, 'Scheduled price refresh failed');
        }
      }),
    );

    // Initial refresh after startup; failures fall back to the last valid price.
    setTimeout(() => {
      refreshPrices()
        .then((results) => app.log.info({ results }, 'Initial price refresh completed'))
        .catch((error) => app.log.warn({ err: error }, 'Initial price refresh failed'));
    }, 2_000).unref();
  }

  tasks.push(
    cron.schedule('0 1 * * *', async () => {
      try {
        await runMaturityJob();
        app.log.info('Maturity job completed');
      } catch (error) {
        app.log.error({ err: error }, 'Maturity job failed');
      }
    }),
  );

  setTimeout(() => {
    runMaturityJob().catch((error) => app.log.warn({ err: error }, 'Initial maturity job failed'));
  }, 4_000).unref();
}

export function stopScheduledJobs(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
