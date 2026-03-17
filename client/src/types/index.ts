// ============================================================
// Shared types for the TSG Calculator Frontend
// ============================================================

export type CountryCode = 'CH' | 'RO' | 'ES';
export type CalculationBasis = 'NET' | 'GROSS' | 'TOTAL_COST';
export type Period = 'MONTHLY' | 'YEARLY';
export type PensionPlanMode = 'MANDATORY_BVG' | 'SUPER_OBLIGATORY'; // Legacy – kept for type compat but unused
// LPP is now computed automatically from employee age bands
export type PricingMode = 'TARGET_MARGIN' | 'CLIENT_RATE' | 'CLIENT_BUDGET';
export type RateType = 'DAILY' | 'HOURLY';
export type AppMode = 'employee' | 'b2b' | 'allocation';

// --- Margin Input Type for Employee Mode ---
// (Legacy - now only used for GROSS/NET modes)
export type MarginInputType = 'NONE' | 'TARGET_MARGIN' | 'FIXED_DAILY';

// --- Employee Identity (shared across modes) ---
export interface EmployeeIdentity {
  employeeName: string;
  dateOfBirth: string;
  roleOrPosition: string;
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
  fteAmountYearly?: number;
  effectiveAmountYearly?: number;
  currency: string;
  country: CountryCode;
  occupationRate: number;

  // --- Cost Envelope (populated when TOTAL_COST with client rate) ---
  costEnvelope?: {
    clientDailyRate: number;
    marginPercent: number;
    workingDays: number;
    annualRevenue: number;
    marginAmount: number;
    totalEmployerCostEnvelope: number;
    dailyCostRate: number;
    dailyMargin: number;
    minMarginFloorApplied?: boolean;
    originalDailyMargin?: number;
    minMarginFloorExplanation?: string;
  };
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
  minMarginFloorApplied?: boolean;
  minMarginFloorValue?: number;
  originalClientRateDaily?: number;
  originalMarginAmount?: number;
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

export interface ClientResult {
  clientName: string;
  allocationPercent: number;
  dailyRate: number;
  revenuePerDay: number;
  profitPerDay: number;
  isBaseline: boolean;
  annualProfit: number;
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

export interface FXData {
  rates: Record<string, number>;
  lastUpdate: string;
  baseCurrency: string;
}

export interface CHAdvancedOptions {
  employeeAge?: number;
  lfpRate: number;
  laaNonProfessionalRate: number;
}

export interface ROAdvancedOptions {
  disabledTaxExemption: boolean;
  monthlyMealBenefits: number;
  baseFunctionToggle: boolean;
  dependents: number;
}

// --- Payslip types ---
export interface PayslipDeductionLine {
  code: string;
  label: string;
  base: number;
  rate: number;     // percentage (e.g. 5.30)
  amount: number;
  isManual?: boolean;
}

export interface PayslipResult {
  grossMonthlySalary: number;
  deductions: PayslipDeductionLine[];
  totalDeductions: number;
  netSalary: number;
  currency: string;
}

// --- Aligned currency view ---
export interface AlignedCurrencyConfig {
  enabled: boolean;
  targetCurrency: string;
  rate: number; // 1 base = rate target
}
