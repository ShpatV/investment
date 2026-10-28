import { PrismaClient, Prisma, type CompoundingFrequency } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { config } from '../src/config';

const prisma = new PrismaClient();

const PASSWORD_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function upsertUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  password: string;
  phone?: string;
  address?: string;
  dateOfBirth?: Date;
  securityQuestion?: string;
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
      dateOfBirth: input.dateOfBirth ?? null,
      securityQuestion: input.securityQuestion ?? "What was the name of your first pet?",
      securityAnswerHash: await hash('demo-answer', PASSWORD_OPTIONS),
    },
  });
}

async function main(): Promise<void> {
  console.log('Seeding investment platform demo data…');

  const superAdmin = await upsertUser({
    email: config.seed.superAdminEmail,
    firstName: 'Alexandra',
    lastName: 'Voss',
    role: 'SUPER_ADMIN',
    password: config.seed.superAdminPassword,
    phone: '+1 212 555 0100',
    address: '1 Wall Street, New York, NY',
  });

  const admin = await upsertUser({
    email: config.seed.adminEmail,
    firstName: 'Marcus',
    lastName: 'Reid',
    role: 'ADMIN',
    password: config.seed.adminPassword,
    phone: '+1 212 555 0142',
    address: '45 Madison Avenue, New York, NY',
  });

  const secondAdmin = await upsertUser({
    email: 'advisor2@example.com',
    firstName: 'Elena',
    lastName: 'Moreau',
    role: 'ADMIN',
    password: config.seed.adminPassword,
  });

  const client = await upsertUser({
    email: config.seed.clientEmail,
    firstName: 'Daniel',
    lastName: 'Whitfield',
    role: 'USER',
    password: config.seed.clientPassword,
    phone: '+1 646 555 0178',
    address: '88 Greenwich Street, New York, NY',
    dateOfBirth: date('1984-06-12'),
  });

  const unassignedClient = await upsertUser({
    email: 'jordan.lee@example.com',
    firstName: 'Jordan',
    lastName: 'Lee',
    role: 'USER',
    password: config.seed.clientPassword,
    phone: '+1 917 555 0199',
    address: '300 Park Avenue, New York, NY',
  });

  const institutionNames = [
    { name: 'Aurum Capital Partners', description: 'Precious-metals focused investment manager.' },
    { name: 'Meridian Energy Partners', description: 'Energy and infrastructure fixed-income specialist.' },
    { name: 'Northbridge Private Bank', description: 'Private banking and treasury services.' },
    { name: 'Crestline Asset Management', description: 'Diversified portfolio management.' },
  ];
  const institutions: Record<string, { id: string }> = {};
  for (const entry of institutionNames) {
    institutions[entry.name] = await prisma.institution.upsert({
      where: { name: entry.name },
      update: {},
      create: entry,
    });
  }

  const existingAssigned = await prisma.adminAssignment.findFirst({
    where: { clientId: client.id, status: 'ACTIVE' },
  });
  if (!existingAssigned) {
    await prisma.adminAssignment.create({
      data: {
        clientId: client.id,
        adminId: admin.id,
        assignedById: superAdmin.id,
        status: 'ACTIVE',
        notes: 'Primary advisor assignment created during onboarding.',
      },
    });
  }

  const existingInvestments = await prisma.investment.count({ where: { clientId: client.id } });
  if (existingInvestments === 0) {
    const goldNote = await prisma.investment.create({
      data: {
        clientId: client.id,
        institutionId: institutions['Aurum Capital Partners']!.id,
        name: 'Gold Income Note — Series IV',
        principalAmount: new Prisma.Decimal('250000.00'),
        annualInterestRate: new Prisma.Decimal('6.2500'),
        compoundingFrequency: 'SIMPLE' as CompoundingFrequency,
        startDate: date('2024-01-15'),
        maturityDate: date('2027-01-15'),
        status: 'ACTIVE',
        notes: 'Senior secured note linked to a diversified gold portfolio. Interest paid annually.',
        createdById: admin.id,
        updatedById: admin.id,
      },
    });

    const energyBond = await prisma.investment.create({
      data: {
        clientId: client.id,
        institutionId: institutions['Meridian Energy Partners']!.id,
        name: 'Meridian Energy Bond 2028',
        principalAmount: new Prisma.Decimal('150000.00'),
        annualInterestRate: new Prisma.Decimal('5.7500'),
        compoundingFrequency: 'QUARTERLY' as CompoundingFrequency,
        startDate: date('2025-03-01'),
        maturityDate: date('2028-03-01'),
        status: 'ACTIVE',
        notes: 'Investment-grade energy infrastructure bond. Interest compounded quarterly.',
        createdById: admin.id,
        updatedById: admin.id,
      },
    });

    await prisma.investment.create({
      data: {
        clientId: client.id,
        institutionId: institutions['Northbridge Private Bank']!.id,
        name: 'Treasury Reserve — 24 Month',
        principalAmount: new Prisma.Decimal('90000.00'),
        annualInterestRate: new Prisma.Decimal('4.4000'),
        compoundingFrequency: 'ANNUALLY' as CompoundingFrequency,
        startDate: date('2023-08-01'),
        maturityDate: date('2025-08-01'),
        status: 'MATURED',
        notes: 'Matured term deposit retained for reporting history.',
        createdById: admin.id,
        updatedById: admin.id,
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          clientId: client.id,
          investmentId: goldNote.id,
          type: 'DEPOSIT',
          amount: new Prisma.Decimal('50000.00'),
          description: 'Additional principal contribution',
          status: 'COMPLETED',
          affectsPrincipal: true,
          transactionDate: date('2025-01-15'),
          createdById: admin.id,
          updatedById: admin.id,
        },
        {
          clientId: client.id,
          investmentId: goldNote.id,
          type: 'WITHDRAWAL',
          amount: new Prisma.Decimal('25000.00'),
          description: 'Partial principal withdrawal',
          status: 'COMPLETED',
          affectsPrincipal: true,
          transactionDate: date('2025-06-01'),
          createdById: admin.id,
          updatedById: admin.id,
        },
        {
          clientId: client.id,
          investmentId: goldNote.id,
          type: 'INTEREST',
          amount: new Prisma.Decimal('15000.00'),
          description: 'Annual coupon payment',
          status: 'COMPLETED',
          affectsPrincipal: false,
          transactionDate: daysAgo(45),
          createdById: admin.id,
          updatedById: admin.id,
        },
        {
          clientId: client.id,
          investmentId: energyBond.id,
          type: 'DEPOSIT',
          amount: new Prisma.Decimal('10000.00'),
          description: 'Scheduled principal top-up (pending settlement)',
          status: 'PENDING',
          affectsPrincipal: true,
          transactionDate: daysAgo(2),
          createdById: admin.id,
          updatedById: admin.id,
        },
      ],
    });
  }

  const existingNotification = await prisma.notification.findFirst({ where: { userId: client.id } });
  if (!existingNotification) {
    await prisma.notification.createMany({
      data: [
        {
          userId: client.id,
          type: 'ACCOUNT',
          title: 'Welcome to your investment portal',
          body: 'Your portfolio is available to review. Contact your advisor with any questions.',
          link: '/dashboard',
        },
        {
          userId: admin.id,
          type: 'ASSIGNMENT',
          title: 'Client portfolio assigned',
          body: `${client.firstName} ${client.lastName} is assigned to you.`,
          link: `/clients/${client.id}`,
        },
      ],
    });
  }

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

  const existingAudit = await prisma.auditLog.count();
  if (existingAudit === 0) {
    await prisma.auditLog.create({
      data: {
        actorId: superAdmin.id,
        actorRole: 'SUPER_ADMIN',
        action: 'SYSTEM_SEEDED',
        entityType: 'SYSTEM',
        summary: 'Demo environment initialized',
        outcome: 'SUCCESS',
        clientId: client.id,
      },
    });
  }

  console.log('Seed complete.');
  console.log('  Super admin:', config.seed.superAdminEmail);
  console.log('  Admin:      ', config.seed.adminEmail, '(second admin: advisor2@example.com)');
  console.log('  Client:     ', config.seed.clientEmail, '(unassigned client: jordan.lee@example.com)');
  console.log('  Passwords are read from SEED_*_PASSWORD environment variables.');
  console.log('  Market prices are intentionally empty until a provider refresh runs (no fabricated prices).');
  console.log('  Unassigned client:', unassignedClient.email);
  console.log('  Second admin:', secondAdmin.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
