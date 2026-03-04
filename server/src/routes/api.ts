// ============================================================
// TSG Salary & Cost Calculator - API Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { calculateEmployee } from '../services/calculatorEmployee';
import { calculateB2B } from '../services/calculatorB2B';
import { calculateAllocation } from '../services/calculatorAllocation';
import { fetchFXRates, convertCurrency, invalidateCache } from '../services/fxService';
import {
  lookupWithholdingTax,
  determineTariffCode,
  getAvailableTariffCodes,
  TARIFF_DESCRIPTIONS,
} from '../services/withholdingGE';

const router = Router();

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

    // Fetch FX rates for min margin floor conversion (TARGET_MARGIN mode)
    let fxRates: Record<string, number> | undefined;
    if (input.pricingMode === 'TARGET_MARGIN') {
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

    if (!input.salary100 || input.salary100 <= 0) {
      return res.status(400).json({ error: 'Salary must be greater than 0.' });
    }
    if (!input.clients || !Array.isArray(input.clients) || input.clients.length === 0) {
      return res.status(400).json({ error: 'At least one client is required.' });
    }

    const result = calculateAllocation({
      salary100: Number(input.salary100),
      engagementPercent: Number(input.engagementPercent ?? 100),
      employerMultiplier: Number(input.employerMultiplier ?? 1.2),
      workingDaysPerYear: Number(input.workingDaysPerYear ?? 220),
      currency: input.currency || 'CHF',
      clients: input.clients.map((c: any) => ({
        clientName: c.clientName || 'Client',
        allocationPercent: Number(c.allocationPercent),
        dailyRate: Number(c.dailyRate),
      })),
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
    let exempt = false;

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
      });
      tariffCode = determination.tariffCode;
      exempt = determination.exempt;
      allNotes.push(...determination.notes);
    }

    // If exempt (Swiss / C-permit), return zero
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
          notes: allNotes,
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
        notes: allNotes,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Health Check ----
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

export default router;
