import { describe, expect, it } from 'vitest';
import {
  compoundBalance,
  dec,
  projectInvestment,
  serializeProjection,
  simpleInterest,
  summarizePortfolio,
} from '../src/services/finance';

const start = new Date('2025-01-01T00:00:00.000Z');
const oneYearLater = new Date('2026-01-01T00:00:00.000Z');

describe('financial calculations', () => {
  it('calculates simple interest for one year', () => {
    expect(simpleInterest(100000, 5, 1).toNumber()).toBe(5000);
  });

  it('calculates compound interest with monthly compounding', () => {
    // 100,000 * (1 + 0.06/12)^12 = 106,167.78
    expect(compoundBalance(100000, 6, 1, 'MONTHLY').toNumber()).toBe(106167.78);
  });

  it('projects a simple-interest investment to maturity', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 5,
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
        status: 'ACTIVE',
      },
      start,
    );
    expect(projection.currentPrincipal.toNumber()).toBe(100000);
    expect(projection.projectedMaturityBalance.toNumber()).toBe(105000);
    expect(projection.projectedReturn.toNumber()).toBe(5000);
    expect(projection.termYears.toNumber()).toBeCloseTo(1, 6);
  });

  it('includes completed principal deposits and withdrawals in current principal', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 0,
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
        status: 'ACTIVE',
        flows: [
          { amount: 25000, date: new Date('2025-03-01T00:00:00.000Z'), type: 'DEPOSIT', status: 'COMPLETED', affectsPrincipal: true },
          { amount: 10000, date: new Date('2025-06-01T00:00:00.000Z'), type: 'WITHDRAWAL', status: 'COMPLETED', affectsPrincipal: true },
        ],
      },
      new Date('2025-09-01T00:00:00.000Z'),
    );
    expect(projection.currentPrincipal.toNumber()).toBe(115000);
    expect(projection.projectedMaturityBalance.toNumber()).toBe(115000);
  });

  it('ignores pending and failed transactions', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 0,
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
        flows: [
          { amount: 50000, date: start, type: 'DEPOSIT', status: 'PENDING', affectsPrincipal: true },
          { amount: 30000, date: start, type: 'DEPOSIT', status: 'FAILED', affectsPrincipal: true },
        ],
      },
      start,
    );
    expect(projection.currentPrincipal.toNumber()).toBe(100000);
  });

  it('never treats interest transactions as principal', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 0,
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
        flows: [
          { amount: 5000, date: start, type: 'INTEREST', status: 'COMPLETED', affectsPrincipal: false },
        ],
      },
      start,
    );
    expect(projection.currentPrincipal.toNumber()).toBe(100000);
  });

  it('handles maturity on or before the start date without negative returns', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 5,
        compoundingFrequency: 'SIMPLE',
        startDate: oneYearLater,
        maturityDate: oneYearLater,
      },
      start,
    );
    expect(projection.projectedReturn.toNumber()).toBe(0);
    expect(projection.projectedMaturityBalance.toNumber()).toBe(100000);
  });

  it('handles a missing/zero rate', () => {
    const projection = projectInvestment(
      {
        principalAmount: 100000,
        annualInterestRate: 0,
        compoundingFrequency: 'MONTHLY',
        startDate: start,
        maturityDate: oneYearLater,
      },
      start,
    );
    expect(projection.projectedReturn.toNumber()).toBe(0);
  });

  it('clamps over-withdrawn principal at zero', () => {
    const projection = projectInvestment(
      {
        principalAmount: 10000,
        annualInterestRate: 0,
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
        flows: [
          { amount: 12000, date: start, type: 'WITHDRAWAL', status: 'COMPLETED', affectsPrincipal: true },
        ],
      },
      start,
    );
    expect(projection.currentPrincipal.toNumber()).toBe(0);
  });

  it('calculates a principal-weighted average rate and allocation', () => {
    const summary = summarizePortfolio([
      {
        institutionId: 'a',
        institutionName: 'Aurum',
        status: 'ACTIVE',
        projection: projectInvestment(
          {
            principalAmount: 100000,
            annualInterestRate: 4,
            compoundingFrequency: 'SIMPLE',
            startDate: start,
            maturityDate: oneYearLater,
          },
          start,
        ),
      },
      {
        institutionId: 'b',
        institutionName: 'Meridian',
        status: 'ACTIVE',
        projection: projectInvestment(
          {
            principalAmount: 300000,
            annualInterestRate: 6,
            compoundingFrequency: 'SIMPLE',
            startDate: start,
            maturityDate: oneYearLater,
          },
          start,
        ),
      },
      {
        institutionId: 'b',
        institutionName: 'Meridian',
        status: 'MATURED',
        projection: projectInvestment(
          {
            principalAmount: 500000,
            annualInterestRate: 10,
            compoundingFrequency: 'SIMPLE',
            startDate: start,
            maturityDate: oneYearLater,
          },
          start,
        ),
      },
    ]);

    expect(summary.totalInvested).toBe(400000);
    expect(summary.averageInterestRate).toBe(5.5);
    expect(summary.activeInvestments).toBe(2);
    expect(summary.allocation).toHaveLength(2);
    expect(summary.allocation[0]!.institutionName).toBe('Meridian');
    expect(summary.allocation[0]!.percentage).toBe(75);
    expect(summary.allocation[1]!.percentage).toBe(25);
  });

  it('returns an empty allocation when no active investments exist', () => {
    const summary = summarizePortfolio([]);
    expect(summary.totalInvested).toBe(0);
    expect(summary.averageInterestRate).toBe(0);
    expect(summary.allocation).toEqual([]);
  });

  it('serializes projection decimals as stable numbers', () => {
    const projection = projectInvestment(
      {
        principalAmount: '1234.56',
        annualInterestRate: '3.3333',
        compoundingFrequency: 'SIMPLE',
        startDate: start,
        maturityDate: oneYearLater,
      },
      start,
    );
    const serialized = serializeProjection(projection, start);
    expect(typeof serialized.currentPrincipal).toBe('number');
    expect(serialized.currentPrincipal).toBe(1234.56);
    expect(typeof serialized.projectedReturn).toBe('number');
  });

  it('uses exact decimal arithmetic for cent-level values', () => {
    expect(dec('0.1').plus(dec('0.2')).toFixed(2)).toBe('0.30');
  });
});
