// ============================================================
// Tests for Geneva Withholding Tax — Rate-Based Engine
// Using official PDF barème tables (2026) + flat rates
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  lookupWithholdingTax,
  determineTariffCode,
  getAvailableTariffCodes,
  clearTariffCache,
  TARIFF_DESCRIPTIONS,
  MEDIAN_SPOUSE_ANNUAL_INCOME_CHF,
} from '../services/withholdingGE';

beforeAll(() => {
  clearTariffCache();
});

// ============================================================
// TARIFF CODE AVAILABILITY
// ============================================================
describe('getAvailableTariffCodes', () => {
  it('should return all expected progressive codes', () => {
    const codes = getAvailableTariffCodes();
    // ABCH codes
    expect(codes).toContain('A0');
    expect(codes).toContain('A5');
    expect(codes).toContain('B0');
    expect(codes).toContain('B5');
    expect(codes).toContain('C0');
    expect(codes).toContain('C5');
    expect(codes).toContain('H1');
    expect(codes).toContain('H5');
    // G code
    expect(codes).toContain('G9');
  });

  it('should return all flat rate cross-border codes', () => {
    const codes = getAvailableTariffCodes();
    expect(codes).toContain('L0');
    expect(codes).toContain('L5');
    expect(codes).toContain('M0');
    expect(codes).toContain('M5');
    expect(codes).toContain('N0');
    expect(codes).toContain('N5');
    expect(codes).toContain('P1');
    expect(codes).toContain('P5');
    expect(codes).toContain('Q9');
    expect(codes).toContain('E0');
  });

  it('should have descriptions for all tariff letters', () => {
    expect(TARIFF_DESCRIPTIONS['A']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['B']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['C']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['G']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['H']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['L']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['M']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['N']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['P']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['Q']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['E']).toBeDefined();
  });

  it('should include predefined category codes HE, ME, NO', () => {
    const codes = getAvailableTariffCodes();
    expect(codes).toContain('HE');
    expect(codes).toContain('ME');
    expect(codes).toContain('NO');
  });

  it('should have descriptions for HE, ME, NO', () => {
    expect(TARIFF_DESCRIPTIONS['HE']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['ME']).toBeDefined();
    expect(TARIFF_DESCRIPTIONS['NO']).toBeDefined();
  });

  it('MEDIAN_SPOUSE_ANNUAL_INCOME_CHF should be 58750', () => {
    expect(MEDIAN_SPOUSE_ANNUAL_INCOME_CHF).toBe(58_750);
  });
});

// ============================================================
// TAX LOOKUP — PROGRESSIVE TARIFFS (ABCH)
// ============================================================
describe('lookupWithholdingTax — progressive ABCH', () => {

  // ---- A0 (Single, no children) ----
  it('A0 at 5000 CHF → rate 7.62%, tax 381 CHF', () => {
    const r = lookupWithholdingTax(5000, 'A0');
    expect(r.effectiveRate).toBe(7.62);
    expect(r.taxAmount).toBe(381);
    expect(r.tariffCode).toBe('A0');
  });

  it('A0 at 7500 CHF → rate 12.33%, tax 924.75 CHF', () => {
    const r = lookupWithholdingTax(7500, 'A0');
    expect(r.effectiveRate).toBe(12.33);
    expect(r.taxAmount).toBe(924.75);
  });

  it('A0 at 10000 CHF → rate 15.56%, tax 1556 CHF', () => {
    const r = lookupWithholdingTax(10000, 'A0');
    expect(r.effectiveRate).toBe(15.56);
    expect(r.taxAmount).toBe(1556);
  });

  it('A0 at 12000 CHF → rate 17.52%, tax 2102.40 CHF', () => {
    const r = lookupWithholdingTax(12000, 'A0');
    expect(r.effectiveRate).toBe(17.52);
    expect(r.taxAmount).toBe(2102.40);
  });

  // ---- B0 (Married, single-earner, no children) ----
  it('B0 at 10000 CHF → rate 8.53%, tax 853 CHF', () => {
    const r = lookupWithholdingTax(10000, 'B0');
    expect(r.effectiveRate).toBe(8.53);
    expect(r.taxAmount).toBe(853);
  });

  // ---- B2 (Married, single-earner, 2 children) ----
  it('B2 at 10000 CHF → rate 2.53%, tax 253 CHF', () => {
    const r = lookupWithholdingTax(10000, 'B2');
    expect(r.effectiveRate).toBe(2.53);
    expect(r.taxAmount).toBe(253);
    expect(r.notes.some(n => n.includes('children: 2'))).toBe(true);
  });

  // ---- B3 (Married, 3 children) ----
  it('B3 at 10000 CHF → rate 0.39%, tax 39 CHF', () => {
    const r = lookupWithholdingTax(10000, 'B3');
    expect(r.effectiveRate).toBe(0.39);
    expect(r.taxAmount).toBe(39);
  });

  // ---- C0 (Married, double-earner, no children) ----
  it('C0 at 10000 CHF → rate 13.90%', () => {
    const r = lookupWithholdingTax(10000, 'C0');
    expect(r.effectiveRate).toBe(13.90);
    expect(r.taxAmount).toBe(1390);
  });

  // ---- H1 (Single parent, 1 child) ----
  it('H1 at 10000 CHF → rate 6.70%', () => {
    const r = lookupWithholdingTax(10000, 'H1');
    expect(r.effectiveRate).toBe(6.70);
    expect(r.taxAmount).toBe(670);
    expect(r.notes.some(n => n.includes('children: 1'))).toBe(true);
  });

  // ---- Zero / low income ----
  it('should return 0 tax for very low income (below first bracket)', () => {
    const r = lookupWithholdingTax(100, 'A0');
    expect(r.taxAmount).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  // ---- Unknown code ----
  it('should throw for unknown tariff code', () => {
    expect(() => lookupWithholdingTax(5000, 'Z9')).toThrow('not found');
  });

  // ---- Notes ----
  it('should include tariff description in notes', () => {
    const r = lookupWithholdingTax(5000, 'A0');
    expect(r.notes.some(n => n.includes('Single'))).toBe(true);
  });
});

// ============================================================
// TAX LOOKUP — G9 (Cross-border progressive)
// ============================================================
describe('lookupWithholdingTax — G9 (cross-border progressive)', () => {
  it('G9 at 5000 CHF → rate 8.20%, tax 410 CHF', () => {
    const r = lookupWithholdingTax(5000, 'G9');
    expect(r.effectiveRate).toBe(8.20);
    expect(r.taxAmount).toBe(410);
    expect(r.tariffCode).toBe('G9');
  });

  it('G9 at 7500 CHF → rate 9.20%, tax 690 CHF', () => {
    const r = lookupWithholdingTax(7500, 'G9');
    expect(r.effectiveRate).toBe(9.20);
    expect(r.taxAmount).toBe(690);
  });

  it('G9 at 10000 CHF → rate 10.49%, tax 1049 CHF', () => {
    const r = lookupWithholdingTax(10000, 'G9');
    expect(r.effectiveRate).toBe(10.49);
    expect(r.taxAmount).toBe(1049);
  });

  it('G9 at 12000 CHF → rate 11.61%, tax 1393.20 CHF', () => {
    const r = lookupWithholdingTax(12000, 'G9');
    expect(r.effectiveRate).toBe(11.61);
    expect(r.taxAmount).toBe(1393.2);
  });
});

// ============================================================
// TAX LOOKUP — FLAT RATE CODES (L/M/N/P/Q/E)
// ============================================================
describe('lookupWithholdingTax — flat rate codes', () => {
  it('M2 at 10000 CHF → flat 4.50%, tax 450 CHF', () => {
    const r = lookupWithholdingTax(10000, 'M2');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(450);
    expect(r.tariffCode).toBe('M2');
    expect(r.notes.some(n => n.includes('Flat rate'))).toBe(true);
    expect(r.notes.some(n => n.includes('children: 2'))).toBe(true);
  });

  it('N0 at 8000 CHF → flat 4.50%, tax 360 CHF', () => {
    const r = lookupWithholdingTax(8000, 'N0');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(360);
  });

  it('P1 at 7500 CHF → flat 4.50%, tax 337.50 CHF', () => {
    const r = lookupWithholdingTax(7500, 'P1');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(337.50);
  });

  it('L0 at 5000 CHF → flat 4.50%, tax 225 CHF', () => {
    const r = lookupWithholdingTax(5000, 'L0');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(225);
  });

  it('L2 at 6000 CHF → flat 4.50%, tax 270 CHF', () => {
    const r = lookupWithholdingTax(6000, 'L2');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(270);
  });

  it('Q9 at 10000 CHF → flat 4.50%, tax 450 CHF', () => {
    const r = lookupWithholdingTax(10000, 'Q9');
    expect(r.effectiveRate).toBe(4.50);
    expect(r.taxAmount).toBe(450);
  });

  it('E0 at 10000 CHF → flat 5.00%, tax 500 CHF', () => {
    const r = lookupWithholdingTax(10000, 'E0');
    expect(r.effectiveRate).toBe(5.00);
    expect(r.taxAmount).toBe(500);
  });

  it('flat rate codes have no bracket (bracketFrom=0, bracketTo=0)', () => {
    const r = lookupWithholdingTax(10000, 'M2');
    expect(r.bracketFrom).toBe(0);
    expect(r.bracketTo).toBe(0);
  });
});

// ============================================================
// TARIFF DETERMINATION — ALL SCENARIOS
// ============================================================
describe('determineTariffCode', () => {

  // ──────────────────────────────────────────
  // EXEMPT CASES
  // ──────────────────────────────────────────

  describe('EXEMPT: Swiss national in Switzerland', () => {
    it('Swiss + Geneva → exempt', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(true);
      expect(d.tariffCode).toBe('');
    });

    it('Swiss + other Swiss canton → exempt', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'married',
        residence: 'other_swiss_canton',
        childrenCount: 2,
      });
      expect(d.exempt).toBe(true);
    });
  });

  describe('EXEMPT: C-permit in Switzerland', () => {
    it('C-permit + Geneva → exempt', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'C',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 2,
      });
      expect(d.exempt).toBe(true);
    });

    it('C-permit + other canton → exempt', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'C',
        maritalStatus: 'single',
        residence: 'other_swiss_canton',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // SUBJECT: Swiss living abroad (frontalier)
  // ──────────────────────────────────────────

  describe('SUBJECT: Swiss national living abroad (cross-border)', () => {
    it('Swiss + France + single → G9 (cross-border single)', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('G9');
      expect(d.notes.some(n => n.toLowerCase().includes('cross-border') || n.toLowerCase().includes('frontalier'))).toBe(true);
    });

    it('Swiss + France + married, no spouse income, 2 kids → M2', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 2,
        spouseHasSwissIncome: false,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('M2');
    });

    it('Swiss + France + married, spouse has Swiss income, 1 kid → N1', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 1,
        spouseHasSwissIncome: true,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('N1');
    });

    it('Swiss + France + single parent, 1 kid → P1', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'divorced',
        residence: 'france',
        childrenCount: 1,
        isSingleParent: true,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('P1');
    });

    it('Swiss + other abroad + single → G9', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'other_abroad',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('G9');
    });

    it('includes Franco-Swiss agreement note when residence is France', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.notes.some(n => n.includes('France') || n.includes('Franco-Swiss'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // SUBJECT: C-permit living abroad
  // ──────────────────────────────────────────

  describe('SUBJECT: C-permit living abroad', () => {
    it('C-permit + France + single → G9', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'C',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('G9');
      expect(d.notes.some(n => n.includes('C-permit') && n.includes('abroad'))).toBe(true);
    });

    it('C-permit + other abroad + married, 3 kids → M3', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'C',
        maritalStatus: 'married',
        residence: 'other_abroad',
        childrenCount: 3,
        spouseHasSwissIncome: false,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('M3');
    });
  });

  // ──────────────────────────────────────────
  // SUBJECT: G-permit (frontalier)
  // ──────────────────────────────────────────

  describe('SUBJECT: G-permit (cross-border worker)', () => {
    it('G-permit + France + single → G9', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('G9');
    });

    it('G-permit + France + married, single earner, 2 kids → M2', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 2,
        spouseHasSwissIncome: false,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('M2');
    });

    it('G-permit + France + married, double earner, 0 kids → N0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 0,
        spouseHasSwissIncome: true,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('N0');
    });

    it('G-permit + France + single parent, 3 kids → P3', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'divorced',
        residence: 'france',
        childrenCount: 3,
        isSingleParent: true,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('P3');
    });

    it('G-permit living in Switzerland → warning about unusual situation', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.warnings.length).toBeGreaterThan(0);
      expect(d.warnings.some(w => w.includes('G-permit'))).toBe(true);
    });

    it('includes Franco-Swiss agreement note for France residence', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.notes.some(n => n.includes('Franco-Swiss') || n.includes('France'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // SUBJECT: B-permit in Switzerland
  // ──────────────────────────────────────────

  describe('SUBJECT: B-permit in Switzerland', () => {
    it('B-permit, single, no kids → A0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.tariffCode).toBe('A0');
      expect(d.exempt).toBe(false);
    });

    it('B-permit, married, single earner, 2 kids → B2', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 2,
        spouseHasSwissIncome: false,
      });
      expect(d.tariffCode).toBe('B2');
    });

    it('B-permit, married, spouse earns, 1 kid → C1', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 1,
        spouseHasSwissIncome: true,
      });
      expect(d.tariffCode).toBe('C1');
    });

    it('single parent with 1 kid → H1', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'divorced',
        residence: 'geneva',
        childrenCount: 1,
        isSingleParent: true,
      });
      expect(d.tariffCode).toBe('H1');
    });

    it('caps children at 5', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 8,
      });
      expect(d.tariffCode).toBe('B5');
    });
  });

  // ──────────────────────────────────────────
  // SUBJECT: L-permit
  // ──────────────────────────────────────────

  describe('SUBJECT: L-permit', () => {
    it('L-permit in Switzerland, single → A0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'L',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('A0');
    });

    it('L-permit abroad → L0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'L',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('L0');
    });

    it('L-permit abroad, married, 2 kids → L2', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'L',
        maritalStatus: 'married',
        residence: 'other_abroad',
        childrenCount: 2,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('L2');
    });
  });

  // ──────────────────────────────────────────
  // 120k TOU THRESHOLD
  // ──────────────────────────────────────────

  describe('TOU threshold (> 120,000 CHF annual gross)', () => {
    it('B-permit with annual > 120k → warning about TOU', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
        annualGrossCHF: 150000,
      });
      expect(d.exempt).toBe(false); // Still subject to IS (IS is withheld)
      expect(d.warnings.some(w => w.includes('120') || w.includes('TOU'))).toBe(true);
      expect(d.tariffCode).toBe('A0');
    });

    it('B-permit with annual < 120k → no TOU warning', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
        annualGrossCHF: 100000,
      });
      expect(d.warnings.every(w => !w.includes('TOU'))).toBe(true);
    });

    it('B-permit with annual exactly 120k → no TOU warning (> not >=)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
        annualGrossCHF: 120000,
      });
      expect(d.warnings.every(w => !w.includes('TOU'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // SHORT-TERM ASSIGNMENT (< 90 days)
  // ──────────────────────────────────────────

  describe('Short-term assignment (< 90 days)', () => {
    it('short-term, single → subject, A0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
        isShortTermAssignment: true,
        assignmentDays: 45,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('A0');
    });

    it('short-term Swiss national → still subject (IS at source)', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
        isShortTermAssignment: true,
        assignmentDays: 30,
      });
      expect(d.exempt).toBe(false);
    });

    it('short-term, married, 2 kids → B2', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        maritalStatus: 'married',
        residence: 'other_abroad',
        childrenCount: 2,
        isShortTermAssignment: true,
        assignmentDays: 60,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('B2');
    });

    it('short-term > 90 days → warning about permit requirement', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
        isShortTermAssignment: true,
        assignmentDays: 120,
      });
      expect(d.warnings.some(w => w.includes('90') || w.includes('permit'))).toBe(true);
    });

    it('short-term ≤ 90 days → no warning about permit', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
        isShortTermAssignment: true,
        assignmentDays: 45,
      });
      expect(d.warnings.every(w => !w.includes('90-day threshold'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // OTHER PERMITS
  // ──────────────────────────────────────────

  describe('Other permits (F, N)', () => {
    it('F-permit in Geneva, single → A0', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'F',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('A0');
    });

    it('N-permit in Geneva, married, 1 kid → B1', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'N',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 1,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('B1');
    });

    it('Foreign with B-permit living abroad → cross-border G9 + warning', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.exempt).toBe(false);
      expect(d.tariffCode).toBe('G9');
      expect(d.warnings.some(w => w.includes('unusual') || w.includes('G-permit'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // EDGE CASES
  // ──────────────────────────────────────────

  describe('Edge cases', () => {
    it('widowed, 1 child, single parent → H1', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'widowed',
        residence: 'geneva',
        childrenCount: 1,
        isSingleParent: true,
      });
      expect(d.tariffCode).toBe('H1');
    });

    it('separated, 3 kids, single parent → H3', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'separated',
        residence: 'geneva',
        childrenCount: 3,
        isSingleParent: true,
      });
      expect(d.tariffCode).toBe('H3');
    });

    it('divorced, 2 kids, NOT single parent → A2 (A tariff with children, not H)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'divorced',
        residence: 'geneva',
        childrenCount: 2,
        isSingleParent: false,
      });
      expect(d.tariffCode).toBe('A2');
    });

    it('children > 5 capped at 5', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 8,
      });
      expect(d.tariffCode).toBe('B5');
    });

    it('A tariff includes children digit', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 3,
      });
      expect(d.tariffCode).toBe('A3');
    });

    it('C tariff includes children digit', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'married',
        residence: 'geneva',
        childrenCount: 3,
        spouseHasSwissIncome: true,
      });
      expect(d.tariffCode).toBe('C3');
    });

    it('G tariff always G9 for single (regardless of children)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 2,
      });
      // Single cross-border → G9 (no M/N/P applies for single non-parent)
      expect(d.tariffCode).toBe('G9');
    });

    it('N tariff includes children digit for married double-earner cross-border', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 3,
        spouseHasSwissIncome: true,
      });
      expect(d.tariffCode).toBe('N3');
    });

    it('cross-border children capped at 5', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 8,
        spouseHasSwissIncome: false,
      });
      expect(d.tariffCode).toBe('M5');
    });
  });

  // ──────────────────────────────────────────
  // COMBINED SCENARIOS (determination + lookup)
  // ──────────────────────────────────────────

  describe('End-to-end: determination + tax lookup', () => {
    it('Swiss in France, single, 7500 CHF → G9, 690 CHF tax (9.20%)', () => {
      const d = determineTariffCode({
        nationality: 'swiss',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 0,
      });
      expect(d.tariffCode).toBe('G9');
      const r = lookupWithholdingTax(7500, d.tariffCode);
      expect(r.taxAmount).toBe(690);
      expect(r.effectiveRate).toBe(9.20);
    });

    it('G-permit, married, 2 kids, France, 10000 CHF → M2, 450 CHF tax (4.50%)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 2,
        spouseHasSwissIncome: false,
      });
      expect(d.tariffCode).toBe('M2');
      const r = lookupWithholdingTax(10000, d.tariffCode);
      expect(r.taxAmount).toBe(450);
      expect(r.effectiveRate).toBe(4.50);
    });

    it('B-permit, single, Geneva, 10000 CHF → A0, 1556 CHF tax (15.56%)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'B',
        maritalStatus: 'single',
        residence: 'geneva',
        childrenCount: 0,
      });
      expect(d.tariffCode).toBe('A0');
      const r = lookupWithholdingTax(10000, d.tariffCode);
      expect(r.taxAmount).toBe(1556);
      expect(r.effectiveRate).toBe(15.56);
    });

    it('L-permit abroad, married, 2 kids, 8000 CHF → L2, 360 CHF tax (4.50%)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'L',
        maritalStatus: 'married',
        residence: 'france',
        childrenCount: 2,
      });
      expect(d.tariffCode).toBe('L2');
      const r = lookupWithholdingTax(8000, d.tariffCode);
      expect(r.taxAmount).toBe(360);
      expect(r.effectiveRate).toBe(4.50);
    });
  });
});

// ============================================================
// PREDEFINED CATEGORY CODES — HE / ME / NO (type 11 records)
// Source: tar26ge.txt records 1101GEHEN=25%, 1101GEMEN=31.5%, 1101GENON=0%
// ============================================================
describe('lookupWithholdingTax — predefined category codes (HE / ME / NO)', () => {
  it('HE at 10000 CHF → flat 25%, tax 2500 CHF (board member)', () => {
    const r = lookupWithholdingTax(10000, 'HE');
    expect(r.effectiveRate).toBe(25.00);
    expect(r.taxAmount).toBe(2500);
    expect(r.tariffCode).toBe('HE');
    expect(r.notes.some(n => n.includes('HE'))).toBe(true);
    expect(r.notes.some(n => n.includes('25%') || n.toLowerCase().includes('flat rate'))).toBe(true);
  });

  it('HE at 5000 CHF → flat 25%, tax 1250 CHF', () => {
    const r = lookupWithholdingTax(5000, 'HE');
    expect(r.effectiveRate).toBe(25.00);
    expect(r.taxAmount).toBe(1250);
  });

  it('ME at 10000 CHF → flat 31.5%, tax 3150 CHF (employee participations)', () => {
    const r = lookupWithholdingTax(10000, 'ME');
    expect(r.effectiveRate).toBe(31.50);
    expect(r.taxAmount).toBe(3150);
    expect(r.tariffCode).toBe('ME');
    expect(r.notes.some(n => n.includes('ME'))).toBe(true);
  });

  it('ME at 8000 CHF → flat 31.5%, tax 2520 CHF', () => {
    const r = lookupWithholdingTax(8000, 'ME');
    expect(r.effectiveRate).toBe(31.50);
    expect(r.taxAmount).toBe(2520);
  });

  it('NO at 10000 CHF → flat 0%, tax 0 CHF (non-taxable correction)', () => {
    const r = lookupWithholdingTax(10000, 'NO');
    expect(r.effectiveRate).toBe(0.00);
    expect(r.taxAmount).toBe(0);
    expect(r.tariffCode).toBe('NO');
    expect(r.notes.some(n => n.includes('NO'))).toBe(true);
  });

  it('HE description should not mention single parent (H tariff confusion check)', () => {
    const r = lookupWithholdingTax(10000, 'HE');
    expect(r.notes.every(n => !n.toLowerCase().includes('single parent'))).toBe(true);
  });
});

// ============================================================
// MEDIAN SPOUSE INCOME — B vs C / M vs N auto-determination
// Median threshold: CHF 58,750/year (type 13 record from tar26ge.txt)
// ============================================================
describe('determineTariffCode — median spouse income (spouseAnnualIncomeCHF)', () => {
  it('married B-permit, spouse income CHF 70,000 (> median) → C0 (double-earner)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 70_000,
    });
    expect(d.tariffCode).toBe('C0');
    expect(d.notes.some(n => n.includes('double-earner'))).toBe(true);
  });

  it('married B-permit, spouse income CHF 40,000 (< median) → B0 (single-earner)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 40_000,
    });
    expect(d.tariffCode).toBe('B0');
    expect(d.notes.some(n => n.includes('single-earner'))).toBe(true);
  });

  it('married B-permit, spouse income exactly CHF 58,750 (= median) → B0 (not above median)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 58_750,
    });
    expect(d.tariffCode).toBe('B0');
  });

  it('married B-permit, spouse income CHF 58,751 (just above median) → C0', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 2,
      spouseAnnualIncomeCHF: 58_751,
    });
    expect(d.tariffCode).toBe('C2');
  });

  it('married G-permit, spouse income CHF 70,000 (> median) → N0 (cross-border double-earner)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'G',
      maritalStatus: 'married',
      residence: 'france',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 70_000,
    });
    expect(d.tariffCode).toBe('N0');
    expect(d.notes.some(n => n.includes('double-earner'))).toBe(true);
  });

  it('married G-permit, spouse income CHF 30,000 (< median) → M0 (cross-border single-earner)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'G',
      maritalStatus: 'married',
      residence: 'france',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 30_000,
    });
    expect(d.tariffCode).toBe('M0');
    expect(d.notes.some(n => n.includes('single-earner'))).toBe(true);
  });

  it('spouseAnnualIncomeCHF note includes the median threshold value', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 60_000,
    });
    expect(d.notes.some(n => n.includes('58,750') || n.includes('58750'))).toBe(true);
  });

  it('spouseAnnualIncomeCHF ignored for non-married (single person)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'single',
      residence: 'geneva',
      childrenCount: 0,
      spouseAnnualIncomeCHF: 70_000,
    });
    // Single person → A tariff, not C
    expect(d.tariffCode).toBe('A0');
  });

  it('when spouseAnnualIncomeCHF not provided, falls back to spouseHasSwissIncome boolean', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 1,
      spouseHasSwissIncome: true,
    });
    expect(d.tariffCode).toBe('C1');
  });
});
