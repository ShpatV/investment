import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery, parseWith } from '../../lib/http';
import {
  currencySchema,
  dateOnlySchema,
  decimalStringSchema,
  moneyAmountSchema,
  pageSchema,
  trimmedOptional,
  uuidSchema,
} from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import {
  assertCanManageClient,
  investmentWhereFor,
} from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeDocument, serializeInvestment, serializeTransaction } from '../../lib/serializers';
import { project, projectionView } from '../../services/investments';
import { notify } from '../../services/notifications';
import { moneyNumber, rateNumber } from '../../services/finance';
import { dateOnly } from '../../lib/serializers';

const rateSchema = decimalStringSchema
  .refine((value) => Number(value) >= 0 && Number(value) <= 1000, 'Interest rate must be between 0 and 1000');

const createSchema = z
  .object({
    clientId: uuidSchema,
    institutionId: uuidSchema,
    name: z.string().trim().min(2).max(200),
    principalAmount: moneyAmountSchema.refine((value) => Number(value) > 0, 'Principal must be greater than zero'),
    currency: currencySchema,
    annualInterestRate: rateSchema,
    compoundingFrequency: z.enum(['SIMPLE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'ANNUALLY']).default('SIMPLE'),
    startDate: dateOnlySchema,
    maturityDate: dateOnlySchema,
    status: z.enum(['ACTIVE', 'PENDING', 'MATURED', 'CLOSED']).default('ACTIVE'),
    notes: trimmedOptional(2000),
  })
  .refine((value) => value.maturityDate.getTime() > value.startDate.getTime(), {
    message: 'Maturity date must be after the start date',
    path: ['maturityDate'],
  });

const updateSchema = z
  .object({
    institutionId: uuidSchema.optional(),
    name: z.string().trim().min(2).max(200).optional(),
    principalAmount: moneyAmountSchema
      .refine((value) => Number(value) > 0, 'Principal must be greater than zero')
      .optional(),
    currency: currencySchema.optional(),
    annualInterestRate: rateSchema.optional(),
    compoundingFrequency: z.enum(['SIMPLE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'ANNUALLY']).optional(),
    startDate: dateOnlySchema.optional(),
    maturityDate: dateOnlySchema.optional(),
    status: z.enum(['ACTIVE', 'PENDING', 'MATURED', 'CLOSED']).optional(),
    notes: trimmedOptional(2000),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

const listQuerySchema = z.object({
  ...pageSchema,
  clientId: uuidSchema.optional(),
  institutionId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'PENDING', 'MATURED', 'CLOSED']).optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['createdAt', 'startDate', 'maturityDate', 'name']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export async function investmentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/investments',
    { preHandler: [authenticate], schema: { tags: ['Investments'], summary: 'List investments visible to the current user' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(listQuerySchema, request.query);

      const extra: Prisma.InvestmentWhereInput = {
        ...(query.clientId && auth.role !== 'USER' ? { clientId: query.clientId } : {}),
        ...(query.institutionId ? { institutionId: query.institutionId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { institution: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };
      const where = investmentWhereFor(auth, extra);
      const orderBy = { [query.sortBy]: query.sortDir } as Prisma.InvestmentOrderByWithRelationInput;

      const [total, investments] = await Promise.all([
        prisma.investment.count({ where }),
        prisma.investment.findMany({
          where,
          include: {
            institution: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            transactions: true,
          },
          orderBy,
          ...paginationArgs(query),
        }),
      ]);

      return reply.send(
        paginated(
          investments.map((investment) => serializeInvestment(investment, projectionView(investment))),
          total,
          query,
        ),
      );
    },
  );

  app.post(
    '/investments',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Investments'], summary: 'Create an investment for a client' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);
      await assertCanManageClient(auth, body.clientId);

      const institution = await prisma.institution.findUnique({ where: { id: body.institutionId } });
      if (!institution) throw AppError.validation('Institution not found');
      if (institution.status !== 'ACTIVE') throw AppError.validation('Institution is disabled');

      const created = await prisma.$transaction(async (tx) => {
        const investment = await tx.investment.create({
          data: {
            clientId: body.clientId,
            institutionId: body.institutionId,
            name: body.name,
            principalAmount: new Prisma.Decimal(body.principalAmount),
            currency: body.currency,
            annualInterestRate: new Prisma.Decimal(body.annualInterestRate),
            compoundingFrequency: body.compoundingFrequency,
            startDate: body.startDate,
            maturityDate: body.maturityDate,
            status: body.status,
            notes: body.notes ?? null,
            createdById: auth.id,
            updatedById: auth.id,
          },
          include: { institution: true, client: true, transactions: true },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'INVESTMENT_CREATED',
            entityType: 'INVESTMENT',
            entityId: investment.id,
            clientId: investment.clientId,
            summary: `Investment ${investment.name} created`,
            after: investment,
            ipAddress: request.ip,
          },
          tx,
        );
        await notify(
          {
            userId: investment.clientId,
            type: 'INVESTMENT',
            title: 'New investment added',
            body: `${investment.name} was added to your portfolio.`,
            link: `/investments/${investment.id}`,
          },
          tx,
        );
        return investment;
      });

      return reply.status(201).send({
        data: serializeInvestment(created, projectionView(created)),
      });
    },
  );

  app.get(
    '/investments/:id',
    { preHandler: [authenticate], schema: { tags: ['Investments'], summary: 'Get investment details' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const investment = await prisma.investment.findFirst({
        where: investmentWhereFor(auth, { id }),
        include: {
          institution: true,
          client: { select: { id: true, firstName: true, lastName: true, email: true } },
          transactions: {
            include: { investment: { select: { id: true, name: true } } },
            orderBy: { transactionDate: 'desc' },
          },
          documents: {
            where: { status: 'ACTIVE' },
            include: { uploadedBy: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!investment) throw AppError.notFound('Investment not found');

      return reply.send({
        data: {
          ...serializeInvestment(investment, projectionView(investment)),
          transactions: investment.transactions.map(serializeTransaction),
          documents: investment.documents.map(serializeDocument),
          lastUpdatedAt: investment.updatedAt,
        },
      });
    },
  );

  app.patch(
    '/investments/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Investments'], summary: 'Update investment terms' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const body = parseBody(updateSchema, request.body);

      const before = await prisma.investment.findFirst({
        where: investmentWhereFor(auth, { id }),
        include: { institution: true, client: true, transactions: true },
      });
      if (!before) throw AppError.notFound('Investment not found');

      if (body.currency !== undefined && body.currency !== before.currency && before.transactions.length > 0) {
        throw AppError.conflict(
          'The investment currency cannot be changed after transactions have been recorded',
        );
      }

      const startDate = body.startDate ?? before.startDate;
      const maturityDate = body.maturityDate ?? before.maturityDate;
      if (maturityDate.getTime() <= startDate.getTime()) {
        throw AppError.validation('Maturity date must be after the start date');
      }
      if (body.institutionId) {
        const institution = await prisma.institution.findUnique({ where: { id: body.institutionId } });
        if (!institution || institution.status !== 'ACTIVE') {
          throw AppError.validation('Institution is not available');
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const investment = await tx.investment.update({
          where: { id },
          data: {
            ...(body.institutionId !== undefined ? { institutionId: body.institutionId } : {}),
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.principalAmount !== undefined
              ? { principalAmount: new Prisma.Decimal(body.principalAmount) }
              : {}),
            ...(body.currency !== undefined ? { currency: body.currency } : {}),
            ...(body.annualInterestRate !== undefined
              ? { annualInterestRate: new Prisma.Decimal(body.annualInterestRate) }
              : {}),
            ...(body.compoundingFrequency !== undefined
              ? { compoundingFrequency: body.compoundingFrequency }
              : {}),
            ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
            ...(body.maturityDate !== undefined ? { maturityDate: body.maturityDate } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
            updatedById: auth.id,
          },
          include: { institution: true, client: true, transactions: true },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'INVESTMENT_UPDATED',
            entityType: 'INVESTMENT',
            entityId: id,
            clientId: investment.clientId,
            summary: `Investment ${investment.name} updated`,
            before,
            after: investment,
            ipAddress: request.ip,
          },
          tx,
        );
        if (body.status && body.status !== before.status) {
          await notify(
            {
              userId: investment.clientId,
              type: 'INVESTMENT',
              title: 'Investment status changed',
              body: `${investment.name} is now ${body.status.toLowerCase()}.`,
              link: `/investments/${investment.id}`,
            },
            tx,
          );
        }
        return investment;
      });

      return reply.send({ data: serializeInvestment(updated, projectionView(updated)) });
    },
  );
}

export const investmentHelpers = { project, moneyNumber, rateNumber, dateOnly };
