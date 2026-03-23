// ============================================================
// TSG Salary & Cost Calculator - API Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { calculateEmployee } from '../services/calculatorEmployee';
import { calculateB2B } from '../services/calculatorB2B';
import { calculateAllocation, calculateAllocationCH } from '../services/calculatorAllocation';
import { fetchFXRates, convertCurrency, invalidateCache } from '../services/fxService';
import {
  lookupWithholdingTax,
  determineTariffCode,
  getAvailableTariffCodes,
  TARIFF_DESCRIPTIONS,
} from '../services/withholdingGE';
import {
  lookupWithholdingTaxVD,
  lookupCapitalBenefitTaxVD,
  determineTariffCodeVD,
  getAvailableTariffCodesVD,
  TARIFF_DESCRIPTIONS_VD,
} from '../services/withholdingVD';

const router = Router();

// Protect every route in this router — valid Entra ID token required
router.use(requireAuth);

/**
 * Convert a CHF amount to the target currency using FX rates (base: RON).
 * rates['CHF'] = CHF per 1 RON, rates['EUR'] = EUR per 1 RON.
 */
function convertCHFFloor(chfAmount: number, targetCurrency: string, fxRates: Record<string, number>): number {
  if (targetCurrency === 'CHF') return chfAmount;
  const chfRate = fxRates['CHF']; // CHF per 1 RON
  if (!chfRate) return chfAmount;
  const inRON = chfAmount / chfRate;
  if (targetCurrency === 'RON') return Math.round(inRON * 100) / 100;
  const targetRate = fxRates[targetCurrency];
  if (!targetRate) return chfAmount;
  return Math.round(inRON * targetRate * 100) / 100;
}

// ---- Employee Mode ----
router.post('/calculate/employee', async (req: Request, res: Response) => {
  try {
    const input = req.body;

    // Validation
    if (!input.country || !['CH', 'RO', 'ES'].includes(input.country)) {
      return res.status(400).json({ error: 'Invalid country. Must be CH, RO, or ES.' });
    }
    if (!input.calculationBasis || !['NET', 'GROSS', 'TOTAL_COST'].includes(input.calculationBasis)) {
      return res.status(400).json({ error: 'Invalid calculation_basis. Must be NET, GROSS, or TOTAL_COST.' });
    }
    if (!input.amount || input.amount <= 0) {
      // Allow amount=0 when TOTAL_COST with clientDailyRate (cost envelope mode)
      if (!(input.calculationBasis === 'TOTAL_COST' && input.clientDailyRate && input.clientDailyRate > 0)) {
        return res.status(400).json({ error: 'Amount must be greater than 0.' });
      }
    }

    // For TOTAL_COST mode: floor is always in CHF; convert to local currency for non-CH countries
    let resolvedMinDailyMargin: number | undefined;
    if (input.calculationBasis === 'TOTAL_COST') {
      const chfFloor = input.minDailyMargin !== undefined ? Number(input.minDailyMargin) : 120;
      if (input.country === 'CH') {
        resolvedMinDailyMargin = chfFloor;
      } else {
        try {
          const fx = await fetchFXRates();
          const localCurrency = input.country === 'RO' ? 'RON' : 'EUR';
          resolvedMinDailyMargin = convertCHFFloor(chfFloor, localCurrency, fx.rates);
        } catch {
          resolvedMinDailyMargin = chfFloor; // Fallback to CHF value if FX unavailable
        }
      }
    } else {
      resolvedMinDailyMargin = input.minDailyMargin !== undefined ? Number(input.minDailyMargin) : undefined;
    }

    const result = calculateEmployee({
      country: input.country,
      calculationBasis: input.calculationBasis,
      period: input.period || 'YEARLY',
      amount: Number(input.amount),
      occupationRate: Number(input.occupationRate ?? 100),
      advancedOptions: input.advancedOptions,
      employeeAge: input.employeeAge !== undefined ? Number(input.employeeAge) : undefined,
      // TOTAL_COST cost envelope fields
      clientDailyRate: input.clientDailyRate ? Number(input.clientDailyRate) : undefined,
      marginPercent: input.marginPercent !== undefined ? Number(input.marginPercent) : undefined,
      workingDaysPerYear: input.workingDaysPerYear ? Number(input.workingDaysPerYear) : undefined,
      minDailyMargin: resolvedMinDailyMargin,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- B2B Mode ----
router.post('/calculate/b2b', async (req: Request, res: Response) => {
  try {
    const input = req.body;

    // CLIENT_BUDGET mode doesn't require costRate (it's derived from the budget)
    if (input.pricingMode !== 'CLIENT_BUDGET' && (!input.costRate || input.costRate <= 0)) {
      return res.status(400).json({ error: 'Cost rate must be greater than 0.' });
    }
    if (!input.pricingMode || !['TARGET_MARGIN', 'CLIENT_RATE', 'CLIENT_BUDGET'].includes(input.pricingMode)) {
      return res.status(400).json({ error: 'Invalid pricing mode.' });
    }

    // Fetch FX rates for min margin floor conversion (TARGET_MARGIN and CLIENT_BUDGET modes)
    let fxRates: Record<string, number> | undefined;
    if (input.pricingMode === 'TARGET_MARGIN' || input.pricingMode === 'CLIENT_BUDGET') {
      try {
        const fx = await fetchFXRates();
        fxRates = fx.rates;
      } catch { /* use defaults if unavailable */ }
    }

    const result = calculateB2B({
      costRate: Number(input.costRate || 0),
      rateType: input.rateType || 'DAILY',
      costCurrency: input.costCurrency || 'CHF',
      pricingMode: input.pricingMode,
      // TARGET_MARGIN fields
      targetMarginPercent: input.targetMarginPercent !== undefined ? Number(input.targetMarginPercent) : undefined,
      minDailyMargin: input.minDailyMargin !== undefined ? Number(input.minDailyMargin) : undefined,
      minDailyMarginCurrency: input.minDailyMarginCurrency || undefined,
      // CLIENT_RATE fields
      clientRate: input.clientRate ? Number(input.clientRate) : undefined,
      // CLIENT_BUDGET fields
      clientDailyRate: input.clientDailyRate ? Number(input.clientDailyRate) : undefined,
      budgetMarginPercent: input.budgetMarginPercent !== undefined ? Number(input.budgetMarginPercent) : undefined,
      socialMultiplier: input.socialMultiplier !== undefined ? Number(input.socialMultiplier) : undefined,
      // Legacy compat
      clientBudget: input.clientBudget ? Number(input.clientBudget) : undefined,
      budgetDays: input.budgetDays ? Number(input.budgetDays) : undefined,
      // Common
      hoursPerDay: input.hoursPerDay ? Number(input.hoursPerDay) : undefined,
      workingDaysPerYear: input.workingDaysPerYear ? Number(input.workingDaysPerYear) : undefined,
      fxRates,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Allocation Mode ----
router.post('/calculate/allocation', async (req: Request, res: Response) => {
  try {
    const input = req.body;

    if (!input.clients || !Array.isArray(input.clients) || input.clients.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one client is required.' });
    }

    // New CH social-charge mode: detected by presence of grossAnnualSalary
    if (input.grossAnnualSalary !== undefined) {
      if (Number(input.grossAnnualSalary) <= 0) {
        return res.status(400).json({ success: false, error: 'Gross salary must be greater than 0.' });
      }
      const result = calculateAllocationCH({
        grossAnnualSalary: Number(input.grossAnnualSalary),
        workingDaysPerYear: Number(input.workingDaysPerYear ?? 220),
        currency: input.currency || 'CHF',
        clients: input.clients.map((c: any) => ({
          clientName: c.clientName || 'Client',
          allocationPercent: Number(c.allocationPercent),
          dailyRate: Number(c.dailyRate || 0),
          isBilled: c.isBilled !== false,
        })),
        employeeAge: input.employeeAge !== undefined ? Number(input.employeeAge) : undefined,
        lfpRate: input.lfpRate !== undefined ? Number(input.lfpRate) : undefined,
        laaNonProfessionalRate: input.laaNonProfessionalRate !== undefined ? Number(input.laaNonProfessionalRate) : undefined,
      });
      return res.json({ success: true, data: result });
    }

    // Legacy multiplier-based mode
    if (!input.salary100 || input.salary100 <= 0) {
      return res.status(400).json({ success: false, error: 'Salary must be greater than 0.' });
    }

    const allocationCurrency: string = input.currency || 'CHF';
    const chfFloorAlloc = input.minDailyMargin !== undefined ? Number(input.minDailyMargin) : 120;
    let resolvedAllocMinMargin: number;
    if (allocationCurrency === 'CHF') {
      resolvedAllocMinMargin = chfFloorAlloc;
    } else {
      try {
        const fx = await fetchFXRates();
        resolvedAllocMinMargin = convertCHFFloor(chfFloorAlloc, allocationCurrency, fx.rates);
      } catch {
        resolvedAllocMinMargin = chfFloorAlloc;
      }
    }

    const result = calculateAllocation({
      salary100: Number(input.salary100),
      engagementPercent: Number(input.engagementPercent ?? 100),
      employerMultiplier: Number(input.employerMultiplier ?? 1.2),
      workingDaysPerYear: Number(input.workingDaysPerYear ?? 220),
      currency: allocationCurrency,
      clients: input.clients.map((c: any) => ({
        clientName: c.clientName || 'Client',
        allocationPercent: Number(c.allocationPercent),
        dailyRate: Number(c.dailyRate),
      })),
      minDailyMargin: resolvedAllocMinMargin,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- FX Rates ----
router.get('/fx/rates', async (_req: Request, res: Response) => {
  try {
    const fx = await fetchFXRates();
    res.json({
      success: true,
      data: {
        rates: fx.rates,
        lastUpdate: fx.lastUpdate,
        baseCurrency: 'RON',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/fx/convert', async (req: Request, res: Response) => {
  try {
    const { amount, from, to } = req.body;
    const fx = await fetchFXRates();
    const converted = convertCurrency(Number(amount), from, to, fx.rates);
    res.json({
      success: true,
      data: { amount: Number(amount), from, to, converted, lastUpdate: fx.lastUpdate },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/fx/refresh', async (_req: Request, res: Response) => {
  try {
    invalidateCache();
    const fx = await fetchFXRates();
    res.json({
      success: true,
      data: { rates: fx.rates, lastUpdate: fx.lastUpdate, baseCurrency: 'RON' },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---- Withholding Tax (Impôt à la source) - Geneva ----

// GET available tariff codes
router.get('/withholding/geneva/codes', (_req: Request, res: Response) => {
  try {
    const codes = getAvailableTariffCodes();
    res.json({
      success: true,
      data: {
        codes,
        descriptions: TARIFF_DESCRIPTIONS,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST simple withholding tax lookup
router.post('/withholding/geneva/simple', (req: Request, res: Response) => {
  try {
    const input = req.body;

    const grossMonthly = Number(input.grossMonthly);
    if (!grossMonthly || grossMonthly <= 0) {
      return res.status(400).json({
        success: false,
        error: 'grossMonthly must be a positive number (CHF).',
      });
    }

    let tariffCode: string = input.tariffCode || '';
    let church: string = input.church || 'N';
    const allNotes: string[] = [];
    const allWarnings: string[] = [];
    let exempt = false;
    let reason = '';

    // If no tariff code provided, determine from personal info
    if (!tariffCode) {
      const determination = determineTariffCode({
        nationality: input.nationality || 'foreign',
        permit: input.permit,
        residence: input.residence || 'geneva',
        maritalStatus: input.maritalStatus || 'single',
        childrenCount: Number(input.childrenCount ?? 0),
        isSingleParent: input.isSingleParent === true,
        spouseHasSwissIncome: input.spouseHasSwissIncome === true,
        annualGrossCHF: input.annualGrossCHF ? Number(input.annualGrossCHF) : undefined,
        isShortTermAssignment: input.isShortTermAssignment === true,
        assignmentDays: input.assignmentDays ? Number(input.assignmentDays) : undefined,
      });
      tariffCode = determination.tariffCode;
      exempt = determination.exempt;
      reason = determination.reason || '';
      allNotes.push(...determination.notes);
      allWarnings.push(...determination.warnings);
    }

    // If exempt, return zero
    if (exempt) {
      return res.json({
        success: true,
        data: {
          tariffCode: '',
          church: '',
          grossMonthly,
          taxAmount: 0,
          effectiveRate: 0,
          bracketFrom: 0,
          bracketTo: 0,
          exempt: true,
          reason,
          notes: allNotes,
          warnings: allWarnings,
        },
      });
    }

    // Lookup tax
    const result = lookupWithholdingTax(grossMonthly, tariffCode, church);
    allNotes.push(...result.notes);

    res.json({
      success: true,
      data: {
        ...result,
        exempt: false,
        reason,
        notes: allNotes,
        warnings: allWarnings,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Withholding Tax (Impôt à la source) - Vaud 2025 ----

// GET available tariff codes
router.get('/withholding/vaud/codes', (_req: Request, res: Response) => {
  try {
    const codes = getAvailableTariffCodesVD();
    res.json({
      success: true,
      data: {
        codes,
        descriptions: TARIFF_DESCRIPTIONS_VD,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST simple withholding tax lookup (salary)
router.post('/withholding/vaud/simple', (req: Request, res: Response) => {
  try {
    const input = req.body;

    const grossMonthly = Number(input.grossMonthly);
    if (!grossMonthly || grossMonthly <= 0) {
      return res.status(400).json({
        success: false,
        error: 'grossMonthly must be a positive number (CHF).',
      });
    }

    let tariffCode: string = input.tariffCode || '';
    const allNotes: string[] = [];
    const allWarnings: string[] = [];
    let exempt = false;
    let reason = '';

    // If no tariff code provided, determine from personal info
    if (!tariffCode) {
      const determination = determineTariffCodeVD({
        nationality: input.nationality || 'foreign',
        permit: input.permit,
        residence: input.residence || 'vaud',
        maritalStatus: input.maritalStatus || 'single',
        childrenCount: Number(input.childrenCount ?? 0),
        isSingleParent: input.isSingleParent === true,
        spouseHasSwissIncome: input.spouseHasSwissIncome === true,
        spouseAnnualIncomeCHF: input.spouseAnnualIncomeCHF ? Number(input.spouseAnnualIncomeCHF) : undefined,
        annualGrossCHF: input.annualGrossCHF ? Number(input.annualGrossCHF) : undefined,
        isShortTermAssignment: input.isShortTermAssignment === true,
        assignmentDays: input.assignmentDays ? Number(input.assignmentDays) : undefined,
        frenchFrontalierConditionsNotMet: input.frenchFrontalierConditionsNotMet === true,
      });
      tariffCode = determination.tariffCode;
      exempt = determination.exempt;
      reason = determination.reason || '';
      allNotes.push(...determination.notes);
      allWarnings.push(...determination.warnings);
    }

    // If exempt, return zero
    if (exempt) {
      return res.json({
        success: true,
        data: {
          tariffCode: '',
          grossMonthly,
          taxAmount: 0,
          effectiveRate: 0,
          annualisedGross: 0,
          exempt: true,
          reason,
          notes: allNotes,
          warnings: allWarnings,
        },
      });
    }

    // Lookup tax
    const result = lookupWithholdingTaxVD(grossMonthly, tariffCode);
    allNotes.push(...result.notes);
    allWarnings.push(...result.warnings);

    res.json({
      success: true,
      data: {
        ...result,
        exempt: false,
        reason,
        notes: allNotes,
        warnings: allWarnings,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST capital benefit tax lookup (tariffs I, J, K — pension lump sums)
router.post('/withholding/vaud/capital-benefit', (req: Request, res: Response) => {
  try {
    const input = req.body;

    const capitalAmount = Number(input.capitalAmount);
    if (!capitalAmount || capitalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'capitalAmount must be a positive number (CHF).',
      });
    }

    const tariffCode = input.tariffCode;
    if (!['I', 'J', 'K'].includes(tariffCode)) {
      return res.status(400).json({
        success: false,
        error: 'tariffCode must be "I", "J", or "K" for capital benefit calculations.',
      });
    }

    const result = lookupCapitalBenefitTaxVD(capitalAmount, tariffCode as 'I' | 'J' | 'K');
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Health Check ----
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

export default router;
