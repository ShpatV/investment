import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { parseQuery } from '../../lib/http';
import { uuidSchema } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../plugins/auth';
import {
  assignedClientIds,
  assertClientAccess,
  clientWhereFor,
  investmentWhereFor,
  isAdmin,
  transactionWhereFor,
  documentWhereFor,
} from '../../lib/scope';
import { serializeAudit, serializeDocument, serializeInvestment, serializeTransaction } from '../../lib/serializers';
import { loadClientInvestments, project, projectionView, summarize } from '../../services/investments';
import { dec, moneyNumber } from '../../services/finance';
import { listPrices } from '../prices/service';

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/dashboard/client',
    { preHandler: [authenticate], schema: { tags: ['Dashboard'], summary: 'Client dashboard metrics and portfolio' } },
    async (request, reply) => {
      const auth = currentUser(request);
      const query = parseQuery(z.object({ clientId: uuidSchema.optional() }), request.query);

      let clientId: string;
      if (auth.role === 'USER') {
        clientId = auth.id;
        if (query.clientId && query.clientId !== auth.id) throw AppError.notFound('Client not found');
      } else {
        if (!query.clientId) throw AppError.validation('clientId is required for administrative users');
        clientId = query.clientId;
        await assertClientAccess(auth, clientId);
      }

      const client = await prisma.user.findFirst({ where: { id: clientId, role: 'USER' } });
      if (!client) throw AppError.notFound('Client not found');

      const now = new Date();
      const investments = await loadClientInvestments(clientId);
      const summary = summarize(investments, now);
      const active = investments.filter((investment) => investment.status === 'ACTIVE');
      const upcoming = active
        .filter((investment) => investment.maturityDate >= startOfToday())
        .sort((a, b) => a.maturityDate.getTime() - b.maturityDate.getTime());

      const [recentTransactions, unreadNotifications] = await Promise.all([
        prisma.transaction.findMany({
          where: { clientId },
          include: { investment: { select: { id: true, name: true } } },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        }),
        prisma.notification.count({ where: { userId: clientId, readAt: null } }),
      ]);

      return reply.send({
        data: {
          client: {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            memberSince: client.createdAt,
          },
          summary,
          allocation: summary.allocation,
          asOf: now.toISOString(),
          portfolio: investments.map((investment) =>
            serializeInvestment(investment, projectionView(investment, now)),
          ),
          recentActivity: recentTransactions.map(serializeTransaction),
          planning: {
            nextMaturityDate: upcoming[0]?.maturityDate ?? null,
            estimatedFutureBalance: summary.projectedMaturityBalance,
            estimatedEarnings: summary.projectedReturn,
            timeline: upcoming.map((investment) => ({
              investmentId: investment.id,
              name: investment.name,
              maturityDate: investment.maturityDate,
              daysRemaining: daysUntil(investment.maturityDate),
              projectedMaturityBalance: projectionView(investment, now).projectedMaturityBalance,
            })),
            upcomingMaturities: upcoming.slice(0, 5).map((investment) => ({
              ...serializeInvestment(investment, projectionView(investment, now)),
              daysRemaining: daysUntil(investment.maturityDate),
            })),
          },
          unreadNotifications,
          assumptions: {
            dayCount: 'Actual/365',
            rounding: 'Half-up to 2 decimal places for monetary values',
            projectionDisclaimer:
              'Projected values are estimates based on contractual terms and completed principal cash flows; they are not guaranteed returns.',
          },
        },
      });
    },
  );

  app.get(
    '/dashboard/admin',
    {
      preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')],
      schema: { tags: ['Dashboard'], summary: 'Administrative overview metrics and recent activity' },
    },
    async (request, reply) => {
      const auth = currentUser(request);
      const now = new Date();
      const today = startOfToday();
      const in90Days = new Date(today.getTime() + 90 * 86_400_000);

      const clientWhere = { ...clientWhereFor(auth), role: 'USER' as const };
      const adminScope = isAdmin(auth);

      const activeInvestmentWhere = investmentWhereFor(auth, { status: 'ACTIVE' });

      const [
        totalClients,
        activeClients,
        totalAdmins,
        totalInvestments,
        unreadItems,
        activeInvestments,
        recentTransactions,
        recentlyAddedClients,
        recentInvestments,
        upcomingMaturities,
        recentDocuments,
        auditClientIds,
      ] = await Promise.all([
        prisma.user.count({ where: clientWhere }),
        prisma.user.count({ where: { ...clientWhere, status: 'ACTIVE' } }),
        auth.role === 'SUPER_ADMIN'
          ? prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } })
          : prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
        prisma.investment.count({ where: investmentWhereFor(auth) }),
        prisma.notification.count({ where: { userId: auth.id, readAt: null } }),
        prisma.investment.findMany({
          where: activeInvestmentWhere,
          include: { institution: true, transactions: true },
        }),
        prisma.transaction.findMany({
          where: transactionWhereFor(auth),
          include: {
            client: { select: { id: true, firstName: true, lastName: true } },
            investment: { select: { id: true, name: true } },
          },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        }),
        prisma.user.findMany({
          where: clientWhere,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.investment.findMany({
          where: investmentWhereFor(auth),
          include: {
            institution: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            transactions: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
        }),
        prisma.investment.findMany({
          where: investmentWhereFor(auth, {
            status: 'ACTIVE',
            maturityDate: { gte: today, lte: in90Days },
          }),
          include: {
            institution: true,
            client: { select: { id: true, firstName: true, lastName: true, email: true } },
            transactions: true,
          },
          orderBy: { maturityDate: 'asc' },
          take: 5,
        }),
        prisma.document.findMany({
          where: documentWhereFor(auth, { status: 'ACTIVE' }),
          include: {
            uploadedBy: true,
            client: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        !adminScope || auth.role === 'SUPER_ADMIN' ? Promise.resolve([]) : assignedClientIds(auth.id),
      ]);

      const auditWhere =
        auth.role === 'SUPER_ADMIN'
          ? {}
          : {
              OR: [
                { actorId: auth.id },
                ...(auditClientIds.length > 0 ? [{ clientId: { in: auditClientIds } }] : []),
              ],
            };
      const recentAudit = await prisma.auditLog.findMany({
        where: auditWhere,
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      const aum = activeInvestments.reduce(
        (sum, investment) => sum.plus(dec(project(investment).currentPrincipal)),
        dec(0),
      );
      const prices = await listPrices();

      return reply.send({
        data: {
          scope: auth.role === 'SUPER_ADMIN' ? 'SYSTEM' : 'ASSIGNED_CLIENTS',
          role: auth.role,
          asOf: now.toISOString(),
          metrics: {
            totalUsers: totalClients,
            totalClients,
            activeClients,
            totalAdmins,
            totalInvestments,
            aum: moneyNumber(aum),
            unreadItems,
          },
          definitions: {
            aum:
              'Assets under management: current principal of ACTIVE investments, adjusted for COMPLETED principal-affecting deposits and withdrawals. Projected interest and pending/failed transactions are excluded.',
            activeClients: 'Client accounts with status ACTIVE.',
            unreadItems: 'Unread notifications for the signed-in administrator.',
          },
          recentTransactions: recentTransactions.map(serializeTransaction),
          recentlyAddedClients: recentlyAddedClients.map((client) => ({
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            status: client.status,
            createdAt: client.createdAt,
          })),
          recentInvestmentUpdates: recentInvestments.map((investment) =>
            serializeInvestment(investment, projectionView(investment, now)),
          ),
          upcomingMaturities: upcomingMaturities.map((investment) => ({
            ...serializeInvestment(investment, projectionView(investment, now)),
            daysRemaining: daysUntil(investment.maturityDate),
          })),
          recentDocuments: recentDocuments.map(serializeDocument),
          recentAudit: recentAudit.map(serializeAudit),
          prices,
        },
      });
    },
  );
}
