// ============================================================
// TSG Salary & Cost Calculator - Romania Calculation Engine
// Currency: RON | Income tax: 10% flat
// Source: Art. 77 Cod Fiscal, OUG 89/2025, calculator-salarii.ro
// ============================================================

import {
  RO_CONFIG,
  ROAdvancedOptions,
  ContributionDetail,
  EmployeeResult,
} from '../config/countries';
import { round2 } from '../utils/math';

interface ROCalcOptions {
  grossYearly: number;
  occupationRate: number;
  advanced: ROAdvancedOptions;
}

// ============================================================
// Personal Deduction Calculator (Art. 77 Cod Fiscal)
// ============================================================
// The personal deduction is a percentage of the minimum wage.
// The percentage depends on:
//   1. How much the gross monthly salary exceeds the minimum wage
//   2. The number of dependents
// For every 50 RON above minimum wage, the base percentage decreases by 0.5%.
// Maximum eligibility: minimum wage + 2,000 RON (i.e. 6,050 RON for 2026 H1).
// Above that threshold, no personal deduction is granted.
//
// Base rates at minimum-wage level (0 RON above min):
//   0 dependents → 20%, 1 → 25%, 2 → 30%, 3 → 35%, 4+ → 45%
// ============================================================
function getPersonalDeductionMonthly(
  grossMonthly: number,
  dependents: number,
  hasBaseFunction: boolean
): number {
  if (!hasBaseFunction) return 0;

  const cfg = RO_CONFIG;
  const minWage = cfg.minimumWage;
  const maxAbove = cfg.personalDeductionMaxAboveMin; // 2,000

  // If gross exceeds minimum + 2,000, no deduction
  if (grossMonthly > minWage + maxAbove) return 0;

  // Determine the base rate for the dependent count
  const depKey = Math.min(dependents, 4); // 4+ all use the same rate
  const baseRate = cfg.personalDeductionBaseRates[depKey] ?? 0;

  // How much above minimum wage?
  const aboveMin = Math.max(0, grossMonthly - minWage);

  // Number of 50 RON steps above minimum (rounded up to next band)
  // Band boundaries: 0, 1-50, 51-100, 101-150, ...
  // At exactly minWage (aboveMin = 0) → 0 steps → full base rate
  const steps = aboveMin > 0 ? Math.ceil(aboveMin / cfg.personalDeductionStep) : 0;

  // Decrease the rate by 0.5% per step
  const adjustedRate = baseRate - (steps * cfg.personalDeductionRateDecrement);

  // Rate cannot go below 0
  if (adjustedRate <= 0) return 0;

  // Deduction = adjustedRate × minimumWage (NOT gross salary)
  const deduction = adjustedRate * minWage;

  return Math.round(deduction); // Romanian payroll rounds to whole RON
}

// ============================================================
// Minimum Wage Tax-Free Amount (Suma Neimpozabilă)
// OUG 89/2025: For employees earning minimum wage with gross ≤ threshold,
// a portion of the salary is exempt from CAS, CASS, and income tax.
// Jan-Jun 2026: 300 RON if gross ≤ 4,300 and base salary = 4,050
// ============================================================
function getTaxFreeAmount(grossMonthly: number): number {
  const cfg = RO_CONFIG;

  // Tax-free amount applies only when gross is at or below threshold
  // and salary is at minimum wage level
  if (grossMonthly <= cfg.taxFreeGrossThreshold && grossMonthly <= cfg.minimumWage) {
    return cfg.taxFreeAmount; // 300 RON
  }

  return 0;
}

// ============================================================
// Core Computation
// ============================================================
function computeRO(opts: ROCalcOptions): {
  employeeContribs: ContributionDetail[];
  employerContribs: ContributionDetail[];
  totalEmployeeContribs: number;
  totalEmployerContribs: number;
  taxableBase: number;
  incomeTax: number;
  netYearly: number;
  totalCostYearly: number;
  personalDeductionMonthly: number;
  taxFreeAmountMonthly: number;
} {
  const { grossYearly, occupationRate, advanced } = opts;
  const cfg = RO_CONFIG;
  const grossMonthly = grossYearly / 12;

  const employeeContribs: ContributionDetail[] = [];
  const employerContribs: ContributionDetail[] = [];

  // --- Tax-free amount (minimum wage special rule) ---
  const taxFreeMonthly = getTaxFreeAmount(grossMonthly);
  const taxFreeYearly = taxFreeMonthly * 12;

  // The contribution base is reduced by the tax-free amount
  const contributionBaseYearly = grossYearly - taxFreeYearly;

  // --- CAS (Social Security) - employee ---
  const casAmount = round2(contributionBaseYearly * cfg.CAS.employee);
  employeeContribs.push({
    name: 'CAS (Social Security)',
    rate: cfg.CAS.employee,
    base: contributionBaseYearly,
    amount: casAmount,
  });

  // --- CASS (Health Insurance) - employee ---
  const cassAmount = round2(contributionBaseYearly * cfg.CASS.employee);
  employeeContribs.push({
    name: 'CASS (Health Insurance)',
    rate: cfg.CASS.employee,
    base: contributionBaseYearly,
    amount: cassAmount,
  });

  // --- CAM (Work Insurance) - employer ---
  // CAM is also calculated on the contribution base (after tax-free deduction)
  const camAmount = round2(contributionBaseYearly * cfg.CAM.employer);
  employerContribs.push({
    name: 'CAM (Work Insurance)',
    rate: cfg.CAM.employer,
    base: contributionBaseYearly,
    amount: camAmount,
  });

  // --- Personal Deduction (Deducere Personală) ---
  const dependents = advanced.dependents ?? 0;
  const useBaseFunction = advanced.baseFunctionToggle !== false; // default true
  const personalDeductionMonthly = getPersonalDeductionMonthly(
    grossMonthly,
    dependents,
    useBaseFunction
  );
  const personalDeductionYearly = personalDeductionMonthly * 12;

  // --- Income Tax ---
  const totalEmployeeContribsBeforeTax = casAmount + cassAmount;

  // Taxable base = contribution base - employee contributions - personal deduction
  let taxableBase = round2(contributionBaseYearly - totalEmployeeContribsBeforeTax - personalDeductionYearly);
  taxableBase = Math.max(taxableBase, 0);

  let incomeTax: number;
  if (advanced.disabledTaxExemption) {
    incomeTax = 0;
  } else {
    incomeTax = round2(taxableBase * cfg.incomeTaxRate);
  }

  // --- Totals ---
  const totalEmployeeContribs = round2(totalEmployeeContribsBeforeTax + incomeTax);
  const totalEmployerContribs = round2(camAmount);

  const netYearly = round2(grossYearly - totalEmployeeContribs);
  const totalCostYearly = round2(grossYearly + totalEmployerContribs);

  // Add meal benefits to net if applicable
  const mealBenefitsYearly = (advanced.monthlyMealBenefits ?? 0) * 12;

  return {
    employeeContribs,
    employerContribs,
    totalEmployeeContribs,
    totalEmployerContribs,
    taxableBase,
    incomeTax,
    netYearly: round2(netYearly + mealBenefitsYearly),
    totalCostYearly: round2(totalCostYearly + mealBenefitsYearly),
    personalDeductionMonthly,
    taxFreeAmountMonthly: taxFreeMonthly,
  };
}

/** Forward: Gross → Net & Total Cost */
export function calculateROFromGross(
  grossYearly: number,
  occupationRate: number,
  advanced: ROAdvancedOptions = {}
): EmployeeResult {
  const result = computeRO({ grossYearly, occupationRate, advanced });
  const workingDays = RO_CONFIG.workingDaysPerYear * (occupationRate / 100);

  return {
    grossSalaryMonthly: round2(grossYearly / 12),
    grossSalaryYearly: round2(grossYearly),
    netSalaryMonthly: round2(result.netYearly / 12),
    netSalaryYearly: round2(result.netYearly),
    totalEmployerCostMonthly: round2(result.totalCostYearly / 12),
    totalEmployerCostYearly: round2(result.totalCostYearly),
    employeeContributions: result.employeeContribs,
    employerContributions: result.employerContribs,
    totalEmployeeContributions: result.totalEmployeeContribs,
    totalEmployerContributions: result.totalEmployerContribs,
    taxableBase: result.taxableBase,
    incomeTax: result.incomeTax,
    incomeTaxMonthly: round2(result.incomeTax / 12),
    dailyRate: workingDays > 0 ? round2(result.totalCostYearly / workingDays) : 0,
    currency: 'RON',
    country: 'RO',
    occupationRate,
  };
}

/** Reverse: Net → Gross using Newton-Raphson */
export function calculateROFromNet(
  targetNetYearly: number,
  occupationRate: number,
  advanced: ROAdvancedOptions = {}
): EmployeeResult {
  let gross = targetNetYearly * 1.5;
  const maxIter = 50;
  const tolerance = 0.01;

  for (let i = 0; i < maxIter; i++) {
    const result = computeRO({ grossYearly: gross, occupationRate, advanced });
    const diff = result.netYearly - targetNetYearly;

    if (Math.abs(diff) <= tolerance) {
      return calculateROFromGross(round2(gross), occupationRate, advanced);
    }

    const h = 1;
    const resultH = computeRO({ grossYearly: gross + h, occupationRate, advanced });
    const derivative = (resultH.netYearly - result.netYearly) / h;

    if (Math.abs(derivative) < 1e-10) break;
    gross = gross - diff / derivative;
    if (gross < 0) gross = targetNetYearly;
  }

  throw new Error('Reverse calculation (Net→Gross) did not converge. Please adjust inputs.');
}

/** Reverse: Total Cost → Gross using binary search */
export function calculateROFromTotalCost(
  targetTotalCostYearly: number,
  occupationRate: number,
  advanced: ROAdvancedOptions = {}
): EmployeeResult {
  let lo = 0;
  let hi = targetTotalCostYearly;
  const maxIter = 50;
  const tolerance = 0.01;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const result = computeRO({ grossYearly: mid, occupationRate, advanced });
    const diff = result.totalCostYearly - targetTotalCostYearly;

    if (Math.abs(diff) <= tolerance) {
      return calculateROFromGross(round2(mid), occupationRate, advanced);
    }

    if (diff < 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  throw new Error('Reverse calculation (TotalCost→Gross) did not converge. Please adjust inputs.');
}
