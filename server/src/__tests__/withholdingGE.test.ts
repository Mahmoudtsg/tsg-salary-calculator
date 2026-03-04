// ============================================================
// Tests for Geneva Withholding Tax Parser & Lookup
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

  it('should have sorted brackets for each tariff', () => {
    const tables = parseTariffFile();
    const a0 = tables.get('A0N')!;
    for (let i = 1; i < a0.brackets.length; i++) {
      expect(a0.brackets[i].incomeLowerCHF).toBeGreaterThanOrEqual(a0.brackets[i - 1].incomeLowerCHF);
    }
  });
});

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
    // A0 first bracket starts at 2450 CHF; below that, tax = 0
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
});

describe('determineTariffCode', () => {
  it('Swiss national → exempt', () => {
    const d = determineTariffCode({
      nationality: 'swiss',
      maritalStatus: 'single',
      residence: 'geneva',
      childrenCount: 0,
    });
    expect(d.exempt).toBe(true);
    expect(d.tariffCode).toBe('');
  });

  it('C-permit holder → exempt', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'C',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 2,
    });
    expect(d.exempt).toBe(true);
  });

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

  it('B-permit, married, spouse earns, 1 kid → C0 (double earner, digit always 0)', () => {
    const d = determineTariffCode({
      nationality: 'foreign',
      permit: 'B',
      maritalStatus: 'married',
      residence: 'geneva',
      childrenCount: 1,
      spouseHasSwissIncome: true,
    });
    expect(d.tariffCode).toBe('C0');
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
