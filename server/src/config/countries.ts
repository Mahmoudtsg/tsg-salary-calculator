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
      { minAge: 18, maxAge: 24, totalRate: 0.003, savingsRate: 0.000, riskCostsRate: 0.003 },
      { minAge: 25, maxAge: 34, totalRate: 0.084, savingsRate: 0.070, riskCostsRate: 0.014 },
      { minAge: 35, maxAge: 44, totalRate: 0.114, savingsRate: 0.098, riskCostsRate: 0.016 },
      { minAge: 45, maxAge: 54, totalRate: 0.174, savingsRate: 0.155, riskCostsRate: 0.019 },
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
// Source: Art. 77 Cod Fiscal, OUG 89/2025, calculator-salarii.ro
// ============================================================
export const RO_CONFIG = {
  currency: 'RON' as const,
  taxYear: 2026,
  includesIncomeTax: true,

  CAS: { employee: 0.25 },       // Social security (pension)
  CASS: { employee: 0.10 },      // Health insurance
  CAM: { employer: 0.0225 },     // Work insurance (employer only)
  incomeTaxRate: 0.10,

  // Minimum wage parameters for 2026
  // Jan-Jun 2026: 4,050 RON; Jul-Dec 2026: 4,325 RON
  minimumWage: 4050,

  // Personal deduction (Deducere Personală de Bază) - Art. 77 Cod Fiscal
  // Applied only when baseFunctionToggle = true (functie de baza)
  // Applies for gross monthly salary up to minimumWage + 2,000 RON
  // Deduction = percentage × minimumWage
  // Percentage depends on salary band (how much above minimum) and number of dependents
  // Base percentages at minimum wage level:
  personalDeductionBaseRates: {
    0: 0.20,   // 0 dependents: 20% of min wage
    1: 0.25,   // 1 dependent:  25% of min wage
    2: 0.30,   // 2 dependents: 30% of min wage
    3: 0.35,   // 3 dependents: 35% of min wage
    4: 0.45,   // 4+ dependents: 45% of min wage
  } as Record<number, number>,
  // For every 50 RON above minimum wage, percentage decreases by 0.5%
  personalDeductionStep: 50,          // RON step size
  personalDeductionRateDecrement: 0.005, // 0.5% decrease per step
  personalDeductionMaxAboveMin: 2000, // Maximum RON above minimum wage for deduction eligibility

  // Minimum wage tax-free amount (Suma Neimpozabilă) - OUG 89/2025
  // Jan-Jun 2026: 300 RON tax-free if gross <= 4,300 and salary = minimum wage
  // Jul-Dec 2026: 200 RON tax-free if gross <= 4,600 and salary = minimum wage (4,325)
  taxFreeAmount: 300,                 // RON/month (Jan-Jun 2026)
  taxFreeGrossThreshold: 4300,        // Maximum gross to qualify for tax-free amount

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
  employeeAge?: number;  // Derived from DOB on frontend, passed for CH LPP calculation

  // --- TOTAL_COST mode: cost envelope from client rate ---
  // When calculationBasis = 'TOTAL_COST', these fields compute the cost envelope:
  //   Revenue = clientDailyRate × effectiveWorkingDays
  //   Margin  = Revenue × marginPercent / 100
  //   Total Employer Cost = Revenue - Margin
  clientDailyRate?: number;      // Daily rate charged to the client
  marginPercent?: number;        // Margin on sales (e.g. 30 = 30%)
  workingDaysPerYear?: number;   // Default 220, adjusted by occupation rate
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
  /** The original 100% FTE yearly amount entered by the user */
  fteAmountYearly?: number;
  /** The effective yearly amount after applying occupation rate */
  effectiveAmountYearly?: number;
  currency: string;
  country: CountryCode;
  occupationRate: number;

  // --- Cost Envelope (populated when TOTAL_COST with client rate) ---
  costEnvelope?: {
    clientDailyRate: number;
    marginPercent: number;
    workingDays: number;           // Effective working days (220 × occRate%)
    annualRevenue: number;         // clientDailyRate × workingDays
    marginAmount: number;          // annualRevenue × marginPercent%
    totalEmployerCostEnvelope: number; // annualRevenue - marginAmount
    dailyCostRate: number;         // totalEmployerCostEnvelope / workingDays
    dailyMargin: number;           // marginAmount / workingDays
  };
}
