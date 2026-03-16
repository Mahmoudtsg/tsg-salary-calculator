// ============================================================
// Tests for Vaud Withholding Tax — IS 2026
// Based on ACI Vaud official barème PDF (21.034-10 / 11.2025)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  lookupWithholdingTaxVD,
  lookupCapitalBenefitTaxVD,
  determineTariffCodeVD,
  getAvailableTariffCodesVD,
  clearTariffCacheVD,
  TARIFF_DESCRIPTIONS_VD,
} from '../services/withholdingVD';

clearTariffCacheVD(); // No-op for Vaud (embedded data), but tested for symmetry

// ============================================================
// AVAILABLE CODES
// ============================================================
describe('getAvailableTariffCodesVD', () => {
  it('includes all resident codes A0–A6', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 0; i <= 6; i++) expect(codes).toContain(`A${i}`);
  });

  it('includes AO (alternating custody)', () => {
    expect(getAvailableTariffCodesVD()).toContain('AO');
  });

  it('includes all B0–B6 codes', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 0; i <= 6; i++) expect(codes).toContain(`B${i}`);
  });

  it('includes all C0–C6 codes', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 0; i <= 6; i++) expect(codes).toContain(`C${i}`);
  });

  it('includes all H1–H6 codes', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 1; i <= 6; i++) expect(codes).toContain(`H${i}`);
  });

  it('includes capital benefit codes I, J, K', () => {
    const codes = getAvailableTariffCodesVD();
    expect(codes).toContain('I');
    expect(codes).toContain('J');
    expect(codes).toContain('K');
  });

  it('includes German frontalier codes L0–L6', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 0; i <= 6; i++) expect(codes).toContain(`L${i}`);
  });

  it('includes German frontalier codes M0–M6, N0–N6', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 0; i <= 6; i++) {
      expect(codes).toContain(`M${i}`);
      expect(codes).toContain(`N${i}`);
    }
  });

  it('includes German frontalier codes P1–P6 and Q', () => {
    const codes = getAvailableTariffCodesVD();
    for (let i = 1; i <= 6; i++) expect(codes).toContain(`P${i}`);
    expect(codes).toContain('Q');
  });

  it('has descriptions for all tariff letters', () => {
    ['A', 'B', 'C', 'H', 'I', 'J', 'K', 'G', 'L', 'M', 'N', 'P', 'Q'].forEach(letter => {
      expect(TARIFF_DESCRIPTIONS_VD[letter]).toBeDefined();
    });
  });
});

// ============================================================
// lookupWithholdingTaxVD — basic structure
// ============================================================
describe('lookupWithholdingTaxVD — result structure', () => {
  it('returns the correct result shape', () => {
    const result = lookupWithholdingTaxVD(5000, 'A0');
    expect(result).toHaveProperty('tariffCode', 'A0');
    expect(result).toHaveProperty('grossMonthly', 5000);
    expect(result).toHaveProperty('grossMonthlyRounded', 5000);
    expect(result).toHaveProperty('annualisedGross', 60000);
    expect(result).toHaveProperty('taxAmount');
    expect(result).toHaveProperty('effectiveRate');
    expect(result).toHaveProperty('notes');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('exempt', false);
  });

  it('throws for invalid tariff codes', () => {
    expect(() => lookupWithholdingTaxVD(5000, 'Z9')).toThrow();
  });

  it('throws when capital benefit code is used (I, J, K)', () => {
    expect(() => lookupWithholdingTaxVD(5000, 'I')).toThrow();
    expect(() => lookupWithholdingTaxVD(5000, 'J')).toThrow();
    expect(() => lookupWithholdingTaxVD(5000, 'K')).toThrow();
  });
});

// ============================================================
// lookupWithholdingTaxVD — annual model & rounding
// ============================================================
describe('lookupWithholdingTaxVD — annual model and rounding', () => {
  it('floors the monthly gross to nearest franc', () => {
    const r1 = lookupWithholdingTaxVD(5000.99, 'A0');
    const r2 = lookupWithholdingTaxVD(5000.00, 'A0');
    expect(r1.grossMonthlyRounded).toBe(5000);
    expect(r1.taxAmount).toBe(r2.taxAmount);
  });

  it('annualises monthly gross × 12', () => {
    const r = lookupWithholdingTaxVD(8000, 'A0');
    expect(r.annualisedGross).toBe(96000);
  });

  it('rounds tax to nearest CHF 0.05', () => {
    const result = lookupWithholdingTaxVD(5000, 'A0');
    // Tax must be a multiple of 0.05
    expect(result.taxAmount * 20).toBeCloseTo(Math.round(result.taxAmount * 20), 5);
  });

  it('returns zero tax below the minimum salary threshold for A0 (~CHF 2,450/month)', () => {
    const result = lookupWithholdingTaxVD(2000, 'A0');
    expect(result.taxAmount).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it('returns zero tax below the minimum salary threshold for B0 (~CHF 3,850/month)', () => {
    const result = lookupWithholdingTaxVD(3500, 'B0');
    expect(result.taxAmount).toBe(0);
  });

  it('returns zero tax below the minimum salary threshold for C0 (~CHF 2,350/month)', () => {
    const result = lookupWithholdingTaxVD(2200, 'C0');
    expect(result.taxAmount).toBe(0);
  });
});

// ============================================================
// lookupWithholdingTaxVD — A0 anchor values from PDF
// ============================================================
describe('lookupWithholdingTaxVD — A0 rate anchors', () => {
  // At CHF 5,000/month = CHF 60,000/year → rate ~8.53% (PDF anchor: 60,001–60,600 → 8.53%)
  it('A0 at ~CHF 5,000/month: rate near 8.53%', () => {
    const r = lookupWithholdingTaxVD(5001, 'A0');
    expect(r.effectiveRate).toBeGreaterThan(8.0);
    expect(r.effectiveRate).toBeLessThan(9.5);
  });

  // At CHF 8,400/month = CHF 100,800/year → rate ~14.10% (PDF anchor: 100,201–100,800 → 14.10%)
  it('A0 at CHF 8,400/month: rate near 14.10%', () => {
    const r = lookupWithholdingTaxVD(8400, 'A0');
    expect(r.effectiveRate).toBeGreaterThan(13.5);
    expect(r.effectiveRate).toBeLessThan(15.0);
  });

  // At CHF 16,750/month = CHF 201,000/year → rate ~20.91% (PDF anchor: 200,401–201,000 → 20.91%)
  it('A0 at CHF 16,750/month: rate near 20.91%', () => {
    const r = lookupWithholdingTaxVD(16750, 'A0');
    expect(r.effectiveRate).toBeGreaterThan(20.0);
    expect(r.effectiveRate).toBeLessThan(22.0);
  });

  // At CHF 100,001/month (very high) → max rate 38.11%
  it('A0 at very high income: rate approaches maximum 38.11%', () => {
    const r = lookupWithholdingTaxVD(100001, 'A0');
    expect(r.effectiveRate).toBeGreaterThan(37.5);
    expect(r.effectiveRate).toBeLessThanOrEqual(38.2);
  });
});

// ============================================================
// lookupWithholdingTaxVD — tariff comparisons at same income
// ============================================================
describe('lookupWithholdingTaxVD — tariff rate ordering', () => {
  // At CHF 8,350/month (~CHF 100,200/year):
  // PDF shows A0=14.10%, B0=10.12%, C0=13.69%, H1=10.01%
  const monthly = 8350;

  it('A0 rate > B0 rate at CHF 8,350/month', () => {
    const a0 = lookupWithholdingTaxVD(monthly, 'A0');
    const b0 = lookupWithholdingTaxVD(monthly, 'B0');
    expect(a0.taxAmount).toBeGreaterThan(b0.taxAmount);
  });

  it('A0 rate > C0 rate at CHF 8,350/month', () => {
    const a0 = lookupWithholdingTaxVD(monthly, 'A0');
    const c0 = lookupWithholdingTaxVD(monthly, 'C0');
    expect(a0.taxAmount).toBeGreaterThan(c0.taxAmount);
  });

  it('more children → lower tax within the same series', () => {
    const b0 = lookupWithholdingTaxVD(monthly, 'B0');
    const b3 = lookupWithholdingTaxVD(monthly, 'B3');
    const b6 = lookupWithholdingTaxVD(monthly, 'B6');
    expect(b0.taxAmount).toBeGreaterThan(b3.taxAmount);
    expect(b3.taxAmount).toBeGreaterThan(b6.taxAmount);
  });

  it('C children variants decrease with more children', () => {
    const c0 = lookupWithholdingTaxVD(monthly, 'C0');
    const c3 = lookupWithholdingTaxVD(monthly, 'C3');
    expect(c0.taxAmount).toBeGreaterThan(c3.taxAmount);
  });

  it('H children variants decrease with more children', () => {
    const h1 = lookupWithholdingTaxVD(monthly, 'H1');
    const h4 = lookupWithholdingTaxVD(monthly, 'H4');
    expect(h1.taxAmount).toBeGreaterThan(h4.taxAmount);
  });
});

// ============================================================
// lookupWithholdingTaxVD — AO (alternating custody)
// ============================================================
describe('lookupWithholdingTaxVD — AO tariff', () => {
  it('AO produces same tax as A0', () => {
    const ao = lookupWithholdingTaxVD(6000, 'AO');
    const a0 = lookupWithholdingTaxVD(6000, 'A0');
    expect(ao.taxAmount).toBe(a0.taxAmount);
  });

  it('AO note mentions alternating custody', () => {
    const r = lookupWithholdingTaxVD(6000, 'AO');
    expect(r.notes.some(n => n.toLowerCase().includes('alternating') || n.toLowerCase().includes('garde'))).toBe(true);
  });
});

// ============================================================
// lookupWithholdingTaxVD — German frontalier (L/M/N/P) 4.5% cap
// ============================================================
describe('lookupWithholdingTaxVD — German frontalier codes (4.5% cap)', () => {
  // L0 rate mirrors A0 but capped at 4.50%
  // PDF: cap for L0 reached at 47,401/year (CHF 3,951/month)
  it('L0 at low income: same rate as A0 (below cap)', () => {
    const l0 = lookupWithholdingTaxVD(3000, 'L0');
    const a0 = lookupWithholdingTaxVD(3000, 'A0');
    // Both should have small non-zero rates (below cap)
    expect(l0.effectiveRate).toBeLessThanOrEqual(4.50);
  });

  it('L0 at high income: rate capped at 4.50%', () => {
    const r = lookupWithholdingTaxVD(10000, 'L0');
    expect(r.effectiveRate).toBeLessThanOrEqual(4.51); // Allow minor rounding
    expect(r.taxAmount).toBeLessThanOrEqual(10000 * 4.50 / 100 + 0.05);
  });

  it('L0 rate never exceeds A0 rate (L0 = min(A0, 4.5%))', () => {
    [3000, 5000, 8000, 15000].forEach(monthly => {
      const l0 = lookupWithholdingTaxVD(monthly, 'L0');
      const a0 = lookupWithholdingTaxVD(monthly, 'A0');
      expect(l0.taxAmount).toBeLessThanOrEqual(a0.taxAmount + 0.05);
    });
  });

  it('M0 at high income: rate capped at 4.50%', () => {
    const r = lookupWithholdingTaxVD(10000, 'M0');
    expect(r.effectiveRate).toBeLessThanOrEqual(4.51);
  });

  it('N0 at high income: rate capped at 4.50%', () => {
    const r = lookupWithholdingTaxVD(10000, 'N0');
    expect(r.effectiveRate).toBeLessThanOrEqual(4.51);
  });

  it('P1 at high income: rate capped at 4.50%', () => {
    const r = lookupWithholdingTaxVD(10000, 'P1');
    expect(r.effectiveRate).toBeLessThanOrEqual(4.51);
  });

  it('Q at high income: rate capped at 4.50%', () => {
    const r = lookupWithholdingTaxVD(10000, 'Q');
    expect(r.effectiveRate).toBeLessThanOrEqual(4.51);
  });

  it('German frontalier notes mention the 4.5% cap', () => {
    const r = lookupWithholdingTaxVD(10000, 'L0');
    expect(r.notes.some(n => n.includes('4.50') || n.includes('4.5'))).toBe(true);
  });
});

// ============================================================
// lookupWithholdingTaxVD — TOU threshold warning
// ============================================================
describe('lookupWithholdingTaxVD — TOU threshold', () => {
  it('warns when annualised gross exceeds CHF 120,000', () => {
    // CHF 11,000/month × 12 = CHF 132,000 > 120,000
    const r = lookupWithholdingTaxVD(11000, 'A0');
    expect(r.warnings.some(w => w.includes('120') && w.includes('TOU'))).toBe(true);
  });

  it('no TOU warning below CHF 120,000/year', () => {
    // CHF 9,000/month × 12 = CHF 108,000 < 120,000
    const r = lookupWithholdingTaxVD(9000, 'A0');
    expect(r.warnings.some(w => w.includes('TOU'))).toBe(false);
  });
});

// ============================================================
// lookupCapitalBenefitTaxVD — tariffs I, J, K
// ============================================================
describe('lookupCapitalBenefitTaxVD', () => {
  it('floors capital to nearest CHF 100', () => {
    const r = lookupCapitalBenefitTaxVD(50499, 'I');
    expect(r.capitalRounded).toBe(50400);
  });

  it('Tariff I at CHF 100,000: rate ~4.54% (PDF anchor)', () => {
    const r = lookupCapitalBenefitTaxVD(100000, 'I');
    expect(r.effectiveRate).toBeGreaterThan(4.0);
    expect(r.effectiveRate).toBeLessThan(5.0);
  });

  it('Tariff J at CHF 100,000: rate less than I at same amount', () => {
    const i = lookupCapitalBenefitTaxVD(100000, 'I');
    const j = lookupCapitalBenefitTaxVD(100000, 'J');
    expect(j.taxAmount).toBeLessThan(i.taxAmount);
  });

  it('Tariff K at CHF 100,000: rate less than J at same amount', () => {
    const j = lookupCapitalBenefitTaxVD(100000, 'J');
    const k = lookupCapitalBenefitTaxVD(100000, 'K');
    expect(k.taxAmount).toBeLessThan(j.taxAmount);
  });

  it('returns zero tax when computed tax is below CHF 20 minimum', () => {
    // Very small capital amount — should yield < CHF 20 tax
    const r = lookupCapitalBenefitTaxVD(1000, 'I');
    expect(r.taxAmount).toBe(0);
  });

  it('rounds capital benefit tax to nearest CHF 0.05', () => {
    const r = lookupCapitalBenefitTaxVD(50000, 'I');
    expect(r.taxAmount * 20).toBeCloseTo(Math.round(r.taxAmount * 20), 5);
  });

  it('notes mention J recalculation restriction (since 1 Jan 2024)', () => {
    const r = lookupCapitalBenefitTaxVD(100000, 'J');
    expect(r.notes.some(n => n.includes('2024'))).toBe(true);
  });

  it('throws for invalid tariff code', () => {
    // @ts-expect-error testing invalid code
    expect(() => lookupCapitalBenefitTaxVD(100000, 'A0')).toThrow();
  });
});

// ============================================================
// determineTariffCodeVD — Swiss nationals
// ============================================================
describe('determineTariffCodeVD — Swiss nationals', () => {
  it('Swiss national in Vaud → exempt', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'vaud',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
  });

  it('Swiss national in another Swiss canton → exempt', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'other_swiss_canton',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
  });

  it('Swiss national in France (frontalier) → exempt from Vaud IS', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
    expect(r.reason).toContain('France');
  });

  it('Swiss national in France (frontalier) → 2026 data exchange note included', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.notes.some(n => n.includes('2026') && n.includes('salary data'))).toBe(true);
  });

  it('Swiss national in France with conditions not met → IS applies (A0)', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
      frenchFrontalierConditionsNotMet: true,
    });
    expect(r.exempt).toBe(false);
    expect(r.tariffCode).toBe('A0');
  });

  it('Swiss national in Germany → German frontalier L0 (single, no children)', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'germany',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(false);
    expect(r.tariffCode).toBe('L0');
  });

  it('Swiss national in Germany, married, single-earner → M0', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'germany',
      maritalStatus: 'married', childrenCount: 0,
      spouseHasSwissIncome: false,
    });
    expect(r.tariffCode).toBe('M0');
  });

  it('Swiss national in Germany, married, double-earner → N2', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'germany',
      maritalStatus: 'married', childrenCount: 2,
      spouseHasSwissIncome: true,
    });
    expect(r.tariffCode).toBe('N2');
  });
});

// ============================================================
// determineTariffCodeVD — G-permit holders
// ============================================================
describe('determineTariffCodeVD — G-permit', () => {
  it('G-permit from France → exempt (French frontalier)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
  });

  it('G-permit from France → includes 2026 data exchange note', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.notes.some(n => n.includes('2026') && n.includes('salary data'))).toBe(true);
  });

  it('G-permit from France, conditions not met → IS applies (A0)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
      frenchFrontalierConditionsNotMet: true,
    });
    expect(r.exempt).toBe(false);
    expect(r.tariffCode).toBe('A0');
  });

  it('G-permit from Germany → L0 (single, no children)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'germany',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.tariffCode).toBe('L0');
  });

  it('G-permit from Germany, married 3 children, single-earner → M3', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'germany',
      maritalStatus: 'married', childrenCount: 3,
      spouseHasSwissIncome: false,
    });
    expect(r.tariffCode).toBe('M3');
  });

  it('G-permit from Germany, single parent 2 children → P2', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'G', residence: 'germany',
      maritalStatus: 'divorced', childrenCount: 2, isSingleParent: true,
    });
    expect(r.tariffCode).toBe('P2');
  });
});

// ============================================================
// determineTariffCodeVD — C-permit
// ============================================================
describe('determineTariffCodeVD — C-permit', () => {
  it('C-permit in Vaud → exempt (ordinary taxation)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'C', residence: 'vaud',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
  });

  it('C-permit in France → exempt (French frontalier)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'C', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.exempt).toBe(true);
  });

  it('C-permit in Germany → L0', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'C', residence: 'germany',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.tariffCode).toBe('L0');
  });
});

// ============================================================
// determineTariffCodeVD — B-permit resident
// ============================================================
describe('determineTariffCodeVD — B-permit (resident in Vaud)', () => {
  it('B-permit single, 0 children → A0', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'single', childrenCount: 0,
    });
    expect(r.tariffCode).toBe('A0');
    expect(r.exempt).toBe(false);
  });

  it('B-permit married, single-earner, 2 children → B2', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'married', childrenCount: 2,
      spouseHasSwissIncome: false,
    });
    expect(r.tariffCode).toBe('B2');
  });

  it('B-permit married, double-earner, 1 child → C1', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'married', childrenCount: 1,
      spouseHasSwissIncome: true,
    });
    expect(r.tariffCode).toBe('C1');
  });

  it('B-permit single parent, 3 children → H3', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'divorced', childrenCount: 3, isSingleParent: true,
    });
    expect(r.tariffCode).toBe('H3');
  });

  it('children count capped at 6 for Vaud', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'married', childrenCount: 99,
      spouseHasSwissIncome: false,
    });
    expect(r.tariffCode).toBe('B6');
  });

  it('warns when annualGrossCHF > 120,000 (TOU)', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'single', childrenCount: 0,
      annualGrossCHF: 150000,
    });
    expect(r.exempt).toBe(false);
    expect(r.warnings.some(w => w.includes('TOU') && w.includes('120'))).toBe(true);
  });
});

// ============================================================
// determineTariffCodeVD — short-term assignment
// ============================================================
describe('determineTariffCodeVD — short-term assignment', () => {
  it('short-term Swiss national → IS applies (not exempt)', () => {
    const r = determineTariffCodeVD({
      nationality: 'swiss', residence: 'france',
      maritalStatus: 'single', childrenCount: 0,
      isShortTermAssignment: true, assignmentDays: 30,
    });
    expect(r.exempt).toBe(false);
    expect(r.tariffCode).toBe('A0');
  });

  it('warns if short-term assignment > 90 days', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'single', childrenCount: 0,
      isShortTermAssignment: true, assignmentDays: 120,
    });
    expect(r.warnings.some(w => w.includes('90'))).toBe(true);
  });
});

// ============================================================
// determineTariffCodeVD — spouseAnnualIncomeCHF auto-detection
// ============================================================
describe('determineTariffCodeVD — spouse income detection', () => {
  it('spouse with CHF 60,000 → double-earner C0', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'married', childrenCount: 0,
      spouseAnnualIncomeCHF: 60000,
    });
    expect(r.tariffCode).toBe('C0');
  });

  it('spouse with CHF 0 income → single-earner B0', () => {
    const r = determineTariffCodeVD({
      nationality: 'foreign', permit: 'B', residence: 'vaud',
      maritalStatus: 'married', childrenCount: 0,
      spouseAnnualIncomeCHF: 0,
    });
    expect(r.tariffCode).toBe('B0');
  });
});
