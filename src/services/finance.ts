import Decimal from 'decimal.js';
import type {
  CompoundingFrequency,
  InvestmentStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const MONEY_DP = 2;
export const RATE_DP = 4;
export const DAYS_PER_YEAR = 365;
export const MS_PER_DAY = 86_400_000;

export type Numeric = Decimal.Value;

const PERIODS_PER_YEAR: Record<Exclude<CompoundingFrequency, 'SIMPLE'>, number> = {
  ANNUALLY: 1,
  SEMIANNUALLY: 2,
  QUARTERLY: 4,
  MONTHLY: 12,
};

export function dec(value: Numeric): Decimal {
  return new Decimal(value?.toString() ?? 0);
}

export function roundMoney(value: Numeric): Decimal {
  return dec(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

export function roundRate(value: Numeric): Decimal {
  return dec(value).toDecimalPlaces(RATE_DP, Decimal.ROUND_HALF_UP);
}

export function moneyNumber(value: Numeric): number {
  return Number(roundMoney(value).toFixed(MONEY_DP));
}

export function rateNumber(value: Numeric): number {
  return Number(roundRate(value).toFixed(RATE_DP));
}

/** Actual/365 Fixed day-count convention. Returns 0 for non-positive spans. */
export function yearsBetween(from: Date, to: Date): Decimal {
  const days = (to.getTime() - from.getTime()) / MS_PER_DAY;
  if (!Number.isFinite(days) || days <= 0) return new Decimal(0);
  return new Decimal(days).div(DAYS_PER_YEAR);
}

/**
 * Growth factor for a principal amount held from `from` to `to`.
 * Rates are expressed as percentages (5.25 = 5.25% p.a.).
 */
export function growthFactor(
  annualRatePercent: Numeric,
  from: Date,
  to: Date,
  frequency: CompoundingFrequency = 'SIMPLE',
): Decimal {
  const years = yearsBetween(from, to);
  const rate = dec(annualRatePercent).div(100);
  if (years.lte(0) || rate.lte(0)) return new Decimal(1);

  if (frequency === 'SIMPLE') {
    return new Decimal(1).plus(rate.times(years));
  }

  const periods = PERIODS_PER_YEAR[frequency] ?? 1;
  return new Decimal(1).plus(rate.div(periods)).pow(new Decimal(periods).times(years));
}

export interface PrincipalFlow {
  amount: Numeric;
  date: Date;
  type: TransactionType;
  status: TransactionStatus;
  affectsPrincipal: boolean;
}

export interface ProjectionInput {
  principalAmount: Numeric;
  annualInterestRate: Numeric;
  compoundingFrequency: CompoundingFrequency;
  startDate: Date;
  maturityDate: Date;
  status?: InvestmentStatus;
  flows?: PrincipalFlow[];
}

export interface InvestmentProjection {
  currentPrincipal: number;
  projectedMaturityBalance: number;
  projectedReturn: number;
  annualInterestRate: number;
  termYears: number;
  remainingTermYears: number;
  isMatured: boolean;
  methodology: string;
  asOf: string;
}

export interface ProjectionBreakdown {
  currentPrincipal: Decimal;
  projectedMaturityBalance: Decimal;
  projectedReturn: Decimal;
  annualRate: Decimal;
  termYears: Decimal;
  remainingTermYears: Decimal;
  isMatured: boolean;
  methodology: string;
}

/**
 * Projects an investment using an explicit cash-flow model:
 *  - Base principal accrues from the start date to maturity.
 *  - Each COMPLETED principal-affecting deposit/withdrawal accrues from its
 *    transaction date (or start date if earlier) to maturity.
 *  - Pending/failed transactions and interest transactions never change principal.
 *  - Simple interest is applied per flow; compound interest uses the contract's
 *    compounding frequency with fractional periods (Actual/365).
 *
 * This is a projection, not a guarantee. The methodology is returned with the
 * result so the UI can disclose its assumptions.
 */
export function projectInvestment(input: ProjectionInput, asOf = new Date()): ProjectionBreakdown {
  const start = input.startDate;
  const maturity = input.maturityDate;
  const principal = dec(input.principalAmount);
  const rate = dec(input.annualInterestRate);
  const status = input.status ?? 'ACTIVE';
  const isMatured = maturity.getTime() <= asOf.getTime() || status === 'MATURED';

  const completedFlows = (input.flows ?? []).filter(
    (flow) => flow.status === 'COMPLETED' && flow.affectsPrincipal && flow.type !== 'INTEREST',
  );

  let currentPrincipal = principal;
  for (const flow of completedFlows) {
    if (flow.date.getTime() > asOf.getTime()) continue;
    const signed = flow.type === 'WITHDRAWAL' ? dec(flow.amount).neg() : dec(flow.amount);
    currentPrincipal = currentPrincipal.plus(signed);
  }
  if (currentPrincipal.lt(0)) currentPrincipal = new Decimal(0);

  const baseFactor = growthFactor(rate, start, maturity, input.compoundingFrequency);
  let maturityBalance = principal.times(baseFactor);

  for (const flow of completedFlows) {
    // Only include flows that have occurred as of the projection date.
    if (flow.date.getTime() > asOf.getTime()) continue;
    const accrualStart = flow.date.getTime() < start.getTime() ? start : flow.date;
    const factor = growthFactor(rate, accrualStart, maturity, input.compoundingFrequency);
    const signed = flow.type === 'WITHDRAWAL' ? dec(flow.amount).neg() : dec(flow.amount);
    maturityBalance = maturityBalance.plus(signed.times(factor));
  }

  if (maturityBalance.lt(0)) maturityBalance = new Decimal(0);
  const projectedReturn = maturityBalance.minus(currentPrincipal);

  const termYears = yearsBetween(start, maturity);
  const remainingTermYears = yearsBetween(asOf, maturity);

  const methodology =
    input.compoundingFrequency === 'SIMPLE'
      ? 'Simple interest (Actual/365) applied to each principal cash flow from its effective date to maturity.'
      : `Compound interest (${input.compoundingFrequency.toLowerCase()}, ${PERIODS_PER_YEAR[input.compoundingFrequency]} periods/year, Actual/365) applied to each principal cash flow from its effective date to maturity.`;

  return {
    currentPrincipal,
    projectedMaturityBalance: roundMoney(maturityBalance),
    projectedReturn: roundMoney(projectedReturn),
    annualRate: rate,
    termYears,
    remainingTermYears,
    isMatured,
    methodology,
  };
}

export function serializeProjection(projection: ProjectionBreakdown, asOf = new Date()): InvestmentProjection {
  return {
    currentPrincipal: moneyNumber(projection.currentPrincipal),
    projectedMaturityBalance: moneyNumber(projection.projectedMaturityBalance),
    projectedReturn: moneyNumber(projection.projectedReturn),
    annualInterestRate: rateNumber(projection.annualRate),
    termYears: Number(projection.termYears.toFixed(4)),
    remainingTermYears: Number(projection.remainingTermYears.toFixed(4)),
    isMatured: projection.isMatured,
    methodology: projection.methodology,
    asOf: asOf.toISOString(),
  };
}

export interface PortfolioSummary {
  totalInvested: number;
  projectedMaturityBalance: number;
  projectedReturn: number;
  averageInterestRate: number;
  activeInvestments: number;
  allocation: Array<{ institutionId: string; institutionName: string; amount: number; percentage: number }>;
}

export interface PortfolioItem {
  institutionId: string;
  institutionName: string;
  projection: ProjectionBreakdown;
  status: InvestmentStatus;
}

/**
 * Portfolio metrics are calculated from ACTIVE investments only.
 * The weighted average rate uses current principal as the weight.
 */
export function summarizePortfolio(items: PortfolioItem[]): PortfolioSummary {
  const active = items.filter((item) => item.status === 'ACTIVE');
  let invested = new Decimal(0);
  let maturity = new Decimal(0);
  let returns = new Decimal(0);
  let weightedRate = new Decimal(0);
  const byInstitution = new Map<string, { name: string; amount: Decimal }>();

  for (const item of active) {
    const principal = item.projection.currentPrincipal;
    invested = invested.plus(principal);
    maturity = maturity.plus(item.projection.projectedMaturityBalance);
    returns = returns.plus(item.projection.projectedReturn);
    weightedRate = weightedRate.plus(principal.times(item.projection.annualRate));

    const existing = byInstitution.get(item.institutionId);
    if (existing) {
      existing.amount = existing.amount.plus(principal);
    } else {
      byInstitution.set(item.institutionId, { name: item.institutionName, amount: principal });
    }
  }

  const allocation = invested.gt(0)
    ? [...byInstitution.entries()]
        .map(([institutionId, entry]) => ({
          institutionId,
          institutionName: entry.name,
          amount: moneyNumber(entry.amount),
          percentage: Number(entry.amount.div(invested).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)),
        }))
        .sort((a, b) => b.amount - a.amount)
    : [];

  return {
    totalInvested: moneyNumber(invested),
    projectedMaturityBalance: moneyNumber(maturity),
    projectedReturn: moneyNumber(returns),
    averageInterestRate: invested.gt(0) ? rateNumber(weightedRate.div(invested)) : 0,
    activeInvestments: active.length,
    allocation,
  };
}

/** Simple interest helper kept for tests/documentation. */
export function simpleInterest(principal: Numeric, annualRatePercent: Numeric, years: Numeric): Decimal {
  return roundMoney(dec(principal).times(dec(annualRatePercent).div(100)).times(dec(years)));
}

/** Compound balance helper kept for tests/documentation. */
export function compoundBalance(
  principal: Numeric,
  annualRatePercent: Numeric,
  years: Numeric,
  frequency: Exclude<CompoundingFrequency, 'SIMPLE'>,
): Decimal {
  const n = PERIODS_PER_YEAR[frequency];
  const rate = dec(annualRatePercent).div(100);
  return roundMoney(dec(principal).times(new Decimal(1).plus(rate.div(n)).pow(new Decimal(n).times(dec(years)))));
}
