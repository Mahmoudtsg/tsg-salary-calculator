// ============================================================
// TSG Salary & Cost Calculator - API Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { calculateEmployee } from '../services/calculatorEmployee';
import { calculateB2B } from '../services/calculatorB2B';
import { calculateAllocation } from '../services/calculatorAllocation';
import { fetchFXRates, convertCurrency, invalidateCache } from '../services/fxService';

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
      return res.status(400).json({ error: 'Amount must be greater than 0.' });
    }

    const result = calculateEmployee({
      country: input.country,
      calculationBasis: input.calculationBasis,
      period: input.period || 'YEARLY',
      amount: Number(input.amount),
      occupationRate: Number(input.occupationRate ?? 100),
      advancedOptions: input.advancedOptions,
      clientDailyRate: input.clientDailyRate ? Number(input.clientDailyRate) : undefined,
      employeeAge: input.employeeAge !== undefined ? Number(input.employeeAge) : undefined,
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

    if (!input.costRate || input.costRate <= 0) {
      return res.status(400).json({ error: 'Cost rate must be greater than 0.' });
    }
    if (!input.pricingMode || !['TARGET_MARGIN', 'CLIENT_RATE', 'CLIENT_BUDGET'].includes(input.pricingMode)) {
      return res.status(400).json({ error: 'Invalid pricing mode.' });
    }

    const result = calculateB2B({
      costRate: Number(input.costRate),
      rateType: input.rateType || 'DAILY',
      costCurrency: input.costCurrency || 'CHF',
      pricingMode: input.pricingMode,
      targetMarginPercent: input.targetMarginPercent ? Number(input.targetMarginPercent) : undefined,
      clientRate: input.clientRate ? Number(input.clientRate) : undefined,
      clientDailyRate: input.clientDailyRate ? Number(input.clientDailyRate) : undefined,
      clientBudget: input.clientBudget ? Number(input.clientBudget) : undefined,
      budgetDays: input.budgetDays ? Number(input.budgetDays) : undefined,
      hoursPerDay: input.hoursPerDay ? Number(input.hoursPerDay) : undefined,
      workingDaysPerYear: input.workingDaysPerYear ? Number(input.workingDaysPerYear) : undefined,
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

// ---- Health Check ----
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

export default router;
