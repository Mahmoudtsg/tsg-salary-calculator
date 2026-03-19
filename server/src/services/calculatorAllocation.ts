// ============================================================
// TSG Salary & Cost Calculator - Allocation Mode
// Multi-Client Profitability Modeling
// ============================================================

import { round2 } from '../utils/math';
import { calculateCHFromGross } from './calculatorCH';
import type { ContributionDetail } from '../config/countries';

export interface AllocationClient {
  clientName: string;
  allocationPercent: number;
  dailyRate: number;
}

export interface AllocationInput {
  salary100: number;
  engagementPercent: number;
  employerMultiplier: number;
  workingDaysPerYear: number;
  currency: string;
  clients: AllocationClient[];
  /** Minimum daily margin floor in CHF (default 120). Flags clients whose profitPerDay is below this. */
  minDailyMargin?: number;
}

export interface ClientResult {
  clientName: string;
  allocationPercent: number;
  dailyRate: number;
  revenuePerDay: number;
  profitPerDay: number;
  isBaseline: boolean;
  annualProfit: number;
  /** Whether this client's profitPerDay is below the minimum daily margin floor */
  belowMinMargin?: boolean;
  minMarginFloorValue?: number;
}

export interface AllocationResult {
  engagedSalary: number;
  employerCost: number;
  baseDailyCost: number;
  clients: ClientResult[];
  totalDailyProfit: number;
  annualProfit: number;
  totalAllocationPercent: number;
  engagementPercent: number;
  currency: string;
  workingDaysPerYear: number;
}

// ============================================================
// NEW: Swiss Social-Charge-based Allocation
// ============================================================

export interface AllocationClientCH {
  clientName: string;
  allocationPercent: number;
  dailyRate: number;
  isBilled: boolean;
}

export interface AllocationInputCH {
  grossAnnualSalary: number;
  workingDaysPerYear: number;
  currency: string;
  clients: AllocationClientCH[];
  employeeAge?: number;
  lfpRate?: number;
  laaNonProfessionalRate?: number;
}

export interface ClientResultCH {
  clientName: string;
  allocationPercent: number;
  dailyRate: number;
  isBilled: boolean;
  days: number;
  annualRevenue: number;
}

export interface AllocationResultCH {
  grossAnnualSalary: number;
  totalEmployerCost: number;
  dailyEmployerCost: number;
  employerContributions: ContributionDetail[];
  totalEmployerContributions: number;
  clients: ClientResultCH[];
  totalRevenue: number;
  totalProfit: number;
  marginPercent: number;
  workingDaysPerYear: number;
  currency: string;
}

export function calculateAllocationCH(input: AllocationInputCH): AllocationResultCH {
  const { grossAnnualSalary, workingDaysPerYear, currency, clients, employeeAge, lfpRate, laaNonProfessionalRate } = input;

  const totalAlloc = clients.reduce((s, c) => s + c.allocationPercent, 0);
  if (Math.abs(totalAlloc - 100) > 0.5) {
    throw new Error(`Client allocations must sum to 100% (currently ${totalAlloc.toFixed(1)}%).`);
  }

  const chResult = calculateCHFromGross(grossAnnualSalary, 100, {
    employeeAge,
    lfpRate: lfpRate !== undefined ? lfpRate : undefined,
    laaNonProfessionalRate: laaNonProfessionalRate !== undefined ? laaNonProfessionalRate : undefined,
  });

  const totalEmployerCost = chResult.totalEmployerCostYearly;
  const totalEmployerContributions = chResult.totalEmployerContributions;
  const employerContributions = chResult.employerContributions;
  const dailyEmployerCost = round2(totalEmployerCost / workingDaysPerYear);

  const clientResults: ClientResultCH[] = clients.map(c => {
    const days = round2(workingDaysPerYear * c.allocationPercent / 100);
    const annualRevenue = c.isBilled ? round2(days * c.dailyRate) : 0;
    return { clientName: c.clientName, allocationPercent: c.allocationPercent, dailyRate: c.dailyRate, isBilled: c.isBilled, days, annualRevenue };
  });

  const totalRevenue = round2(clientResults.reduce((s, c) => s + c.annualRevenue, 0));
  const totalProfit = round2(totalRevenue - totalEmployerCost);
  const marginPercent = totalRevenue > 0 ? round2(totalProfit / totalRevenue * 100) : 0;

  return {
    grossAnnualSalary, totalEmployerCost, dailyEmployerCost, employerContributions,
    totalEmployerContributions, clients: clientResults, totalRevenue, totalProfit,
    marginPercent, workingDaysPerYear, currency,
  };
}

// ============================================================
// ORIGINAL: Multiplier-based Allocation (kept for compat)
// ============================================================

export function calculateAllocation(input: AllocationInput): AllocationResult {
  const {
    salary100,
    engagementPercent,
    employerMultiplier,
    workingDaysPerYear,
    currency,
    clients,
  } = input;

  // Validate total allocation <= engagement
  const totalAllocation = clients.reduce((sum, c) => sum + c.allocationPercent, 0);
  if (totalAllocation > engagementPercent) {
    throw new Error(
      `Total allocation (${totalAllocation}%) exceeds engagement (${engagementPercent}%). ` +
      `Please reduce client allocations.`
    );
  }

  // Step 1: Engaged Salary
  const engagedSalary = round2(salary100 * (engagementPercent / 100));

  // Step 2: Employer Cost
  const employerCost = round2(engagedSalary * employerMultiplier);

  // Step 3: Base Daily Cost
  const baseDailyCost = round2(employerCost / workingDaysPerYear);

  // Step 4: Client Revenue Per Day
  const clientRevenues = clients.map((c) => ({
    ...c,
    revenuePerDay: round2(c.dailyRate * (c.allocationPercent / 100)),
  }));

  // Step 5: Find baseline client (highest revenue per day)
  let baselineIdx = 0;
  let maxRevenue = 0;
  clientRevenues.forEach((c, idx) => {
    if (c.revenuePerDay > maxRevenue) {
      maxRevenue = c.revenuePerDay;
      baselineIdx = idx;
    }
  });

  const floor = input.minDailyMargin ?? 120; // default 120 CHF

  // Step 6 & 7: Calculate profits
  const clientResults: ClientResult[] = clientRevenues.map((c, idx) => {
    const isBaseline = idx === baselineIdx;
    const profitPerDay = isBaseline
      ? round2(c.revenuePerDay - baseDailyCost)
      : round2(c.revenuePerDay); // incremental - cost already covered

    const belowMinMargin = profitPerDay < floor;

    return {
      clientName: c.clientName,
      allocationPercent: c.allocationPercent,
      dailyRate: c.dailyRate,
      revenuePerDay: c.revenuePerDay,
      profitPerDay,
      isBaseline,
      annualProfit: round2(profitPerDay * workingDaysPerYear),
      belowMinMargin,
      minMarginFloorValue: floor,
    };
  });

  const totalDailyProfit = round2(
    clientResults.reduce((sum, c) => sum + c.profitPerDay, 0)
  );
  const annualProfit = round2(totalDailyProfit * workingDaysPerYear);

  return {
    engagedSalary,
    employerCost,
    baseDailyCost,
    clients: clientResults,
    totalDailyProfit,
    annualProfit,
    totalAllocationPercent: totalAllocation,
    engagementPercent,
    currency,
    workingDaysPerYear,
  };
}
