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

export function calculateEmployee(input: EmployeeInput): EmployeeResult {
  const { country, calculationBasis, period, amount, occupationRate, advancedOptions, clientDailyRate, employeeAge } = input;

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
      // Inject employeeAge into advanced options for LPP age-band calculation
      if (employeeAge !== undefined) {
        advanced.employeeAge = employeeAge;
      }
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

  // Add margin vs client daily rate if provided (legacy - kept for backwards compat)
  if (clientDailyRate && clientDailyRate > 0) {
    result.marginVsClientRate = round2(clientDailyRate - result.dailyRate);
  }

  return result;
}
