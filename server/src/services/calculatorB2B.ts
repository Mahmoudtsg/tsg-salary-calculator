// ============================================================
// TSG Salary & Cost Calculator - B2B Mode (Independent Contractor)
// Pure cost vs revenue modeling - no payroll taxes
// ============================================================

import { round2 } from '../utils/math';

export type PricingMode = 'TARGET_MARGIN' | 'CLIENT_RATE' | 'CLIENT_BUDGET';
export type RateType = 'DAILY' | 'HOURLY';

export interface B2BInput {
  costRate: number;
  rateType: RateType;
  costCurrency: string;
  pricingMode: PricingMode;

  // TARGET_MARGIN fields
  targetMarginPercent?: number;
  /** Minimum daily margin floor in the working currency (default 120 CHF equivalent).
   *  If the calculated margin is below this floor, the client rate is bumped to cost + floor. */
  minDailyMargin?: number;
  /** Currency in which minDailyMargin is expressed (default CHF). If the costCurrency differs,
   *  the floor is converted using the FX rates provided. */
  minDailyMarginCurrency?: string;

  // CLIENT_RATE fields
  clientRate?: number;

  // CLIENT_BUDGET fields
  /** The daily rate the client pays (budget per day) */
  clientDailyRate?: number;
  /** Margin on sales as % (e.g. 30 = 30%), default 30. Used in CLIENT_BUDGET mode. */
  budgetMarginPercent?: number;
  /** Social charges multiplier applied on top of employer cost to derive max daily rate.
   *  Default 1.2 (i.e. 20% social charges on top). */
  socialMultiplier?: number;

  /** @deprecated - replaced by clientDailyRate; kept for backwards compat */
  clientBudget?: number;
  budgetDays?: number;

  hoursPerDay?: number;
  workingDaysPerYear?: number;

  /** FX rates (base RON) passed from the route for floor conversion */
  fxRates?: Record<string, number>;
}

export interface B2BResult {
  costRate: number;
  costRateDaily: number;
  clientRate: number;
  clientRateDaily: number;
  marginAmount: number;
  marginPercent: number;
  markupPercent: number;
  dailyProfit: number;
  annualProfit: number;
  annualRevenue: number;
  annualCost: number;
  currency: string;
  pricingMode: PricingMode;

  // --- TARGET_MARGIN: minimum margin floor ---
  /** Whether the minimum daily margin floor was applied */
  minMarginFloorApplied?: boolean;
  /** The floor value in the working currency */
  minMarginFloorValue?: number;
  /** The originally computed client rate before the floor was applied */
  originalClientRateDaily?: number;
  /** The originally computed margin before the floor was applied */
  originalMarginAmount?: number;
  /** Human-readable explanation when the floor is applied */
  minMarginFloorExplanation?: string;

  // --- CLIENT_BUDGET: breakdown ---
  budgetBreakdown?: {
    clientBudgetDaily: number;
    budgetMarginPercent: number;
    marginAmount: number;
    employerCost: number;
    socialMultiplier: number;
    maxDailyRate: number;
  };
}

/**
 * Convert the minimum daily margin floor from its source currency to the working currency.
 */
function convertFloor(
  floorAmount: number,
  floorCurrency: string,
  targetCurrency: string,
  fxRates?: Record<string, number>,
): number {
  if (floorCurrency === targetCurrency) return floorAmount;
  if (!fxRates) return floorAmount; // No rates available, use as-is

  const fromRate = fxRates[floorCurrency];
  const toRate = fxRates[targetCurrency];
  if (!fromRate || !toRate) return floorAmount;

  // Convert via RON base: floor → RON → target
  const inRON = floorAmount / fromRate;
  return round2(inRON * toRate);
}

export function calculateB2B(input: B2BInput): B2BResult {
  const hoursPerDay = input.hoursPerDay ?? 8;
  const workingDays = input.workingDaysPerYear ?? 220;

  // Normalize to daily rate
  const costRateDaily = input.rateType === 'HOURLY'
    ? round2(input.costRate * hoursPerDay)
    : input.costRate;

  let clientRateDaily: number;
  let minMarginFloorApplied = false;
  let minMarginFloorValue: number | undefined;
  let originalClientRateDaily: number | undefined;
  let originalMarginAmount: number | undefined;
  let minMarginFloorExplanation: string | undefined;
  let budgetBreakdown: B2BResult['budgetBreakdown'] | undefined;

  switch (input.pricingMode) {
    case 'TARGET_MARGIN': {
      const marginPct = (input.targetMarginPercent ?? 0) / 100;
      if (marginPct >= 1) throw new Error('Margin percent must be less than 100%');

      // Standard formula: clientRate = costRate / (1 - marginPct)
      const calculatedClientRate = round2(costRateDaily / (1 - marginPct));
      const calculatedMargin = round2(calculatedClientRate - costRateDaily);

      // --- Minimum daily margin floor ---
      const floorCurrency = input.minDailyMarginCurrency ?? 'CHF';
      const rawFloor = input.minDailyMargin ?? 120; // default 120 CHF
      const floorInWorkingCurrency = convertFloor(rawFloor, floorCurrency, input.costCurrency, input.fxRates);
      minMarginFloorValue = round2(floorInWorkingCurrency);

      if (calculatedMargin < floorInWorkingCurrency) {
        // Floor kicks in: client rate = cost + floor
        minMarginFloorApplied = true;
        originalClientRateDaily = calculatedClientRate;
        originalMarginAmount = calculatedMargin;
        clientRateDaily = round2(costRateDaily + floorInWorkingCurrency);
        minMarginFloorExplanation =
          `Minimum daily margin of ${round2(floorInWorkingCurrency)} ${input.costCurrency} applied. ` +
          `The calculated margin (${round2(calculatedMargin)} ${input.costCurrency} at ${input.targetMarginPercent ?? 0}%) ` +
          `was below the floor. Client Daily Rate adjusted from ${round2(calculatedClientRate)} to ${round2(costRateDaily + floorInWorkingCurrency)} ${input.costCurrency}.`;
      } else {
        clientRateDaily = calculatedClientRate;
      }
      break;
    }

    case 'CLIENT_RATE': {
      clientRateDaily = input.rateType === 'HOURLY'
        ? round2((input.clientRate ?? 0) * hoursPerDay)
        : (input.clientRate ?? 0);
      break;
    }

    case 'CLIENT_BUDGET': {
      // New logic:
      //   Client Budget (daily) = what the client pays per day
      //   Margin = budget × marginPercent%  (with min floor applied)
      //   Employer Cost = budget - margin
      //   Max Daily Rate = Employer Cost / socialMultiplier
      const budget = input.clientDailyRate ?? input.clientBudget ?? 0;
      const budgetMargin = input.budgetMarginPercent ?? 30;
      const socialMult = input.socialMultiplier ?? 1.2;

      if (budget <= 0) throw new Error('Client Budget (Daily Rate) must be greater than 0.');
      if (budgetMargin < 0 || budgetMargin >= 100) throw new Error('Budget margin must be between 0% and 99%.');
      if (socialMult <= 0) throw new Error('Social multiplier must be greater than 0.');

      // Apply min margin floor
      const floorCurrencyBudget = input.minDailyMarginCurrency ?? 'CHF';
      const rawFloorBudget = input.minDailyMargin ?? 120;
      const floorInWorkingCurrencyBudget = convertFloor(rawFloorBudget, floorCurrencyBudget, input.costCurrency, input.fxRates);
      minMarginFloorValue = round2(floorInWorkingCurrencyBudget);

      const rawMarginAmt = round2(budget * (budgetMargin / 100));
      let marginAmt: number;

      if (rawMarginAmt < floorInWorkingCurrencyBudget) {
        minMarginFloorApplied = true;
        originalMarginAmount = rawMarginAmt;
        marginAmt = round2(floorInWorkingCurrencyBudget);
        minMarginFloorExplanation =
          `Minimum daily margin of ${round2(floorInWorkingCurrencyBudget)} ${input.costCurrency} applied. ` +
          `The calculated margin (${round2(rawMarginAmt)} ${input.costCurrency} = ${budgetMargin}% of ${budget} ${input.costCurrency}) ` +
          `was below the floor. Margin set to ${round2(floorInWorkingCurrencyBudget)} ${input.costCurrency}.`;
      } else {
        marginAmt = rawMarginAmt;
      }

      const employerCost = round2(budget - marginAmt);
      const maxDailyRate = round2(employerCost / socialMult);

      budgetBreakdown = {
        clientBudgetDaily: budget,
        budgetMarginPercent: budgetMargin,
        marginAmount: marginAmt,
        employerCost,
        socialMultiplier: socialMult,
        maxDailyRate,
      };

      // In CLIENT_BUDGET mode, the "client rate" is what the client pays (the budget),
      // and the "cost rate" is the max daily rate the contractor can be paid.
      // We override costRateDaily for margin computations below.
      clientRateDaily = budget;
      break;
    }

    default:
      throw new Error(`Unknown pricing mode: ${input.pricingMode}`);
  }

  // --- Compute margin metrics ---
  // For CLIENT_BUDGET mode, the "cost" for margin purposes is the max daily rate (what we pay the contractor)
  const effectiveCostDaily = input.pricingMode === 'CLIENT_BUDGET' && budgetBreakdown
    ? budgetBreakdown.maxDailyRate
    : costRateDaily;

  const marginAmount = round2(clientRateDaily - effectiveCostDaily);
  const marginPercent = clientRateDaily > 0
    ? round2((marginAmount / clientRateDaily) * 100)
    : 0;
  const markupPercent = effectiveCostDaily > 0
    ? round2((marginAmount / effectiveCostDaily) * 100)
    : 0;

  const annualRevenue = round2(clientRateDaily * workingDays);
  const annualCost = round2(effectiveCostDaily * workingDays);
  const annualProfit = round2(annualRevenue - annualCost);

  return {
    costRate: input.pricingMode === 'CLIENT_BUDGET' && budgetBreakdown
      ? budgetBreakdown.maxDailyRate
      : input.costRate,
    costRateDaily: effectiveCostDaily,
    clientRate: input.rateType === 'HOURLY'
      ? round2(clientRateDaily / hoursPerDay)
      : clientRateDaily,
    clientRateDaily,
    marginAmount,
    marginPercent,
    markupPercent,
    dailyProfit: marginAmount,
    annualProfit,
    annualRevenue,
    annualCost,
    currency: input.costCurrency,
    pricingMode: input.pricingMode,

    // TARGET_MARGIN floor fields
    ...(minMarginFloorApplied && {
      minMarginFloorApplied,
      minMarginFloorValue,
      originalClientRateDaily,
      originalMarginAmount,
      minMarginFloorExplanation,
    }),
    ...(!minMarginFloorApplied && input.pricingMode === 'TARGET_MARGIN' && {
      minMarginFloorValue,
    }),

    // CLIENT_BUDGET breakdown
    ...(budgetBreakdown && { budgetBreakdown }),
  };
}
