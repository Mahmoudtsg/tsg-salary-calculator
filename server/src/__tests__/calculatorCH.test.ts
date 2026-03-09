// ============================================================
// Unit Tests - Switzerland (CH) Calculation Engine
// LPP age-band plan: 2026 rules
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateCHFromGross,
  calculateCHFromNet,
  calculateCHFromTotalCost,
} from '../services/calculatorCH';

describe('Switzerland (CH) Calculator', () => {
  describe('Forward Calculation (Gross → Net & Total Cost)', () => {
    it('should calculate correctly for 100,000 CHF gross at 100% (age 30)', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 30 });

      expect(result.grossSalaryYearly).toBe(100000);
      expect(result.grossSalaryMonthly).toBeCloseTo(8333.33, 1);
      expect(result.netSalaryYearly).toBeGreaterThan(80000);
      expect(result.netSalaryYearly).toBeLessThan(100000);
      expect(result.totalEmployerCostYearly).toBeGreaterThan(100000);
      expect(result.currency).toBe('CHF');
      expect(result.country).toBe('CH');
    });

    it('should handle AC ceiling for high salaries', () => {
      const result = calculateCHFromGross(200000, 100, { employeeAge: 40 });

      // AC should be capped at 148,200 for main rate
      const acContrib = result.employeeContributions.find(c => c.name === 'AC (Unemployment)');
      expect(acContrib).toBeDefined();
      expect(acContrib!.base).toBe(148200);

      // Should have solidarity AC above ceiling
      const solidarityContrib = result.employeeContributions.find(c => c.name === 'AC Solidarity');
      expect(solidarityContrib).toBeDefined();
      expect(solidarityContrib!.base).toBe(200000 - 148200);
    });

    it('should not include AC solidarity for salary below ceiling', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 30 });
      const solidarityContrib = result.employeeContributions.find(c => c.name === 'AC Solidarity');
      expect(solidarityContrib).toBeUndefined();
    });

    it('should adjust daily rate for occupation rate', () => {
      const full = calculateCHFromGross(100000, 100, { employeeAge: 35 });
      const half = calculateCHFromGross(100000, 50, { employeeAge: 35 });

      // Daily rate at 50% should be ~2x daily rate at 100%
      // because same cost over fewer working days
      expect(half.dailyRate).toBeCloseTo(full.dailyRate * 2, 0);
    });
  });

  // ====== LPP AGE-BAND TESTS ======
  describe('LPP Age-Band Plan', () => {
    it('should apply 0.3% total rate for age 18-24 (risk & costs only)', () => {
      const result = calculateCHFromGross(80000, 100, { employeeAge: 22 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Insured salary = 80000 - 26460 = 53540
      expect(lpp!.base).toBe(53540);
      // Employee gets half of 0.3% = 0.15%
      expect(lpp!.rate).toBeCloseTo(0.0015, 4);
      expect(lpp!.amount).toBeCloseTo(53540 * 0.0015, 0);
    });

    it('should apply 8.4% total rate for age 25-34', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 30 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Insured salary = 100000 - 26460 = 73540
      expect(lpp!.base).toBe(73540);
      // Employee gets half of 8.4% = 4.2%
      expect(lpp!.rate).toBeCloseTo(0.042, 4);
    });

    it('should apply 11.4% total rate for age 35-44', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 40 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Employee gets half of 11.4% = 5.7%
      expect(lpp!.rate).toBeCloseTo(0.057, 4);
    });

    it('should apply 17.4% total rate for age 45-54', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 50 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Employee gets half of 17.4% = 8.7%
      expect(lpp!.rate).toBeCloseTo(0.087, 4);
    });

    it('should apply 20.4% total rate for age 55-65', () => {
      const result = calculateCHFromGross(100000, 100, { employeeAge: 60 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Employee gets half of 20.4% = 10.2%
      expect(lpp!.rate).toBeCloseTo(0.102, 4);
    });

    it('should have no LPP below entry threshold (22,050 CHF)', () => {
      const result = calculateCHFromGross(20000, 100, { employeeAge: 30 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeUndefined();
    });

    it('should cap insured salary at plan ceiling 300,000', () => {
      const result = calculateCHFromGross(400000, 100, { employeeAge: 40 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeDefined();
      // Insured salary = min(400000, 300000) - 26460 = 273540
      expect(lpp!.base).toBe(273540);
    });

    it('should have no LPP for age below 18', () => {
      const result = calculateCHFromGross(80000, 100, { employeeAge: 17 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeUndefined();
    });

    it('should have no LPP for age above 65', () => {
      const result = calculateCHFromGross(80000, 100, { employeeAge: 67 });
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeUndefined();
    });

    it('should have no LPP when employeeAge is not provided', () => {
      const result = calculateCHFromGross(80000, 100, {});
      const lpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(lpp).toBeUndefined();
    });

    it('50/50 split: employee and employer amounts should be equal', () => {
      const result = calculateCHFromGross(120000, 100, { employeeAge: 45 });
      const empLpp = result.employeeContributions.find(c => c.name === 'LPP/BVG (Pension)');
      const errLpp = result.employerContributions.find(c => c.name === 'LPP/BVG (Pension)');
      expect(empLpp).toBeDefined();
      expect(errLpp).toBeDefined();
      expect(empLpp!.amount).toBe(errLpp!.amount);
      expect(empLpp!.rate).toBe(errLpp!.rate);
    });
  });

  describe('Reverse Calculation (Net → Gross)', () => {
    it('should converge: Net → Gross → Net should match', () => {
      const targetNet = 80000;
      const result = calculateCHFromNet(targetNet, 100, { employeeAge: 35 });

      expect(result.netSalaryYearly).toBeCloseTo(targetNet, 0);
      expect(result.grossSalaryYearly).toBeGreaterThan(targetNet);
    });

    it('should converge for small net salaries', () => {
      const targetNet = 30000;
      const result = calculateCHFromNet(targetNet, 100, { employeeAge: 30 });
      expect(result.netSalaryYearly).toBeCloseTo(targetNet, 0);
    });

    it('should converge for large net salaries', () => {
      const targetNet = 200000;
      const result = calculateCHFromNet(targetNet, 100, { employeeAge: 50 });
      expect(result.netSalaryYearly).toBeCloseTo(targetNet, 0);
    });
  });

  describe('Reverse Calculation (Total Cost → Gross)', () => {
    it('should converge: TotalCost → Gross → TotalCost should match', () => {
      const targetCost = 120000;
      const result = calculateCHFromTotalCost(targetCost, 100, { employeeAge: 40 });

      expect(result.totalEmployerCostYearly).toBeCloseTo(targetCost, 0);
      expect(result.grossSalaryYearly).toBeLessThan(targetCost);
    });
  });
});
