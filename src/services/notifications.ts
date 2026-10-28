import type { Db } from '../lib/prisma';
import { prisma } from '../lib/prisma';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

type NotificationDb = Pick<Db, 'notification'>;

export async function notify(input: NotificationInput, db: NotificationDb = prisma): Promise<void> {
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  });
}
