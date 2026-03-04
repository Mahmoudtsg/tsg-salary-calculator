// ============================================================
// Tests for Geneva Withholding Tax Parser & Lookup
// Complete scenario coverage
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  parseTariffFile,
  lookupWithholdingTax,
  determineTariffCode,
  getAvailableTariffCodes,
  clearTariffCache,
} from '../services/withholdingGE';

beforeAll(() => {
  clearTariffCache();
});

// ============================================================
// FILE PARSER
// ============================================================
describe('parseTariffFile', () => {
  it('should parse the tariff file and return a non-empty map', () => {
    const tables = parseTariffFile();
    expect(tables.size).toBeGreaterThan(0);
  });

  it('should contain expected tariff codes', () => {
    const codes = getAvailableTariffCodes();
    expect(codes).toContain('A0N');
    expect(codes).toContain('B2N');
    expect(codes).toContain('C0N');
    expect(codes).toContain('H1N');
  });

  it('should contain cross-border codes', () => {
    const codes = getAvailableTariffCodes();
    expect(codes).toContain('G9N'); // G only has digit 9
    expect(codes).toContain('M0N');
    expect(codes).toContain('P1N');
    expect(codes).toContain('L0N');
    expect(codes).toContain('N0N');
    expect(codes).toContain('Q9N'); // Q only has digit 9
  });

  it('should have sorted brackets for each tariff', () => {
    const tables = parseTariffFile();
    const a0 = tables.get('A0N')!;
    for (let i = 1; i < a0.brackets.length; i++) {
      expect(a0.brackets[i].incomeLowerCHF).toBeGreaterThanOrEqual(a0.brackets[i - 1].incomeLowerCHF);
    }
  });
});

// ============================================================
// TAX LOOKUP
// ============================================================
describe('lookupWithholdingTax', () => {
  it('A0 at 5000 CHF → tax 762 CHF (15.24%)', () => {
    const r = lookupWithholdingTax(5000, 'A0');
    expect(r.taxAmount).toBe(762);
    expect(r.effectiveRate).toBe(15.24);
    expect(r.tariffCode).toBe('A0');
  });

  it('A0 at 10000 CHF → tax 1556 CHF', () => {
    const r = lookupWithholdingTax(10000, 'A0');
    expect(r.taxAmount).toBe(1556);
  });

  it('B0 at 10000 CHF → tax 853 CHF', () => {
    const r = lookupWithholdingTax(10000, 'B0');
    expect(r.taxAmount).toBe(853);
  });

  it('B2 at 10000 CHF → tax 253 CHF (lower due to 2 children)', () => {
    const r = lookupWithholdingTax(10000, 'B2');
    expect(r.taxAmount).toBe(253);
    expect(r.effectiveRate).toBe(2.53);
  });

  it('B3 at 10000 CHF → tax 39 CHF (3 children)', () => {
    const r = lookupWithholdingTax(10000, 'B3');
    expect(r.taxAmount).toBe(39);
  });

  it('should return 0 tax for income below first bracket', () => {
    const r = lookupWithholdingTax(100, 'A0');
    expect(r.taxAmount).toBe(0);
  });

  it('should throw for unknown tariff code', () => {
    expect(() => lookupWithholdingTax(5000, 'Z9')).toThrow('not found');
  });

  it('A0 at 7500 CHF → tax 1233 CHF', () => {
    const r = lookupWithholdingTax(7500, 'A0');
    expect(r.taxAmount).toBe(1233);
    expect(r.effectiveRate).toBe(16.44);
  });

  it('should include tariff description in notes', () => {
    const r = lookupWithholdingTax(5000, 'A0');
    expect(r.notes.some(n => n.includes('Single'))).toBe(true);
  });

  it('should include children note for non-zero digit', () => {
    const r = lookupWithholdingTax(10000, 'B2');
    expect(r.notes.some(n => n.includes('children: 2'))).toBe(true);
  });

  // Cross-border tariff lookups
  it('G9 at 7500 CHF → returns a valid tax (cross-border single)', () => {
    const r = lookupWithholdingTax(7500, 'G9');
    expect(r.taxAmount).toBeGreaterThan(0);
    expect(r.tariffCode).toBe('G9');
  });

  it('M2 at 8000 CHF → returns a valid tax (cross-border married 2 kids)', () => {
    const r = lookupWithholdingTax(8000, 'M2');
    expect(r.taxAmount).toBeGreaterThanOrEqual(0);
    expect(r.tariffCode).toBe('M2');
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
      expect(d.tariffCode).toBe('A2'); // A tariff (not H since no sole custody), digit = children
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
      // Single without sole custody → A3
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

    it('G tariff always digit 9 (regardless of children)', () => {
      const d = determineTariffCode({
        nationality: 'foreign',
        permit: 'G',
        maritalStatus: 'single',
        residence: 'france',
        childrenCount: 2,
      });
      expect(d.tariffCode).toBe('G9');
    });

    it('N tariff includes children digit', () => {
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
  });
});
