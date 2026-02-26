// ============================================================
// TSG Salary & Cost Calculator - Country Tax Configuration
// All rates centralized here for annual updates.
// Tax Year: 2026
// ============================================================

export interface ContributionLine {
  name: string;
  key: string;
  employeeRate: number;
  employerRate: number;
  ceiling?: number;       // Annual ceiling on base
  floorMonthly?: number;  // Monthly minimum base
  ceilingMonthly?: number; // Monthly maximum base
  description: string;
}

// ============================================================
// SWITZERLAND (CHF) - 2026 Rules
// ============================================================
export const CH_CONFIG = {
  currency: 'CHF' as const,
  taxYear: 2026,
  includesIncomeTax: false,

  // Social contributions
  AVS_AI_APG: { employee: 0.053, employer: 0.053 },
  AC: {
    employee: 0.011,
    employer: 0.011,
    annualCeiling: 148200,
    solidarityRate: 0.005, // each side above ceiling
  },
  CAF: { employer: 0.0222 },
  LAMat: { employee: 0.00029, employer: 0.00029 },
  CPE: { employer: 0.0007 },
  LFP: { employer: 0.001, configurable: true }, // default 0.1%
  LPP: {
    entryThreshold: 22050,         // AVS salary below this → LPP = 0
    coordinationDeduction: 26460,  // DC for 2026
    planCeiling: 300000,           // Maximum AVS salary considered
    // Age bands: total contribution rate (savings + risk & costs)
    // Employer and employee each pay 50%
    ageBands: [
      { minAge: 18, maxAge: 24, totalRate: 0.012, savingsRate: 0.000, riskCostsRate: 0.012 },
      { minAge: 25, maxAge: 34, totalRate: 0.084, savingsRate: 0.070, riskCostsRate: 0.014 },
      { minAge: 35, maxAge: 44, totalRate: 0.116, savingsRate: 0.100, riskCostsRate: 0.016 },
      { minAge: 45, maxAge: 54, totalRate: 0.169, savingsRate: 0.150, riskCostsRate: 0.019 },
      { minAge: 55, maxAge: 65, totalRate: 0.204, savingsRate: 0.180, riskCostsRate: 0.024 },
    ],
  },
  LAA: {
    professional: 0.01,       // employer
    nonProfessional: 0.015,   // employee, configurable
  },

  workingDaysPerYear: 220,
};

// ============================================================
// ROMANIA (RON) - 2026 Rules
// ============================================================
export const RO_CONFIG = {
  currency: 'RON' as const,
  taxYear: 2026,
  includesIncomeTax: true,

  CAS: { employee: 0.25 },       // Social security
  CASS: { employee: 0.10 },      // Health insurance
  CAM: { employer: 0.0225 },     // Work insurance
  incomeTaxRate: 0.10,
  personalDeduction: 510,          // RON/month (base function)
  dependentDeduction: 110,         // RON/month per dependent

  workingDaysPerYear: 220,
};

// ============================================================
// SPAIN (EUR) - 2026 Rules
// ============================================================
export const ES_CONFIG = {
  currency: 'EUR' as const,
  taxYear: 2026,
  includesIncomeTax: true,

  commonContingencies: { employee: 0.047, employer: 0.236 },
  unemployment: { employee: 0.0155, employer: 0.058 },
  professionalTraining: { employee: 0.001, employer: 0.006 },
  FOGASA: { employer: 0.002 },

  contributionBase: {
    minMonthly: 1323,
    maxMonthly: 4720.50,
  },

  // IRPF progressive bands (simplified estimate)
  irpfBands: [
    { upTo: 12450, rate: 0.19 },
    { upTo: 20200, rate: 0.24 },
    { upTo: 35200, rate: 0.30 },
    { upTo: 60000, rate: 0.37 },
    { upTo: 300000, rate: 0.45 },
    { upTo: Infinity, rate: 0.47 },
  ],

  workingDaysPerYear: 220,
};

export type CountryCode = 'CH' | 'RO' | 'ES';
export type CalculationBasis = 'NET' | 'GROSS' | 'TOTAL_COST';
export type Period = 'MONTHLY' | 'YEARLY';
// PensionPlanMode removed – LPP is now computed from age bands automatically

export interface CHAdvancedOptions {
  employeeAge?: number;             // Derived from date of birth – mandatory for CH
  lfpRate?: number;
  laaNonProfessionalRate?: number;
}

export interface ROAdvancedOptions {
  disabledTaxExemption?: boolean;
  monthlyMealBenefits?: number;
  baseFunctionToggle?: boolean;
  dependents?: number;
}

export interface ESAdvancedOptions {
  // Reserved for future use
}

export type AdvancedOptions = CHAdvancedOptions | ROAdvancedOptions | ESAdvancedOptions;

export interface EmployeeInput {
  country: CountryCode;
  calculationBasis: CalculationBasis;
  period: Period;
  amount: number;
  occupationRate: number;
  advancedOptions?: AdvancedOptions;
  clientDailyRate?: number;
  employeeAge?: number;  // Derived from DOB on frontend, passed for CH LPP calculation
}

export interface ContributionDetail {
  name: string;
  rate: number;
  base: number;
  amount: number;
}

export interface EmployeeResult {
  grossSalaryMonthly: number;
  grossSalaryYearly: number;
  netSalaryMonthly: number;
  netSalaryYearly: number;
  totalEmployerCostMonthly: number;
  totalEmployerCostYearly: number;
  employeeContributions: ContributionDetail[];
  employerContributions: ContributionDetail[];
  totalEmployeeContributions: number;
  totalEmployerContributions: number;
  taxableBase?: number;
  incomeTax?: number;
  incomeTaxMonthly?: number;
  dailyRate: number;
  marginVsClientRate?: number;
  /** The original 100% FTE yearly amount entered by the user */
  fteAmountYearly?: number;
  /** The effective yearly amount after applying occupation rate */
  effectiveAmountYearly?: number;
  currency: string;
  country: CountryCode;
  occupationRate: number;
}
