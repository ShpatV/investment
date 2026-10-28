import type { Institution, Investment, Transaction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  projectInvestment,
  serializeProjection,
  summarizePortfolio,
  type InvestmentProjection,
  type ProjectionBreakdown,
  type PortfolioSummary,
} from './finance';

export type InvestmentWithFlows = Investment & {
  institution: Institution | null;
  transactions: Transaction[];
  client?: { id: string; firstName: string; lastName: string; email: string } | null;
};

export function project(investment: InvestmentWithFlows, asOf = new Date()): ProjectionBreakdown {
  return projectInvestment(
    {
      principalAmount: investment.principalAmount,
      annualInterestRate: investment.annualInterestRate,
      compoundingFrequency: investment.compoundingFrequency,
      startDate: investment.startDate,
      maturityDate: investment.maturityDate,
      status: investment.status,
      flows: investment.transactions.map((transaction) => ({
        amount: transaction.amount,
        date: transaction.transactionDate,
        type: transaction.type,
        status: transaction.status,
        affectsPrincipal: transaction.affectsPrincipal,
      })),
    },
    asOf,
  );
}

export function projectionView(investment: InvestmentWithFlows, asOf = new Date()): InvestmentProjection {
  return serializeProjection(project(investment, asOf), asOf);
}

export function summarize(investments: InvestmentWithFlows[], asOf = new Date()): PortfolioSummary {
  return summarizePortfolio(
    investments.map((investment) => ({
      institutionId: investment.institutionId,
      institutionName: investment.institution?.name ?? 'Unknown institution',
      projection: project(investment, asOf),
      status: investment.status,
    })),
  );
}

export async function loadClientInvestments(clientId: string): Promise<InvestmentWithFlows[]> {
  return prisma.investment.findMany({
    where: { clientId },
    include: { institution: true, transactions: true },
    orderBy: [{ status: 'asc' }, { maturityDate: 'asc' }],
  });
}

export async function loadScopedInvestments(where: {
  clientId?: string;
  institutionId?: string;
  status?: Investment['status'];
  search?: string;
  adminId?: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  userId: string;
}): Promise<InvestmentWithFlows[]> {
  return prisma.investment.findMany({
    where: {
      ...(where.clientId ? { clientId: where.clientId } : where.role === 'USER' ? { clientId: where.userId } : {}),
      ...(where.institutionId ? { institutionId: where.institutionId } : {}),
      ...(where.status ? { status: where.status } : {}),
      ...(where.search
        ? {
            OR: [
              { name: { contains: where.search, mode: 'insensitive' as const } },
              { institution: { name: { contains: where.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...(where.role === 'ADMIN'
        ? { client: { assignmentsAsClient: { some: { adminId: where.userId, status: 'ACTIVE' as const } } } }
        : {}),
    },
    include: { institution: true, transactions: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function projectionByInvestment(investments: InvestmentWithFlows[], asOf = new Date()) {
  const map = new Map<string, InvestmentProjection>();
  for (const investment of investments) {
    map.set(investment.id, projectionView(investment, asOf));
  }
  return map;
}
