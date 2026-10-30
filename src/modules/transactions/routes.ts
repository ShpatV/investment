import type { FastifyInstance } from 'fastify';
import { Prisma, type Transaction } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { paginated, paginationArgs, parseBody, parseQuery, parseWith } from '../../lib/http';
import {
  currencySchema,
  dateOnlySchema,
  isoDateTimeSchema,
  pageSchema,
  positiveAmountSchema,
  trimmedOptional,
  uuidSchema,
} from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import { assertCanManageClient, transactionWhereFor } from '../../lib/scope';
import { recordAudit } from '../../lib/audit';
import { serializeTransaction } from '../../lib/serializers';
import { project } from '../../services/investments';
import { notify } from '../../services/notifications';
import { dec } from '../../services/finance';

const transactionDateSchema = z.union([isoDateTimeSchema, dateOnlySchema]);

const createSchema = z.object({
  clientId: uuidSchema,
  investmentId: uuidSchema.optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST']),
  amount: positiveAmountSchema,
  currency: currencySchema,
  description: trimmedOptional(1000),
  status: z.enum(['COMPLETED', 'PENDING', 'FAILED']).default('PENDING'),
  affectsPrincipal: z.boolean().optional(),
  transactionDate: transactionDateSchema,
});

const updateSchema = z
  .object({
    investmentId: uuidSchema.nullable().optional(),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST']).optional(),
    amount: positiveAmountSchema.optional(),
    currency: currencySchema.optional(),
    description: trimmedOptional(1000),
    status: z.enum(['COMPLETED', 'PENDING', 'FAILED']).optional(),
    affectsPrincipal: z.boolean().optional(),
    transactionDate: transactionDateSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one field must be provided',
  });

const listQuerySchema = z.object({
  ...pageSchema,
  clientId: uuidSchema.optional(),
  investmentId: uuidSchema.optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'INTEREST']).optional(),
  status: z.enum(['COMPLETED', 'PENDING', 'FAILED']).optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

function resolveDateFilter(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) throw AppError.validation(`Invalid date filter: ${value}`);
  if (endOfDay && isDateOnly) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

type TransactionDb = Pick<Prisma.TransactionClient, 'investment'>;

/**
 * Takes a transaction-scoped advisory lock keyed by investment. This serialises
 * concurrent balance-affecting mutations for the same investment, including
 * across multiple API instances, so two withdrawals cannot both validate
 * against the same starting principal.
 */
async function lockInvestment(db: Prisma.TransactionClient, investmentId: string): Promise<void> {
  // Cast the void result to text so Prisma can deserialize the row.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${investmentId}))::text`;
}

function assertIdempotentReplay(existing: Transaction, body: z.infer<typeof createSchema>): void {
  const same =
    existing.clientId === body.clientId &&
    existing.type === body.type &&
    existing.currency === body.currency &&
    existing.status === body.status &&
    (existing.investmentId ?? null) === (body.investmentId ?? null) &&
    existing.transactionDate.getTime() === body.transactionDate.getTime() &&
    (existing.description ?? null) === (body.description ?? null) &&
    existing.amount.toFixed(2) === new Prisma.Decimal(body.amount).toFixed(2);
  if (!same) {
    throw AppError.conflict('Idempotency-Key was already used with a different payload');
  }
}

async function validateTransactionInput(
  input: {
    clientId: string;
    investmentId?: string | null;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'INTEREST';
    amount: string;
    currency: string;
    status: 'COMPLETED' | 'PENDING' | 'FAILED';
    affectsPrincipal?: boolean;
  },
  db: TransactionDb = prisma,
  excludeTransactionId?: string,
) {
  let affectsPrincipal = input.affectsPrincipal;
  if (input.type === 'INTEREST') {
    if (!input.investmentId) throw AppError.validation('Interest transactions must reference an investment');
    if (affectsPrincipal === true) throw AppError.validation('Interest never changes principal');
    affectsPrincipal = false;
  }
  if (affectsPrincipal === undefined) {
    affectsPrincipal = Boolean(input.investmentId) && input.type !== 'INTEREST';
  }
  if (affectsPrincipal && !input.investmentId) {
    throw AppError.validation('Principal-affecting transactions must reference an investment');
  }

  let investment = null;
  if (input.investmentId) {
    investment = await db.investment.findUnique({
      where: { id: input.investmentId },
      include: {
        institution: true,
        // When editing a transaction, re-project as if that transaction did
        // not exist yet. Otherwise editing a completed withdrawal would count
        // itself against the withdrawal limit.
        transactions: excludeTransactionId
          ? { where: { id: { not: excludeTransactionId } } }
          : true,
      },
    });
    if (!investment) throw AppError.validation('Investment not found');
    if (investment.clientId !== input.clientId) {
      throw AppError.validation('The selected investment does not belong to this client');
    }
    if (investment.currency !== input.currency) {
      throw AppError.validation(`Investment currency is ${investment.currency}`);
    }
    if (investment.status === 'CLOSED') {
      throw AppError.validation('Closed investments cannot receive new transactions');
    }
    if (
      input.status === 'COMPLETED' &&
      affectsPrincipal &&
      input.type === 'WITHDRAWAL'
    ) {
      const currentPrincipal = project(investment).currentPrincipal;
      if (dec(input.amount).gt(currentPrincipal)) {
        throw AppError.validation(
          `Withdrawal exceeds the current invested principal (${currentPrincipal.toFixed(2)})`,
        );
      }
    }
  }

  return { affectsPrincipal, investment };
}

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/transactions',
    { preHandler: [authenticate], schema: { tags: ['Transactions'], summary: 'List transactions' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(listQuerySchema, request.query);
      const from = resolveDateFilter(query.from);
      const to = resolveDateFilter(query.to, true);

      if (from && to && from >= to) throw AppError.validation('The "from" date must be before the "to" date');

      const extra: Prisma.TransactionWhereInput = {
        ...(query.clientId && auth.role !== 'USER' ? { clientId: query.clientId } : {}),
        ...(query.investmentId ? { investmentId: query.investmentId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(from || to
          ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
        ...(query.search
          ? {
              OR: [
                { description: { contains: query.search, mode: 'insensitive' } },
                { investment: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };

      const where = transactionWhereFor(auth, extra);
      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          include: {
            investment: { select: { id: true, name: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          ...paginationArgs(query),
        }),
      ]);

      return reply.send(paginated(transactions.map(serializeTransaction), total, query));
    },
  );

  app.post(
    '/transactions',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Transactions'], summary: 'Record a transaction for a client' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const body = parseBody(createSchema, request.body);
      await assertCanManageClient(auth, body.clientId);

      const idempotencyKeyHeader = request.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(idempotencyKeyHeader)
        ? idempotencyKeyHeader[0]
        : idempotencyKeyHeader;
      if (idempotencyKey && idempotencyKey.length > 100) {
        throw AppError.validation('Idempotency-Key must be at most 100 characters');
      }
      if (idempotencyKey) {
        const existing = await prisma.transaction.findUnique({
          where: { idempotencyKey },
          include: { investment: { select: { id: true, name: true } } },
        });
        if (existing) {
          if (existing.clientId !== body.clientId) {
            throw AppError.conflict('Idempotency key has already been used for another client');
          }
          assertIdempotentReplay(existing, body);
          return reply.status(200).send({ data: serializeTransaction(existing), idempotent: true });
        }
      }

      const created = await prisma.$transaction(async (tx) => {
        if (body.investmentId) await lockInvestment(tx, body.investmentId);
        const { affectsPrincipal } = await validateTransactionInput(body, tx);

        const transaction = await tx.transaction.create({
          data: {
            clientId: body.clientId,
            investmentId: body.investmentId ?? null,
            type: body.type,
            amount: new Prisma.Decimal(body.amount),
            currency: body.currency,
            description: body.description ?? null,
            status: body.status,
            affectsPrincipal,
            idempotencyKey: idempotencyKey ?? null,
            transactionDate: body.transactionDate,
            createdById: auth.id,
            updatedById: auth.id,
          },
          include: { investment: { select: { id: true, name: true } } },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'TRANSACTION_CREATED',
            entityType: 'TRANSACTION',
            entityId: transaction.id,
            clientId: transaction.clientId,
            summary: `${transaction.type} ${transaction.currency} ${transaction.amount.toFixed(2)} recorded (${transaction.status})`,
            after: transaction,
            ipAddress: request.ip,
          },
          tx,
        );
        await notify(
          {
            userId: transaction.clientId,
            type: 'TRANSACTION',
            title: `Transaction ${transaction.status.toLowerCase()}`,
            body: `${transaction.type.charAt(0)}${transaction.type.slice(1).toLowerCase()} of ${transaction.currency} ${transaction.amount.toFixed(2)} was recorded.`,
            link: '/transactions',
          },
          tx,
        );
        return transaction;
      });

      return reply.status(201).send({ data: serializeTransaction(created) });
    },
  );

  app.get(
    '/transactions/:id',
    { preHandler: [authenticate], schema: { tags: ['Transactions'], summary: 'Get a transaction' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const transaction = await prisma.transaction.findFirst({
        where: transactionWhereFor(auth, { id }),
        include: {
          investment: { select: { id: true, name: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!transaction) throw AppError.notFound('Transaction not found');
      return reply.send({ data: serializeTransaction(transaction) });
    },
  );

  app.patch(
    '/transactions/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Transactions'], summary: 'Update a pending transaction' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const { id } = parseWith(z.object({ id: uuidSchema }), request.params, 'params');
      const body = parseBody(updateSchema, request.body);

      const before = await prisma.transaction.findFirst({
        where: transactionWhereFor(auth, { id }),
        include: {
          investment: { select: { id: true, name: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!before) throw AppError.notFound('Transaction not found');

      const requestedInvestmentId =
        body.investmentId !== undefined ? body.investmentId : before.investmentId;

      const updated = await prisma.$transaction(async (tx) => {
        // Lock every investment involved, in a stable order, so two concurrent
        // withdrawals cannot both pass the principal check. Re-read the row
        // under the lock so the validation uses the committed state.
        const lockIds = [
          ...new Set(
            [before.investmentId, requestedInvestmentId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ].sort();
        for (const investmentId of lockIds) await lockInvestment(tx, investmentId);

        const current = await tx.transaction.findUnique({ where: { id } });
        if (!current) throw AppError.notFound('Transaction not found');

        const attempted = Object.entries(body)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key);

        if (current.status === 'COMPLETED') {
          const allowedFields = new Set(['description']);
          if (attempted.some((field) => !allowedFields.has(field))) {
            throw AppError.conflict(
              'Completed transactions are immutable except for their description. Record a correcting transaction instead.',
            );
          }
        }

        const descriptionOnly =
          current.status === 'COMPLETED' && attempted.every((field) => field === 'description');

        let affectsPrincipal = current.affectsPrincipal;
        if (!descriptionOnly) {
          const nextType = body.type ?? current.type;
          const nextInvestmentId =
            body.investmentId !== undefined ? body.investmentId : current.investmentId;
          const nextStatus = body.status ?? current.status;
          const nextAmount = body.amount ?? current.amount.toFixed(2);
          const nextCurrency = body.currency ?? current.currency;

          ({ affectsPrincipal } = await validateTransactionInput(
            {
              clientId: current.clientId,
              investmentId: nextInvestmentId,
              type: nextType,
              amount: nextAmount,
              currency: nextCurrency,
              status: nextStatus,
              affectsPrincipal: body.affectsPrincipal ?? current.affectsPrincipal,
            },
            tx,
            id,
          ));
        }

        const transaction = await tx.transaction.update({
          where: { id },
          data: {
            ...(body.investmentId !== undefined ? { investmentId: body.investmentId } : {}),
            ...(body.type !== undefined ? { type: body.type } : {}),
            ...(body.amount !== undefined ? { amount: new Prisma.Decimal(body.amount) } : {}),
            ...(body.currency !== undefined ? { currency: body.currency } : {}),
            ...(body.description !== undefined ? { description: body.description ?? null } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            affectsPrincipal,
            ...(body.transactionDate !== undefined ? { transactionDate: body.transactionDate } : {}),
            updatedById: auth.id,
          },
          include: { investment: { select: { id: true, name: true } } },
        });
        await recordAudit(
          {
            actorId: auth.id,
            actorRole: auth.role,
            action: 'TRANSACTION_UPDATED',
            entityType: 'TRANSACTION',
            entityId: id,
            clientId: transaction.clientId,
            summary: `Transaction updated (${current.status} → ${transaction.status})`,
            before,
            after: transaction,
            ipAddress: request.ip,
          },
          tx,
        );
        if (current.status !== transaction.status) {
          await notify(
            {
              userId: transaction.clientId,
              type: 'TRANSACTION',
              title: `Transaction ${transaction.status.toLowerCase()}`,
              body: `Your ${transaction.type.toLowerCase()} of ${transaction.currency} ${transaction.amount.toFixed(2)} is now ${transaction.status.toLowerCase()}.`,
              link: '/transactions',
            },
            tx,
          );
        }
        return transaction;
      });

      return reply.send({ data: serializeTransaction(updated) });
    },
  );
}
