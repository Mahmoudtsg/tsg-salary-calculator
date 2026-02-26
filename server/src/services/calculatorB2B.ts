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
  targetMarginPercent?: number;
  clientRate?: number;
  /** For CLIENT_BUDGET mode: the daily rate the client pays */
  clientDailyRate?: number;
  /** @deprecated - replaced by clientDailyRate; kept for backwards compat */
  clientBudget?: number;
  budgetDays?: number;
  hoursPerDay?: number;
  workingDaysPerYear?: number;
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
}

export function calculateB2B(input: B2BInput): B2BResult {
  const hoursPerDay = input.hoursPerDay ?? 8;
  const workingDays = input.workingDaysPerYear ?? 220;

  // Normalize to daily rate
  const costRateDaily = input.rateType === 'HOURLY'
    ? round2(input.costRate * hoursPerDay)
    : input.costRate;

  let clientRateDaily: number;

  switch (input.pricingMode) {
    case 'TARGET_MARGIN': {
      const marginPct = (input.targetMarginPercent ?? 0) / 100;
      // clientRate = costRate / (1 - marginPct)
      if (marginPct >= 1) throw new Error('Margin percent must be less than 100%');
      clientRateDaily = round2(costRateDaily / (1 - marginPct));
      break;
    }

    case 'CLIENT_RATE': {
      clientRateDaily = input.rateType === 'HOURLY'
        ? round2((input.clientRate ?? 0) * hoursPerDay)
        : (input.clientRate ?? 0);
      break;
    }

    case 'CLIENT_BUDGET': {
      // New approach: accept clientDailyRate directly
      if (input.clientDailyRate !== undefined && input.clientDailyRate > 0) {
        clientRateDaily = input.clientDailyRate;
      } else if (input.clientBudget !== undefined) {
        // Backwards compat: old total budget / days approach
        const budget = input.clientBudget;
        const days = input.budgetDays ?? 1;
        clientRateDaily = round2(budget / days);
      } else {
        clientRateDaily = 0;
      }
      break;
    }

    default:
      throw new Error(`Unknown pricing mode: ${input.pricingMode}`);
  }

  const marginAmount = round2(clientRateDaily - costRateDaily);
  const marginPercent = clientRateDaily > 0
    ? round2((marginAmount / clientRateDaily) * 100)
    : 0;
  const markupPercent = costRateDaily > 0
    ? round2((marginAmount / costRateDaily) * 100)
    : 0;

  const annualRevenue = round2(clientRateDaily * workingDays);
  const annualCost = round2(costRateDaily * workingDays);
  const annualProfit = round2(annualRevenue - annualCost);

  return {
    costRate: input.costRate,
    costRateDaily,
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
  };
}
