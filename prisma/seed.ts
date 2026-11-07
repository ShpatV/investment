import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { config } from '../src/config';

const prisma = new PrismaClient();

const PASSWORD_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** Demo credentials must never become production credentials by accident. */
function assertProductionSeedConfig(): void {
  if (!config.isProduction) return;
  if (DEFAULT_DEMO_PASSWORDS.has(config.seed.superAdminPassword)) {
    throw new Error(
      'Refusing to seed production with the default demo password. Set SEED_SUPER_ADMIN_PASSWORD first.',
    );
  }
}

const DEFAULT_DEMO_PASSWORDS = new Set(['SuperAdmin123!']);

async function upsertUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  password: string;
  phone?: string;
  address?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      passwordHash: await hash(input.password, PASSWORD_OPTIONS),
      phone: input.phone ?? null,
      address: input.address ?? null,
      securityQuestion: "What was the name of your first pet?",
      securityAnswerHash: await hash('demo-answer', PASSWORD_OPTIONS),
    },
  });
}

async function main(): Promise<void> {
  assertProductionSeedConfig();
  console.log('Seeding super admin account…');

  const superAdmin = await upsertUser({
    email: config.seed.superAdminEmail,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    password: config.seed.superAdminPassword,
  });

  // System settings (required for app functionality)
  await prisma.systemSetting.upsert({
    where: { key: 'assignments.allowAdminSelfAssign' },
    update: {},
    create: {
      key: 'assignments.allowAdminSelfAssign',
      value: false,
      description: 'Allow administrators to claim unassigned clients (default: false).',
    },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'prices.allowAdminOverride' },
    update: {},
    create: {
      key: 'prices.allowAdminOverride',
      value: config.allowAdminPriceOverride,
      description: 'Allow ordinary administrators to override published commodity prices.',
      updatedById: superAdmin.id,
    },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'maturity.reminderDays' },
    update: {},
    create: {
      key: 'maturity.reminderDays',
      value: 30,
      description: 'Days before maturity to create an in-app reminder.',
    },
  });

  // Published prices (empty until provider refresh runs)
  for (const commodity of ['GOLD', 'OIL'] as const) {
    await prisma.publishedPrice.upsert({
      where: { commodity },
      update: {},
      create: {
        commodity,
        currency: 'USD',
        unit: commodity === 'GOLD' ? 'troy ounce' : 'barrel',
        provider: config.priceProvider === 'none' ? 'none' : 'Stooq',
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: superAdmin.id,
      actorRole: 'SUPER_ADMIN',
      action: 'SYSTEM_SEEDED',
      entityType: 'SYSTEM',
      summary: 'Super admin account initialized',
      outcome: 'SUCCESS',
    },
  });

  console.log('Seed complete.');
  console.log('  Super admin:', config.seed.superAdminEmail);
  console.log('  Password:   ', config.seed.superAdminPassword);
  console.log('  (All other accounts must be created via the admin portal.)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });