// ============================================================
// TSG Salary & Cost Calculator - Unified Employee Calculator
// Routes calculations to the correct country engine
// ============================================================

import {
  EmployeeInput,
  EmployeeResult,
  CHAdvancedOptions,
  ROAdvancedOptions,
  ESAdvancedOptions,
  CH_CONFIG,
  RO_CONFIG,
  ES_CONFIG,
} from '../config/countries';
import { round2 } from '../utils/math';
import {
  calculateCHFromGross,
  calculateCHFromNet,
  calculateCHFromTotalCost,
} from './calculatorCH';
import {
  calculateROFromGross,
  calculateROFromNet,
  calculateROFromTotalCost,
} from './calculatorRO';
import {
  calculateESFromGross,
  calculateESFromNet,
  calculateESFromTotalCost,
} from './calculatorES';

// ============================================================
// Cost Envelope: compute Total Employer Cost from client rate
// ============================================================
// When calculationBasis = 'TOTAL_COST' and clientDailyRate is provided:
//   1. Working days = workingDaysPerYear × (occupationRate / 100)
//   2. Annual Revenue = clientDailyRate × working days
//   3. Margin = Annual Revenue × (marginPercent / 100)
//   4. Total Employer Cost = Annual Revenue - Margin
// This cost envelope is then fed into the existing TOTAL_COST
// reverse calculation to find the maximum gross/net salary.
// ============================================================

function computeCostEnvelope(input: EmployeeInput): {
  totalCostYearly: number;
  envelope: NonNullable<EmployeeResult['costEnvelope']>;
} {
  const { clientDailyRate, marginPercent, workingDaysPerYear, occupationRate, country, minDailyMargin } = input;

  if (!clientDailyRate || clientDailyRate <= 0) {
    throw new Error('Client Daily Rate must be greater than 0 for TOTAL_COST calculation.');
  }

  const margin = marginPercent ?? 30; // default 30%
  if (margin < 0 || margin >= 100) {
    throw new Error('Margin must be between 0% and 99%.');
  }

  // Default working days from country config
  const defaultWD =
    country === 'CH' ? CH_CONFIG.workingDaysPerYear :
    country === 'RO' ? RO_CONFIG.workingDaysPerYear :
    ES_CONFIG.workingDaysPerYear;

  const baseWorkingDays = workingDaysPerYear ?? defaultWD;

  // Apply occupation rate to working days
  const occFactor = (occupationRate ?? 100) / 100;
  const effectiveWorkingDays = round2(baseWorkingDays * occFactor);

  const annualRevenue = round2(clientDailyRate * effectiveWorkingDays);

  // Apply minimum daily margin floor
  const floor = minDailyMargin ?? 120; // default 120 CHF
  const dailyMarginRaw = round2(clientDailyRate * (margin / 100));
  let effectiveDailyMargin: number;
  let minMarginFloorApplied = false;
  let originalDailyMargin: number | undefined;
  let minMarginFloorExplanation: string | undefined;

  if (dailyMarginRaw < floor) {
    minMarginFloorApplied = true;
    originalDailyMargin = dailyMarginRaw;
    effectiveDailyMargin = floor;
    minMarginFloorExplanation =
      `Minimum daily margin of ${floor} CHF applied. ` +
      `The calculated margin (${round2(dailyMarginRaw)} CHF = ${margin}% of ${clientDailyRate} CHF/day) ` +
      `was below the floor. Daily margin set to ${floor} CHF.`;
  } else {
    effectiveDailyMargin = dailyMarginRaw;
  }

  const marginAmount = round2(effectiveDailyMargin * effectiveWorkingDays);
  const totalCostYearly = round2(annualRevenue - marginAmount);
  const dailyCostRate = effectiveWorkingDays > 0 ? round2(totalCostYearly / effectiveWorkingDays) : 0;

  return {
    totalCostYearly,
    envelope: {
      clientDailyRate,
      marginPercent: margin,
      workingDays: effectiveWorkingDays,
      annualRevenue,
      marginAmount,
      totalEmployerCostEnvelope: totalCostYearly,
      dailyCostRate,
      dailyMargin: effectiveDailyMargin,
      minMarginFloorApplied,
      ...(minMarginFloorApplied && { originalDailyMargin, minMarginFloorExplanation }),
    },
  };
}

export function calculateEmployee(input: EmployeeInput): EmployeeResult {
  const { country, calculationBasis, period, amount, occupationRate, advancedOptions, employeeAge } = input;

  // ============================================================
  // TOTAL_COST with client rate: compute cost envelope first
  // ============================================================
  if (calculationBasis === 'TOTAL_COST' && input.clientDailyRate && input.clientDailyRate > 0) {
    const { totalCostYearly, envelope } = computeCostEnvelope(input);

    let result: EmployeeResult;

    switch (country) {
      case 'CH': {
        const advanced = (advancedOptions ?? {}) as CHAdvancedOptions;
        if (employeeAge !== undefined) advanced.employeeAge = employeeAge;
        result = calculateCHFromTotalCost(totalCostYearly, occupationRate, advanced);
        break;
      }
      case 'RO': {
        const advanced = (advancedOptions ?? {}) as ROAdvancedOptions;
        result = calculateROFromTotalCost(totalCostYearly, occupationRate, advanced);
        break;
      }
      case 'ES': {
        const advanced = (advancedOptions ?? {}) as ESAdvancedOptions;
        result = calculateESFromTotalCost(totalCostYearly, occupationRate, advanced);
        break;
      }
      default:
        throw new Error(`Unsupported country: ${country}`);
    }

    // Override dailyRate to use the effective working days from the envelope
    if (envelope.workingDays > 0) {
      result.dailyRate = round2(result.totalEmployerCostYearly / envelope.workingDays);
    }

    // Attach the cost envelope to the result
    result.costEnvelope = envelope;

    // FTE references are from the envelope
    result.fteAmountYearly = totalCostYearly;
    result.effectiveAmountYearly = totalCostYearly;

    return result;
  }

  // ============================================================
  // Standard flow: GROSS, NET, or TOTAL_COST (manual amount)
  // ============================================================

  // Convert monthly to yearly if needed
  let yearlyAmount = period === 'MONTHLY' ? amount * 12 : amount;

  // Apply occupation rate to the calculation base:
  // The user enters the 100% FTE salary. The actual calculation base
  // is scaled by the occupation rate (e.g. 10,000/m × 80% = 8,000/m).
  const occFactor = (occupationRate ?? 100) / 100;
  const effectiveYearlyAmount = round2(yearlyAmount * occFactor);

  let result: EmployeeResult;

  switch (country) {
    case 'CH': {
      const advanced = (advancedOptions ?? {}) as CHAdvancedOptions;
      if (employeeAge !== undefined) advanced.employeeAge = employeeAge;
      switch (calculationBasis) {
        case 'GROSS':
          result = calculateCHFromGross(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'NET':
          result = calculateCHFromNet(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'TOTAL_COST':
          result = calculateCHFromTotalCost(effectiveYearlyAmount, occupationRate, advanced);
          break;
        default:
          throw new Error(`Invalid calculation basis: ${calculationBasis}`);
      }
      break;
    }

    case 'RO': {
      const advanced = (advancedOptions ?? {}) as ROAdvancedOptions;
      switch (calculationBasis) {
        case 'GROSS':
          result = calculateROFromGross(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'NET':
          result = calculateROFromNet(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'TOTAL_COST':
          result = calculateROFromTotalCost(effectiveYearlyAmount, occupationRate, advanced);
          break;
        default:
          throw new Error(`Invalid calculation basis: ${calculationBasis}`);
      }
      break;
    }

    case 'ES': {
      const advanced = (advancedOptions ?? {}) as ESAdvancedOptions;
      switch (calculationBasis) {
        case 'GROSS':
          result = calculateESFromGross(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'NET':
          result = calculateESFromNet(effectiveYearlyAmount, occupationRate, advanced);
          break;
        case 'TOTAL_COST':
          result = calculateESFromTotalCost(effectiveYearlyAmount, occupationRate, advanced);
          break;
        default:
          throw new Error(`Invalid calculation basis: ${calculationBasis}`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported country: ${country}`);
  }

  // Store the original 100% FTE amount for reference
  result.fteAmountYearly = round2(yearlyAmount);
  result.effectiveAmountYearly = effectiveYearlyAmount;

  return result;
}
