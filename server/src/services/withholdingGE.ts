// ============================================================
// Geneva Withholding Tax (Impôt à la source) - Rate Engine
// Uses the official Geneva cantonal barème rate tables (2026)
//
// Data sources:
//   - baremes_ABCH_2026.json: PDF-extracted rate tables for A/B/C/H tariffs
//   - bareme_G_2026.json: PDF-extracted rate table for G tariff
//   - Flat rates: L/M/N/P/Q = 4.50%, E = 5.00% (from tar26ge.txt / directives)
//
// The barème tables provide TAX RATES (%) for each income bracket.
// Tax = Monthly Gross × Rate%
// ============================================================

import fs from 'fs';
import path from 'path';

// ---- Types ----

export interface RateBracket {
  monthly_from: number;
  monthly_to: number;
  [tariffCode: string]: number; // Rate % for each tariff code
}

export interface WithholdingResult {
  tariffCode: string;
  church: string;
  grossMonthly: number;
  taxAmount: number;
  effectiveRate: number;
  bracketFrom: number;
  bracketTo: number;
  notes: string[];
  warnings: string[];
  exempt: boolean;
  reason?: string;
}

// Median spouse annual income threshold (Geneva 2026 — type 13 record)
// If the secondary spouse earns ≤ this amount, the household is treated
// as single-earner (barème B / M), not double-earner (barème C / N).
export const MEDIAN_SPOUSE_ANNUAL_INCOME_CHF = 58_750;

// ---- Barème code descriptions ----
export const TARIFF_DESCRIPTIONS: Record<string, string> = {
  // Standard tariff letters (A–Q)
  A: 'Single / widowed / divorced / separated',
  B: 'Married, single-earner household',
  C: 'Married, double-earner household (both spouses have Swiss income)',
  E: 'Simplified procedure (LTN) / small jobs / domestic staff',
  G: 'Cross-border worker – single / divorced / widowed / separated (all situations)',
  H: 'Single parent with children (famille monoparentale)',
  L: 'L-permit holder living abroad (short-term cross-border)',
  M: 'Cross-border – married, single-earner household',
  N: 'Cross-border – married, double-earner household',
  P: 'Cross-border – single parent with children',
  Q: 'Cross-border – secondary activity',
  // Predefined category codes (type 11 — special fixed rates)
  HE: 'Administrative board members / administrators residing abroad (flat 25%)',
  ME: 'Employee participations / equity compensation (stock options, RSUs, etc.) (flat 31.5%)',
  NO: 'Non-source-taxed correction — zero-rate adjustment (flat 0%)',
};

// ═══════════════════════════════════════════════════════════════
// Tariff code definitions
// ═══════════════════════════════════════════════════════════════

// Progressive tariff codes (income-dependent rates from PDF tables)
const ABCH_CODES = [
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
  'B0', 'B1', 'B2', 'B3', 'B4', 'B5',
  'C0', 'C1', 'C2', 'C3', 'C4', 'C5',
  'H1', 'H2', 'H3', 'H4', 'H5',
];

// G9 is the only G code — progressive rates from the G PDF
const G_CODES = ['G9'];

// Flat rate codes: same rate regardless of income
// Source: tar26ge.txt / official directives 2026
const FLAT_RATE_CODES: Record<string, number> = {
  // L-permit living abroad (short-term cross-border)
  L0: 4.50, L1: 4.50, L2: 4.50, L3: 4.50, L4: 4.50, L5: 4.50,
  // M: Cross-border married, single-earner
  M0: 4.50, M1: 4.50, M2: 4.50, M3: 4.50, M4: 4.50, M5: 4.50,
  // N: Cross-border married, double-earner
  N0: 4.50, N1: 4.50, N2: 4.50, N3: 4.50, N4: 4.50, N5: 4.50,
  // P: Cross-border single parent (starts at 1)
  P1: 4.50, P2: 4.50, P3: 4.50, P4: 4.50, P5: 4.50,
  // Q: Cross-border secondary activity
  Q9: 4.50,
  // E: Simplified procedure (LTN)
  E0: 5.00,
  // ── Predefined category codes (type 11 records from tar26ge.txt) ──
  // These apply to special income types, not regular employment income.
  // Source: 1101GEHEN = 25%, 1101GEMEN = 31.5%, 1101GENON = 0%
  HE: 25.00,  // Administrative board members / administrators residing abroad
  ME: 31.50,  // Employee participations (stock options, RSUs, bonuses in equity)
  NO:  0.00,  // Non-source-taxed correction (used to offset IS on exempt income)
};

// All valid codes
const ALL_CODES = [...ABCH_CODES, ...G_CODES, ...Object.keys(FLAT_RATE_CODES)];

// ---- Cache ----
let abchCache: RateBracket[] | null = null;
let gCache: RateBracket[] | null = null;

/**
 * Load the A/B/C/H rate table from JSON
 */
function loadABCH(): RateBracket[] {
  if (abchCache) return abchCache;
  const file = path.join(__dirname, '../../data/baremes_ABCH_2026.json');
  const raw = fs.readFileSync(file, 'utf-8');
  abchCache = JSON.parse(raw) as RateBracket[];
  return abchCache;
}

/**
 * Load the G rate table from JSON
 */
function loadG(): RateBracket[] {
  if (gCache) return gCache;
  const file = path.join(__dirname, '../../data/bareme_G_2026.json');
  const raw = fs.readFileSync(file, 'utf-8');
  gCache = JSON.parse(raw) as RateBracket[];
  return gCache;
}

/**
 * Get all available tariff codes
 */
export function getAvailableTariffCodes(): string[] {
  return [...ALL_CODES];
}

/**
 * Look up the rate bracket for a given monthly gross.
 * Returns the last bracket where monthly_from <= grossMonthly.
 */
function findBracket(brackets: RateBracket[], grossMonthly: number): RateBracket | null {
  let matched: RateBracket | null = null;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (brackets[i].monthly_from <= grossMonthly) {
      matched = brackets[i];
      break;
    }
  }
  return matched;
}

/**
 * Look up the withholding tax for a given monthly gross and tariff code.
 *
 * Uses the official Geneva barème rate tables (PDF-extracted).
 * The rate (%) is applied to the monthly gross to compute the tax amount.
 *
 * @param grossMonthly - Monthly gross salary in CHF
 * @param tariffCode - e.g. "A0", "B2", "G9", "M2", "L0", "H1"
 * @param church - "N" (default) or "Y" — note: church tax is not separately
 *                 encoded in these rate tables (the rates already include
 *                 cantonal + communal + federal components)
 */
export function lookupWithholdingTax(
  grossMonthly: number,
  tariffCode: string,
  church: string = 'N'
): WithholdingResult {
  const notes: string[] = [];
  const warnings: string[] = [];

  // Validate tariff code
  if (!ALL_CODES.includes(tariffCode)) {
    throw new Error(
      `Tariff code "${tariffCode}" not found. Available codes: ${ALL_CODES.join(', ')}`
    );
  }

  // ──────────────────────────────
  // FLAT RATE codes (L, M, N, P, Q, E)
  // ──────────────────────────────
  if (tariffCode in FLAT_RATE_CODES) {
    const rate = FLAT_RATE_CODES[tariffCode];
    const taxAmount = Math.round(grossMonthly * rate / 100 * 100) / 100;
    const effectiveRate = Math.round(rate * 100) / 100;

    const descKey = TARIFF_DESCRIPTIONS[tariffCode] ? tariffCode : tariffCode.charAt(0);
    if (TARIFF_DESCRIPTIONS[descKey]) {
      notes.push(`Tariff ${descKey}: ${TARIFF_DESCRIPTIONS[descKey]}`);
    }
    notes.push(`Flat rate tariff: ${rate}% applied to all income levels.`);

    // Child count from digit
    if (tariffCode.length >= 2) {
      const childDigit = tariffCode.charAt(1);
      if (childDigit !== '0' && childDigit >= '1' && childDigit <= '5') {
        notes.push(`Number of children: ${childDigit}`);
      }
    }

    return {
      tariffCode,
      church,
      grossMonthly,
      taxAmount,
      effectiveRate,
      bracketFrom: 0,
      bracketTo: 0, // Flat rate has no brackets
      notes,
      warnings,
      exempt: false,
    };
  }

  // ──────────────────────────────
  // PROGRESSIVE codes
  // ──────────────────────────────

  // Determine which table and rate key to use
  const isGTariff = tariffCode === 'G9';
  const brackets = isGTariff ? loadG() : loadABCH();
  // In the G table, the key is 'G'; in ABCH table, the key matches the code (e.g., 'A0', 'B2')
  const rateKey = isGTariff ? 'G' : tariffCode;

  // Find the matching bracket
  const bracket = findBracket(brackets, grossMonthly);

  if (!bracket) {
    return {
      tariffCode,
      church,
      grossMonthly,
      taxAmount: 0,
      effectiveRate: 0,
      bracketFrom: 0,
      bracketTo: brackets.length > 0 ? brackets[0].monthly_from : 0,
      notes: ['Income falls below the first taxable bracket — no withholding tax.'],
      warnings: [],
      exempt: false,
    };
  }

  // Get the rate for this tariff code
  const rate = (bracket[rateKey] as number) || 0;

  // Compute tax: Monthly Gross × Rate%
  const taxAmount = Math.round(grossMonthly * rate / 100 * 100) / 100; // Round to 2 decimals
  const effectiveRate = Math.round(rate * 100) / 100; // Already a rate, just clean rounding

  const bracketFrom = bracket.monthly_from;
  const bracketTo = bracket.monthly_to;

  // Check if income exceeds the highest bracket
  const lastBracket = brackets[brackets.length - 1];
  if (grossMonthly > lastBracket.monthly_to) {
    notes.push(
      `Income ${grossMonthly.toLocaleString()} CHF exceeds the tariff table maximum ` +
      `(${lastBracket.monthly_to.toLocaleString()} CHF). Using the highest bracket rate.`
    );
  }

  // Add tariff description
  const letter = tariffCode.charAt(0);
  const descKey = TARIFF_DESCRIPTIONS[tariffCode] ? tariffCode : letter;
  if (TARIFF_DESCRIPTIONS[descKey]) {
    notes.push(`Tariff ${descKey}: ${TARIFF_DESCRIPTIONS[descKey]}`);
  }

  // Child count from digit (for non-G9 codes)
  if (tariffCode.length >= 2 && tariffCode !== 'G9') {
    const childDigit = tariffCode.charAt(1);
    if (childDigit !== '0' && childDigit >= '1' && childDigit <= '5') {
      notes.push(`Number of children: ${childDigit}`);
    }
  }

  return {
    tariffCode,
    church,
    grossMonthly,
    taxAmount,
    effectiveRate,
    bracketFrom,
    bracketTo,
    notes,
    warnings,
    exempt: false,
  };
}


// ═══════════════════════════════════════════════════════════════
// Tariff Code Determination
// ═══════════════════════════════════════════════════════════════

export interface DeterminationInput {
  nationality: 'swiss' | 'foreign';
  permit?: string;               // "B", "C", "L", "G", "F", "N", etc.
  residence: 'geneva' | 'other_swiss_canton' | 'france' | 'other_abroad';
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'separated';
  childrenCount: number;
  isSingleParent?: boolean;
  spouseHasSwissIncome?: boolean;
  // If provided, compared against MEDIAN_SPOUSE_ANNUAL_INCOME_CHF (CHF 58,750)
  // to automatically determine single-earner (B/M) vs double-earner (C/N) tariff.
  // Takes precedence over spouseHasSwissIncome when set.
  spouseAnnualIncomeCHF?: number;
  annualGrossCHF?: number;       // For the 120k threshold check
  isShortTermAssignment?: boolean;
  assignmentDays?: number;
}

export interface DeterminationResult {
  tariffCode: string;
  notes: string[];
  warnings: string[];
  exempt: boolean;
  reason?: string;
}

/**
 * Determine the withholding tax tariff code based on personal situation.
 *
 * Complete Geneva IS determination rules (Art. 83-86 LIFD, Art. 35-37 LIPP GE):
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHO IS SUBJECT TO IS (impôt à la source)?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. FOREIGN nationals WITHOUT C-permit, living in Switzerland
 *    → B, L, F, N permit holders → standard IS (A/B/C/H tariffs)
 *
 * 2. FOREIGN nationals WITH G-permit (cross-border / frontalier)
 *    → Living abroad, working in Geneva → cross-border tariff (G9/M/N/P)
 *
 * 3. SWISS nationals living ABROAD and commuting to Geneva
 *    → Same treatment as cross-border workers → tariffs (G9/M/N/P)
 *
 * 4. C-permit holders living ABROAD
 *    → Subject to IS (lose ordinary taxation when leaving Switzerland)
 *    → tariffs (G9/M/N/P) for cross-border
 *
 * 5. SHORT-TERM assignments (< 90 days, no permit)
 *    → Subject to IS at source, standard A/B/H tariffs
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHO IS EXEMPT from IS?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. SWISS nationals living in Switzerland → ordinary taxation
 * 2. C-permit holders living in Switzerland → ordinary taxation
 * 3. B-permit holders earning > 120,000 CHF/year in Geneva
 *    → Switched to TOU (still withheld but year-end ordinary assessment)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TARIFF CODES (from official Geneva 2026 barème PDFs + tar26ge.txt)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Resident in Switzerland (barèmes A/B/C/H) — progressive rates:
 *   A0-A5   = Single / divorced / widowed / separated, 0-5 children
 *   B0-B5   = Married single-earner, 0-5 children
 *   C0-C5   = Married double-earner, 0-5 children
 *   H1-H5   = Single parent, 1-5 children
 *
 * Cross-border (barème G) — progressive rates:
 *   G9      = Cross-border single / divorced (the only G code in Geneva 2026)
 *
 * Cross-border (flat rate: 4.50%):
 *   M0-M5   = Cross-border married, single-earner, 0-5 children
 *   N0-N5   = Cross-border married, double-earner, 0-5 children
 *   P1-P5   = Cross-border single parent, 1-5 children
 *   L0-L5   = L-permit living abroad, 0-5 children
 *   Q9      = Cross-border secondary activity
 *
 * Special:
 *   E0      = Simplified procedure (LTN), flat 5.00%
 */
export function determineTariffCode(params: DeterminationInput): DeterminationResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const {
    nationality,
    permit,
    residence,
    maritalStatus,
    childrenCount,
    isSingleParent,
    spouseHasSwissIncome,
    spouseAnnualIncomeCHF,
    annualGrossCHF,
    isShortTermAssignment,
    assignmentDays,
  } = params;

  const permitUpper = (permit || '').toUpperCase();
  const livesInSwitzerland = residence === 'geneva' || residence === 'other_swiss_canton';
  const livesAbroad = residence === 'france' || residence === 'other_abroad';
  const kids = Math.min(Math.max(childrenCount || 0, 0), 5);

  // ── Median-based B vs C / M vs N determination ──────────────────
  // When spouseAnnualIncomeCHF is provided, use MEDIAN_SPOUSE_ANNUAL_INCOME_CHF
  // (CHF 58,750 — type 13 record from tar26ge.txt) to auto-determine
  // whether the household qualifies as single-earner or double-earner.
  let effectiveSpouseHasSwissIncome = spouseHasSwissIncome;
  if (spouseAnnualIncomeCHF !== undefined && maritalStatus === 'married') {
    const aboveMedian = spouseAnnualIncomeCHF > MEDIAN_SPOUSE_ANNUAL_INCOME_CHF;
    effectiveSpouseHasSwissIncome = aboveMedian;
    notes.push(
      `Spouse annual income: CHF ${spouseAnnualIncomeCHF.toLocaleString()} ` +
      `(median threshold: CHF ${MEDIAN_SPOUSE_ANNUAL_INCOME_CHF.toLocaleString()}). ` +
      `→ Household treated as ${aboveMedian ? 'double-earner (barème C/N)' : 'single-earner (barème B/M)'}.`
    );
  }

  // ────────────────────────────────────────────────────
  // STEP 0: Short-term assignment (< 90 days, no permit)
  // ────────────────────────────────────────────────────
  if (isShortTermAssignment) {
    const days = assignmentDays || 0;
    if (days > 90) {
      warnings.push(
        `Assignment of ${days} days exceeds the 90-day threshold. ` +
        `A residence permit (typically L) may be required. ` +
        `IS still applies but the employee should regularize their status.`
      );
    }
    notes.push(
      `Short-term assignment (${days > 0 ? days + ' days' : '< 90 days'}): ` +
      `Subject to withholding tax at source regardless of nationality.`
    );
    const code = determineResidentCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'Short-term assignment — IS at source');
  }

  // ────────────────────────────────────────────────────
  // STEP 1: Swiss national — depends on residence
  // ────────────────────────────────────────────────────
  if (nationality === 'swiss') {
    if (livesInSwitzerland) {
      return {
        tariffCode: '',
        notes: ['Swiss national living in Switzerland → subject to ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'Swiss national, resident in Switzerland',
      };
    }

    // Swiss + lives abroad → CROSS-BORDER
    notes.push(
      'Swiss national living abroad and working in Geneva → subject to withholding tax ' +
      'as a cross-border worker (frontalier).'
    );
    if (residence === 'france') {
      notes.push(
        'Residence in France: Geneva applies IS under the Franco-Swiss tax agreement. ' +
        'France grants a tax credit for the Swiss IS paid.'
      );
    }
    const code = determineCrossBorderCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'Swiss cross-border worker (frontalier)');
  }

  // ────────────────────────────────────────────────────
  // STEP 2: Foreign national — depends on permit + residence
  // ────────────────────────────────────────────────────

  // --- C-permit ---
  if (permitUpper === 'C') {
    if (livesInSwitzerland) {
      return {
        tariffCode: '',
        notes: ['C-permit holder (permanent resident) living in Switzerland → ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'C-permit, resident in Switzerland',
      };
    }
    // C-permit + lives abroad → cross-border
    notes.push(
      'C-permit holder living abroad → subject to withholding tax. ' +
      'Ordinary taxation applies only while residing in Switzerland.'
    );
    const code = determineCrossBorderCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'C-permit holder, cross-border');
  }

  // --- G-permit (frontalier) ---
  if (permitUpper === 'G') {
    if (!livesAbroad) {
      warnings.push(
        'G-permit holders should reside abroad. If you live in Switzerland, ' +
        'a different permit type (B or C) would normally apply.'
      );
    }
    notes.push('G-permit (cross-border worker / frontalier) → subject to withholding tax.');
    if (residence === 'france') {
      notes.push(
        'Residence in France: Geneva IS applies under the Franco-Swiss agreement ' +
        '(accord amiable du 11 avril 1983). France grants a corresponding tax credit.'
      );
    }
    const code = determineCrossBorderCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'G-permit cross-border worker');
  }

  // --- L-permit (short-term) ---
  if (permitUpper === 'L') {
    notes.push('L-permit (short-term residence) → subject to withholding tax.');
    if (livesAbroad) {
      // L-permit + abroad → L tariff (flat rate 4.50%)
      notes.push('L-permit holder living abroad → Barème L applies (flat 4.50% rate).');
      const code = `L${kids}`;
      return validateAndReturn(code, notes, warnings, 'L-permit, living abroad');
    }
    // L-permit + lives in CH → standard resident tariffs (A/B/C/H)
    const code = determineResidentCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'L-permit, resident in Switzerland');
  }

  // --- B, F, N, or other permits (living in Switzerland) ---
  if (livesInSwitzerland) {
    notes.push(`${permitUpper || 'B'}-permit holder living in Switzerland → subject to withholding tax.`);

    // 120k CHF threshold check for Geneva
    if (annualGrossCHF && annualGrossCHF > 120000) {
      warnings.push(
        `⚠ Annual gross income (${annualGrossCHF.toLocaleString()} CHF) exceeds 120,000 CHF. ` +
        `In Geneva, this triggers Taxation Ordinaire Ultérieure (TOU): ` +
        `IS is still withheld at source each month, but the employee will receive ` +
        `an ordinary tax assessment at year-end. The IS paid is credited against ` +
        `the ordinary tax liability. The final tax may be higher or lower than the IS.`
      );
      notes.push('Gross > 120,000 CHF/year: TOU applies (year-end ordinary assessment).');
    }

    const code = determineResidentCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, `${permitUpper || 'B'}-permit, resident in Switzerland`);
  }

  // --- Foreign national with B/F/N permit but living abroad (unusual) ---
  if (livesAbroad) {
    notes.push(
      `${permitUpper || 'Foreign'}-permit holder living abroad → subject to withholding tax.`
    );
    warnings.push(
      'Living abroad with a B/F/N permit is unusual. Verify the permit type — ' +
      'a G-permit (frontalier) may be more appropriate.'
    );
    const code = determineCrossBorderCode(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturn(code, notes, warnings, 'Foreign permit holder, living abroad');
  }

  // --- Fallback ---
  notes.push('Could not determine precise tariff. Using default A0.');
  warnings.push('Please verify the tariff code manually based on the specific situation.');
  return { tariffCode: 'A0', notes, warnings, exempt: false, reason: 'Fallback' };
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Determine the RESIDENT tariff code (A/B/C/H) based on personal situation.
 * Used for persons living in Switzerland.
 */
function determineResidentCode(
  maritalStatus: string,
  kids: number,
  isSingleParent?: boolean,
  spouseHasSwissIncome?: boolean,
): string {
  if (maritalStatus === 'married') {
    const letter = spouseHasSwissIncome ? 'C' : 'B';
    return `${letter}${kids}`;
  }
  // Single / divorced / widowed / separated
  if (kids > 0 && isSingleParent) {
    return `H${Math.max(kids, 1)}`; // H1-H5
  }
  // A tariff includes children digit (shared custody, etc.)
  return `A${kids}`;
}

/**
 * Determine the CROSS-BORDER tariff code (G9/M/N/P) based on personal situation.
 * Used for frontaliers and persons living abroad.
 *
 * Geneva 2026 cross-border tariff mapping:
 *   - Single / divorced / widowed / separated → G9 (progressive)
 *   - Married, single-earner → M + children digit (flat 4.50%)
 *   - Married, double-earner → N + children digit (flat 4.50%)
 *   - Single parent with children → P + children digit (flat 4.50%)
 */
function determineCrossBorderCode(
  maritalStatus: string,
  kids: number,
  isSingleParent?: boolean,
  spouseHasSwissIncome?: boolean,
): string {
  if (maritalStatus === 'married') {
    const letter = spouseHasSwissIncome ? 'N' : 'M';
    return `${letter}${kids}`;
  }
  // Single parent (divorced/widowed/separated with sole custody)
  if (kids > 0 && isSingleParent) {
    return `P${Math.max(kids, 1)}`; // P1-P5
  }
  // Single / divorced / widowed / separated without sole custody → G9
  return 'G9';
}

/**
 * Validate the tariff code exists in the data, fallback to A0 if not.
 */
function validateAndReturn(
  tariffCode: string,
  notes: string[],
  warnings: string[],
  reason: string,
): DeterminationResult {
  if (!ALL_CODES.includes(tariffCode)) {
    warnings.push(
      `Tariff code "${tariffCode}" not available in Geneva 2026 barème tables. ` +
      `Using A0 as fallback. Please verify manually.`
    );
    return { tariffCode: 'A0', notes, warnings, exempt: false, reason };
  }
  notes.push(`→ Determined tariff code: ${tariffCode}`);
  return { tariffCode, notes, warnings, exempt: false, reason };
}

/**
 * Clear the rate table cache (useful for testing or reloading)
 */
export function clearTariffCache(): void {
  abchCache = null;
  gCache = null;
}
