// ============================================================
// Vaud Withholding Tax (Impôt à la source) - Rate Engine
// Uses official ACI Vaud barème anchor data (2026)
//
// Data source:
//   ACI Vaud - "Barèmes et instructions concernant l'imposition
//   à la source pour l'année 2026" (21.034-10 / 11.2025)
//   Valid from 1 January 2026
//
// Calculation model: ANNUAL (Circulaire AFC n°45, 12 June 2019)
//   1. Floor gross monthly salary to nearest franc
//   2. Annualise (× 12) to find the applicable rate
//   3. Apply rate to the monthly gross
//   4. Round tax to nearest 5 centimes (CHF 0.05)
//
// Rate data: anchor points extracted from the official PDF.
//   Rates between anchors are linearly interpolated.
//   For production accuracy, replace VD_RATE_ANCHORS with
//   the complete official AFC tariff file (tar26vd.txt).
//
// German frontalier tariffs (L/M/N/P):
//   Same progression as resident tariffs (A/B/C/H) but
//   capped at 4.50% — computed dynamically from base codes.
//
// French frontaliers: EXEMPT in Vaud (taxed in France under
//   the Franco-Swiss agreement of 11 April 1983), unless
//   the return-to-France or telework conditions are not met.
//
// NEW for 2026 — Franco-Swiss data exchange obligation:
//   The amendment of 27 June 2023 to the Franco-Swiss tax
//   convention entered into force on 24 July 2025. Starting
//   1 January 2026, employers who employ French-resident
//   workers (whether frontaliers or not) must provide annual
//   salary data to the competent cantonal tax authority
//   (data for fiscal year 2026 transmitted in 2027).
//   The ACI Vaud will issue a dedicated communication about
//   the required attestation and obligations.
// ============================================================

// ---- Types ----

export interface WithholdingResultVD {
  tariffCode: string;
  grossMonthly: number;
  grossMonthlyRounded: number;
  annualisedGross: number;
  taxAmount: number;
  effectiveRate: number;
  notes: string[];
  warnings: string[];
  exempt: boolean;
  reason?: string;
}

export interface CapitalBenefitResultVD {
  tariffCode: string;
  capitalAmount: number;
  capitalRounded: number;
  taxAmount: number;
  effectiveRate: number;
  notes: string[];
  warnings: string[];
}

export interface DeterminationInputVD {
  nationality: 'swiss' | 'foreign';
  permit?: string;               // 'B', 'C', 'L', 'G', 'F', 'N', etc.
  residence: 'vaud' | 'other_swiss_canton' | 'france' | 'germany' | 'other_abroad';
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'separated';
  childrenCount: number;         // 0–6 children supported in Vaud
  isSingleParent?: boolean;      // Head of household (H/P tariff)
  spouseHasSwissIncome?: boolean;
  spouseAnnualIncomeCHF?: number;
  annualGrossCHF?: number;       // For TOU 120k threshold check
  isShortTermAssignment?: boolean;
  assignmentDays?: number;
  // French frontalier specific
  frenchFrontalierConditionsNotMet?: boolean; // true → IS applies despite France residence
}

export interface DeterminationResultVD {
  tariffCode: string;
  notes: string[];
  warnings: string[];
  exempt: boolean;
  reason?: string;
}

// ---- Tariff descriptions ----

export const TARIFF_DESCRIPTIONS_VD: Record<string, string> = {
  A:  'Single / divorced / widowed / separated (resident)',
  AO: 'Single / alternating custody / garde alternée (same rates as A0)',
  B:  'Married, single-earner household (resident)',
  C:  'Married, double-earner household (resident)',
  H:  'Single parent living with children (famille monoparentale)',
  I:  'Capital benefit from pension institution – single person',
  J:  'Capital benefit from pension institution – married',
  K:  'Capital benefit from pension institution – married double-earner',
  G:  'Compensation income not paid through employer (pension fund/insurance/unemployment)',
  L:  'German frontalier – single (progressive, capped 4.50%)',
  M:  'German frontalier – married, single-earner (progressive, capped 4.50%)',
  N:  'German frontalier – married, double-earner (progressive, capped 4.50%)',
  P:  'German frontalier – single parent with children (progressive, capped 4.50%)',
  Q:  'German frontalier – compensation income not via employer (capped 4.50%)',
};

// ---- Rate anchor data ----
// Each entry: [annual_income_from_chf, rate_percent]
// Rates are linearly interpolated between adjacent anchors.
// Source: ACI Vaud barème 2026 PDF (21.034-10 / 11.2025)

type RatePoint = readonly [number, number]; // [annual_from, rate_%]

const VD_RATE_ANCHORS: Readonly<Record<string, readonly RatePoint[]>> = {

  // ─── A0: Single, no children ───────────────────────────────────────────
  // Start: 29,401/year; Max: 38.11% from 1,200,001/year
  // Incomes below 29,401/year (CHF 2,450/month) → 0% (below first anchor)
  A0: [
    [29401, 0.09], [34801, 0.53], [35401, 0.70],
    [40801, 2.30], [50401, 5.41], [60001, 8.53], [70201, 11.19],
    [80401, 12.31], [90001, 13.17], [100201, 14.10], [110401, 15.09],
    [120001, 15.95], [130801, 16.96], [150001, 18.63], [200401, 20.91],
    [250001, 24.90], [300001, 27.72], [354001, 29.97], [500401, 35.49],
    [800001, 36.72], [1134001, 37.97], [1194001, 38.10], [1200001, 38.11],
  ],

  // ─── A1–A6: Single, NOT living with children (authorisation required) ──
  // Only 2 anchor points available (100k and max); rates below 100k/year
  // are approximated as 0 (conservative). For precise values use the
  // complete official AFC tariff file (tar25vd.txt).
  A1: [[100201, 11.74], [1200001, 37.85]],
  A2: [[100201, 10.10], [1200001, 37.64]],
  A3: [[100201,  7.72], [1200001, 37.45]],
  A4: [[100201,  5.68], [1200001, 37.25]],
  A5: [[100201,  3.93], [1200001, 37.06]],
  A6: [[100201,  2.67], [1200001, 36.87]],

  // ─── B0: Married, single-earner, no children ───────────────────────────
  // Start: 46,201/year (CHF 3,850/month); Max: 36.42% from 1,200,001/year
  B0: [
    [46201, 0.05], [80401, 6.80], [100201, 10.12],
    [120001, 11.61], [150001, 13.67], [200401, 17.59], [1200001, 36.42],
  ],

  // ─── B1–B6: Married, single-earner, with children ──────────────────────
  B1: [[80401, 4.16], [100201,  7.60], [120001,  9.94], [150001, 11.98], [200401, 15.55], [1200001, 36.14]],
  B2: [[80401, 2.48], [100201,  5.41], [120001,  8.16], [150001, 10.55], [200401, 13.91], [1200001, 35.86]],
  B3: [[80401, 1.30], [100201,  3.75], [120001,  6.24], [150001,  9.35], [200401, 12.60], [1200001, 35.60]],
  B4: [[80401, 0.49], [100201,  2.52], [120001,  4.76], [150001,  8.01], [200401, 11.41], [1200001, 35.34]],
  B5: [[80401, 0.11], [100201,  1.56], [120001,  3.50], [150001,  6.60], [200401, 10.42], [1200001, 35.07]],
  B6: [             [100201,  0.82], [120001,  2.54], [150001,  5.41], [200401,  9.46], [1200001, 34.80]],

  // ─── C0: Married, double-earner, no children ───────────────────────────
  // Includes effect of theoretical spouse income (capped at CHF 69,300/year)
  // Start: 28,201/year (CHF 2,350/month); Max: 36.66% from 1,200,001/year
  C0: [
    [28201, 0.13], [60001, 10.06], [80401, 12.24],
    [100201, 13.69], [120001, 15.04], [150001, 17.22], [200401, 20.91],
    [1200001, 36.66],
  ],

  // ─── C1–C6: Married, double-earner, with children ──────────────────────
  C1: [[60001,  8.58], [80401, 10.73], [100201, 12.12], [120001, 13.37], [150001, 15.39], [200401, 18.96], [1200001, 36.44]],
  C2: [[60001,  6.63], [80401,  9.46], [100201, 10.78], [120001, 12.10], [150001, 13.93], [200401, 17.47], [1200001, 36.25]],
  C3: [[60001,  5.09], [80401,  8.35], [100201,  9.74], [120001, 10.92], [150001, 12.83], [200401, 16.28], [1200001, 36.05]],
  C4: [[60001,  3.71], [80401,  6.98], [100201,  8.75], [120001, 10.00], [150001, 11.74], [200401, 15.19], [1200001, 35.87]],
  C5: [[60001,  2.65], [80401,  5.81], [100201,  7.65], [120001,  9.08], [150001, 10.90], [200401, 14.19], [1200001, 35.68]],
  C6: [[60001,  1.79], [80401,  4.63], [100201,  6.59], [120001,  8.21], [150001, 10.08], [200401, 13.16], [1200001, 35.49]],

  // ─── H1–H6: Single parent living with children ─────────────────────────
  // Start: ~45,001/year; Max H1: 37.26% from 1,200,001/year
  H1: [[45001, 0.05], [80401, 6.63], [100201, 10.01], [120001, 11.47], [150001, 13.54], [200401, 17.45], [1200001, 37.26]],
  H2: [[45001, 0.00], [80401, 4.33], [100201,  7.57], [120001,  9.79], [150001, 11.85], [200401, 15.38], [1200001, 37.02]],
  H3: [              [80401, 2.60], [100201,  5.62], [120001,  8.14], [150001, 10.40], [200401, 13.77], [1200001, 36.78]],
  H4: [              [80401, 1.39], [100201,  3.94], [120001,  6.42], [150001,  9.23], [200401, 12.48], [1200001, 36.54]],
  H5: [              [80401, 0.53], [100201,  2.68], [120001,  4.95], [150001,  8.09], [200401, 11.28], [1200001, 36.31]],
  H6: [              [80401, 0.13], [100201,  1.70], [120001,  3.65], [150001,  7.06], [200401, 10.31], [1200001, 36.06]],

  // ─── I: Capital benefit from pension institution – single ───────────────
  // Applied to the capital AMOUNT (not annual salary). Floor to nearest CHF 100.
  // Minimum tax: CHF 20 (below this threshold, no tax is collected)
  I: [
    [3001, 0.72], [4001, 0.87], [10001, 1.49], [50001, 3.32],
    [100001, 4.54], [150001, 5.55], [200001, 6.36], [300001, 7.36],
    [400001, 7.95], [500001, 8.31], [600001, 8.54], [700001, 8.71],
    [800001, 8.82], [900001, 8.88],
  ],

  // ─── J: Capital benefit – married (note: from 1 Jan 2024, must NOT be ───
  // applied directly by pension institutions; use I, then taxpayer requests J
  // via recalculation with Section impôt à la source)
  J: [
    [3001, 0.64], [4001, 0.70], [10001, 1.26], [50001, 2.94],
    [100001, 4.00], [150001, 4.94], [200001, 5.83], [300001, 6.85],
    [400001, 7.52], [500001, 7.96], [600001, 8.25], [700001, 8.46],
    [800001, 8.62], [900001, 8.75],
  ],

  // ─── K: Capital benefit – married double-earner ──────────────────────────
  K: [
    [4001, 0.63], [10001, 1.04], [50001, 2.63],
    [100001, 3.61], [150001, 4.46], [200001, 5.35], [300001, 6.40],
    [400001, 7.04], [500001, 7.50], [600001, 7.86], [700001, 8.13],
    [800001, 8.33], [900001, 8.49],
  ],

  // ─── Q: German frontalier – compensation income not via employer ─────────
  // Progressive, capped at 4.50% from 39,601/year
  Q: [
    [21001, 0.12], [27001, 0.27], [30001, 0.84],
    [35401, 2.79], [38401, 4.15], [39601, 4.50],
  ],
};

// Codes whose rates are derived from a base code, capped at 4.50%
// (German frontalier tariffs L/M/N/P mirror A/B/C/H with 4.5% cap)
const GERMAN_FRONTALIER_BASE_MAP: Record<string, string> = {
  L0: 'A0', L1: 'A1', L2: 'A2', L3: 'A3', L4: 'A4', L5: 'A5', L6: 'A6',
  M0: 'B0', M1: 'B1', M2: 'B2', M3: 'B3', M4: 'B4', M5: 'B5', M6: 'B6',
  N0: 'C0', N1: 'C1', N2: 'C2', N3: 'C3', N4: 'C4', N5: 'C5', N6: 'C6',
  P1: 'H1', P2: 'H2', P3: 'H3', P4: 'H4', P5: 'H5', P6: 'H6',
};
const GERMAN_FRONTALIER_CAP = 4.50;

// AO (alternating custody) is identical to A0
const AO_ALIAS = 'A0';

// Capital benefit codes — use a different calculation model
const CAPITAL_BENEFIT_CODES = new Set(['I', 'J', 'K']);

// All valid tariff codes
const ALL_VD_CODES = [
  'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
  'AO',
  'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
  'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I', 'J', 'K',
  'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6',
  'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
  'N0', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'Q',
];

// ═══════════════════════════════════════════════════════════════
// Rate interpolation
// ═══════════════════════════════════════════════════════════════

/**
 * Linearly interpolate the IS rate for a given income amount.
 *
 * @param points - Ordered array of [annual_from, rate_%] anchors
 * @param amount - Annual income (or capital amount for I/J/K)
 * @returns Interpolated rate in percent
 */
function interpolateRate(points: readonly RatePoint[], amount: number): number {
  if (points.length === 0 || amount <= 0) return 0;

  // Below first taxable bracket
  if (amount < points[0][0]) return 0;

  // At or above the last anchor → use its rate (max rate)
  const last = points[points.length - 1];
  if (amount >= last[0]) return last[1];

  // Find surrounding anchors
  let i = 0;
  while (i < points.length - 1 && points[i + 1][0] <= amount) i++;

  if (i >= points.length - 1) return points[i][1];

  const [fromA, fromR] = points[i];
  const [toA, toR] = points[i + 1];
  if (toA === fromA) return fromR;

  // Linear interpolation
  const ratio = (amount - fromA) / (toA - fromA);
  return fromR + ratio * (toR - fromR);
}

// ═══════════════════════════════════════════════════════════════
// Rate lookup helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Look up the IS rate (%) for the given tariff code and annual amount.
 * For German frontalier codes, applies the 4.5% cap.
 * For AO, uses A0 rates.
 */
function lookupVDRate(tariffCode: string, annualAmount: number): number {
  // AO alias
  const effectiveCode = tariffCode === 'AO' ? AO_ALIAS : tariffCode;

  // German frontalier — derive from base code + apply 4.5% cap
  const baseCode = GERMAN_FRONTALIER_BASE_MAP[effectiveCode];
  if (baseCode) {
    const baseRate = lookupVDRate(baseCode, annualAmount);
    return Math.min(baseRate, GERMAN_FRONTALIER_CAP);
  }

  // Q tariff
  if (effectiveCode === 'Q') {
    const points = VD_RATE_ANCHORS['Q'];
    return Math.min(interpolateRate(points, annualAmount), GERMAN_FRONTALIER_CAP);
  }

  // Standard tariff lookup
  const points = VD_RATE_ANCHORS[effectiveCode];
  if (!points) return 0;
  return interpolateRate(points, annualAmount);
}

// ═══════════════════════════════════════════════════════════════
// Round tax to nearest CHF 0.05 (Vaud rounding rule)
// ═══════════════════════════════════════════════════════════════
function roundToFiveCentimes(amount: number): number {
  return Math.round(amount * 20) / 20;
}

// ═══════════════════════════════════════════════════════════════
// Public API — Salary withholding tax lookup
// ═══════════════════════════════════════════════════════════════

/**
 * Compute monthly IS withholding for a Vaud employee.
 *
 * Calculation model (annual — Circulaire AFC n°45):
 *   1. Floor gross monthly to nearest franc
 *   2. Annualise (× 12)
 *   3. Look up rate in tariff table (linear interpolation between anchors)
 *   4. Tax = rounded monthly × rate / 100
 *   5. Round tax to nearest CHF 0.05
 *
 * @param grossMonthly - Monthly gross salary in CHF (before flooring)
 * @param tariffCode   - e.g. 'A0', 'C2', 'H1', 'L0', 'M3', 'Q'
 */
export function lookupWithholdingTaxVD(
  grossMonthly: number,
  tariffCode: string,
): WithholdingResultVD {
  const notes: string[] = [];
  const warnings: string[] = [];

  if (!ALL_VD_CODES.includes(tariffCode)) {
    throw new Error(
      `Tariff code "${tariffCode}" is not valid for Vaud 2026. ` +
      `Available codes: ${ALL_VD_CODES.join(', ')}`
    );
  }

  if (CAPITAL_BENEFIT_CODES.has(tariffCode)) {
    throw new Error(
      `Tariff code "${tariffCode}" is for capital benefits (pension lump sums). ` +
      `Use lookupCapitalBenefitTaxVD() instead.`
    );
  }

  // Step 1: Floor to nearest franc
  const grossMonthlyRounded = Math.floor(grossMonthly);

  // Step 2: Annualise
  const annualisedGross = grossMonthlyRounded * 12;

  // Step 3: Look up rate
  const rate = lookupVDRate(tariffCode, annualisedGross);

  // Step 4: Tax = monthly × rate%
  const rawTax = grossMonthlyRounded * rate / 100;

  // Step 5: Round to nearest CHF 0.05
  const taxAmount = roundToFiveCentimes(rawTax);

  const effectiveRate = grossMonthlyRounded > 0 ? (taxAmount / grossMonthlyRounded) * 100 : 0;

  // Notes
  const letter = tariffCode.charAt(0);
  const descKey = TARIFF_DESCRIPTIONS_VD[tariffCode] ? tariffCode : letter;
  if (TARIFF_DESCRIPTIONS_VD[descKey]) {
    notes.push(`Tariff ${descKey}: ${TARIFF_DESCRIPTIONS_VD[descKey]}`);
  }

  if (tariffCode in GERMAN_FRONTALIER_BASE_MAP || tariffCode === 'Q') {
    notes.push(`German frontalier tariff: rate capped at ${GERMAN_FRONTALIER_CAP}%.`);
    if (rate >= GERMAN_FRONTALIER_CAP - 0.01) {
      notes.push(`Rate cap of ${GERMAN_FRONTALIER_CAP}% applied at this income level.`);
    }
  }

  if (tariffCode === 'AO') {
    notes.push('Tariff AO (alternating custody / garde alternée): same rates as A0.');
  }

  if (tariffCode.startsWith('A') && tariffCode !== 'A0' && tariffCode !== 'AO') {
    notes.push(
      `Tariff ${tariffCode} (single, not living with children): ` +
      `only applicable with written authorisation from Section impôt à la source.`
    );
  }

  // TOU threshold warning (CHF 120,000/year)
  if (annualisedGross > 120000) {
    warnings.push(
      `Annualised gross (CHF ${annualisedGross.toLocaleString()}) exceeds the TOU threshold ` +
      `of CHF 120,000/year. A Taxation Ordinaire Ultérieure (TOU) applies at year-end: ` +
      `IS continues to be withheld monthly, but the employee receives an ordinary tax ` +
      `assessment. The IS paid is credited against the final liability.`
    );
  }

  // Data quality note for sparse anchor codes
  const sparseAnchors = ['A1','A2','A3','A4','A5','A6'];
  if (sparseAnchors.includes(tariffCode)) {
    notes.push(
      `Note: rate for ${tariffCode} is interpolated from limited anchor points. ` +
      `For exact figures, obtain the complete official AFC tariff file (tar26vd.txt).`
    );
  }

  return {
    tariffCode,
    grossMonthly,
    grossMonthlyRounded,
    annualisedGross,
    taxAmount,
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    notes,
    warnings,
    exempt: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// Public API — Capital benefit tax lookup (tariffs I, J, K)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute IS on a capital benefit from a pension institution (2nd/3rd pillar).
 *
 * Rules:
 *   - Round capital DOWN to nearest CHF 100
 *   - Look up rate in I/J/K table
 *   - Tax = rounded capital × rate / 100
 *   - Minimum tax: CHF 20 (below this threshold, nothing is collected)
 *   - Round to nearest CHF 0.05
 *
 * Note: Since 1 Jan 2024, pension institutions must use tariff I for all
 * capital benefits. Tariff J (married) is applied only via a post-payment
 * recalculation requested by the taxpayer from Section impôt à la source.
 *
 * @param capitalAmount - Total capital benefit in CHF
 * @param tariffCode    - 'I', 'J', or 'K'
 */
export function lookupCapitalBenefitTaxVD(
  capitalAmount: number,
  tariffCode: 'I' | 'J' | 'K'
): CapitalBenefitResultVD {
  const notes: string[] = [];
  const warnings: string[] = [];

  if (!CAPITAL_BENEFIT_CODES.has(tariffCode)) {
    throw new Error(`lookupCapitalBenefitTaxVD only accepts tariff codes I, J, K.`);
  }

  // Floor to nearest CHF 100
  const capitalRounded = Math.floor(capitalAmount / 100) * 100;

  const points = VD_RATE_ANCHORS[tariffCode];
  const rate = interpolateRate(points, capitalRounded);

  const rawTax = capitalRounded * rate / 100;
  const MINIMUM_TAX = 20;

  if (rawTax < MINIMUM_TAX) {
    notes.push(
      `Computed tax (CHF ${rawTax.toFixed(2)}) is below the CHF ${MINIMUM_TAX} minimum. ` +
      `No withholding tax is collected.`
    );
    return {
      tariffCode,
      capitalAmount,
      capitalRounded,
      taxAmount: 0,
      effectiveRate: 0,
      notes,
      warnings,
    };
  }

  const taxAmount = roundToFiveCentimes(rawTax);
  const effectiveRate = capitalRounded > 0 ? (taxAmount / capitalRounded) * 100 : 0;

  if (tariffCode === 'J') {
    notes.push(
      `Tariff J: since 1 January 2024, pension institutions must use tariff I for ` +
      `capital benefits. Tariff J is applied only via post-payment recalculation ` +
      `requested by the taxpayer (Section impôt à la source).`
    );
  }
  notes.push(
    `Capital benefit tax: CHF ${capitalRounded.toLocaleString()} × ${rate.toFixed(2)}% = CHF ${taxAmount.toFixed(2)}.`
  );

  return {
    tariffCode,
    capitalAmount,
    capitalRounded,
    taxAmount,
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    notes,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════
// Public API — Available codes
// ═══════════════════════════════════════════════════════════════

export function getAvailableTariffCodesVD(): string[] {
  return [...ALL_VD_CODES];
}

// ═══════════════════════════════════════════════════════════════
// Tariff code determination
// ═══════════════════════════════════════════════════════════════

/**
 * Determine the Vaud IS tariff code based on the employee's personal situation.
 *
 * ═══════════════════════════════════════════════════════════════
 * VAUD-SPECIFIC RULES (differ from Geneva)
 * ═══════════════════════════════════════════════════════════════
 *
 * French frontaliers → EXEMPT in Vaud (taxed in France under the
 *   Franco-Swiss agreement of 11 April 1983), provided:
 *   (1) returns to French domicile ≥ 4 days/week (100% activity)
 *   (2) telework ≤ 40% of activity rate
 *   (3) employer holds French tax residence certificate (attestation fiscale)
 *   If conditions not met, employer MUST withhold IS using standard tariffs.
 *
 * German frontaliers → L/M/N/P/Q tariffs (progressive, capped 4.50%).
 *   Annual German tax residence certificate (Gre-1/Gre-2) required.
 *   If absent from home 60+ working days/year for professional reasons,
 *   the person loses frontalier status and standard tariffs apply.
 *
 * Children: up to 6 children (Vaud supports A0–A6, B0–B6, C0–C6, H1–H6).
 * Children count only when employer receives Swiss family allowances.
 *
 * TOU threshold: CHF 120,000/year (individual income — spouses not cumulated).
 *
 * NEW 2026 — Franco-Swiss data exchange:
 *   Employers of French-resident employees (frontaliers or not) must provide
 *   annual salary data to the ACI Vaud starting with fiscal year 2026
 *   (avenant 27 June 2023, in force 24 July 2025). This is a reporting
 *   obligation — the tax treatment (exempt/subject) is unchanged.
 */
export function determineTariffCodeVD(params: DeterminationInputVD): DeterminationResultVD {
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
    frenchFrontalierConditionsNotMet,
  } = params;

  const permitUpper = (permit || '').toUpperCase();
  const livesInSwitzerland = residence === 'vaud' || residence === 'other_swiss_canton';
  const livesInFrance = residence === 'france';
  const livesInGermany = residence === 'germany';
  const livesAbroad = livesInFrance || livesInGermany || residence === 'other_abroad';

  // Clamp children to 0–6 (Vaud max is 6)
  const kids = Math.min(Math.max(childrenCount || 0, 0), 6);

  // Determine double-earner vs single-earner for married couples
  // No official Vaud median threshold published — use spouseHasSwissIncome flag directly.
  let effectiveSpouseHasSwissIncome = spouseHasSwissIncome;
  if (spouseAnnualIncomeCHF !== undefined && maritalStatus === 'married') {
    effectiveSpouseHasSwissIncome = spouseAnnualIncomeCHF > 0;
    notes.push(
      `Spouse annual income CHF ${spouseAnnualIncomeCHF.toLocaleString()} → ` +
      `household treated as ${effectiveSpouseHasSwissIncome ? 'double-earner (barème C/N)' : 'single-earner (barème B/M)'}.`
    );
  }

  // ────────────────────────────────────────────────────
  // STEP 0: Short-term assignment
  // ────────────────────────────────────────────────────
  if (isShortTermAssignment) {
    const days = assignmentDays || 0;
    if (days > 90) {
      warnings.push(
        `Assignment of ${days} days exceeds the 90-day threshold. ` +
        `A residence permit (typically L) may be required.`
      );
    }
    notes.push(
      `Short-term assignment (${days > 0 ? days + ' days' : '< 90 days'}): ` +
      `subject to withholding tax at source regardless of nationality.`
    );
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'Short-term assignment — IS at source');
  }

  // ────────────────────────────────────────────────────
  // STEP 1: Swiss national
  // ────────────────────────────────────────────────────
  if (nationality === 'swiss') {
    if (livesInSwitzerland) {
      return {
        tariffCode: '',
        notes: ['Swiss national living in Switzerland → ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'Swiss national, resident in Switzerland',
      };
    }

    // Swiss + lives in France → French frontalier rules
    if (livesInFrance) {
      if (!frenchFrontalierConditionsNotMet) {
        return {
          tariffCode: '',
          notes: [
            'Swiss national living in France → frontalier, taxed in France under the ' +
            'Franco-Swiss agreement of 11 April 1983. NOT subject to IS in Vaud.',
            'Conditions: returns to France ≥ 4 days/week; telework ≤ 40%; employer holds attestation fiscale.',
            'NEW 2026: Employer must provide annual salary data to ACI Vaud (avenant 27.06.2023, ' +
            'in force 24.07.2025). Data for fiscal year 2026 must be transmitted in 2027.',
          ],
          warnings: [],
          exempt: true,
          reason: 'French frontalier — taxed in France, exempt from Vaud IS',
        };
      }
      // Conditions not met → IS applies with resident tariffs
      warnings.push(
        'French frontalier conditions not met (telework > 40% or insufficient return days). ' +
        'IS applies in Vaud with standard resident tariffs.'
      );
      const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'French frontalier — IS conditions not met');
    }

    // Swiss + lives in Germany → German frontalier tariffs
    if (livesInGermany) {
      notes.push(
        'Swiss national living in Germany → German frontalier IS tariff (L/M/N/P). ' +
        'Annual German tax certificate (Gre-1/Gre-2) required. Rates capped at 4.50%.'
      );
      const code = determineGermanFrontalierCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'Swiss national, German frontalier');
    }

    // Swiss + other abroad → standard IS cross-border
    notes.push(
      'Swiss national living abroad (non-France/Germany) and working in Vaud → IS applies.'
    );
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'Swiss national, cross-border worker');
  }

  // ────────────────────────────────────────────────────
  // STEP 2: Foreign national — depends on permit + residence
  // ────────────────────────────────────────────────────

  // --- C-permit ---
  if (permitUpper === 'C') {
    if (livesInSwitzerland) {
      return {
        tariffCode: '',
        notes: ['C-permit holder (permanent resident) in Switzerland → ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'C-permit, resident in Switzerland',
      };
    }
    // C-permit + lives abroad
    if (livesInFrance && !frenchFrontalierConditionsNotMet) {
      return {
        tariffCode: '',
        notes: [
          'C-permit holder living in France → French frontalier, taxed in France. NOT subject to IS in Vaud.',
          'NEW 2026: Employer must provide annual salary data to ACI Vaud (avenant 27.06.2023, ' +
          'in force 24.07.2025). Data for fiscal year 2026 must be transmitted in 2027.',
        ],
        warnings: [],
        exempt: true,
        reason: 'C-permit, French frontalier — exempt from Vaud IS',
      };
    }
    if (livesInGermany) {
      notes.push('C-permit holder in Germany → German frontalier tariff (L/M/N/P), capped 4.50%.');
      const code = determineGermanFrontalierCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'C-permit, German frontalier');
    }
    notes.push('C-permit holder living abroad → subject to IS.');
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'C-permit, living abroad');
  }

  // --- G-permit (frontalier) ---
  if (permitUpper === 'G') {
    if (!livesAbroad) {
      warnings.push(
        'G-permit holders should reside abroad. If living in Switzerland, ' +
        'a different permit (B or C) would normally apply.'
      );
    }
    if (livesInFrance && !frenchFrontalierConditionsNotMet) {
      return {
        tariffCode: '',
        notes: [
          'G-permit holder (French frontalier) → taxed in France under Franco-Swiss agreement. ' +
          'NOT subject to IS in Vaud.',
          'Conditions: returns to France ≥ 4 days/week; telework ≤ 40%; employer holds attestation fiscale.',
          'NEW 2026: Employer must provide annual salary data to ACI Vaud (avenant 27.06.2023, ' +
          'in force 24.07.2025). Data for fiscal year 2026 must be transmitted in 2027.',
        ],
        warnings,
        exempt: true,
        reason: 'G-permit, French frontalier — exempt from Vaud IS',
      };
    }
    if (livesInFrance && frenchFrontalierConditionsNotMet) {
      warnings.push(
        'French frontalier conditions not met. IS applies in Vaud with standard tariffs.'
      );
      const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'G-permit, French frontalier conditions not met');
    }
    if (livesInGermany) {
      notes.push('G-permit holder in Germany → German frontalier tariff (L/M/N/P), capped 4.50%.');
      const code = determineGermanFrontalierCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'G-permit, German frontalier');
    }
    // Other G-permit frontalier (non-France, non-Germany)
    notes.push('G-permit cross-border worker → subject to IS in Vaud.');
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'G-permit cross-border worker');
  }

  // --- L-permit (short-term, up to 1 year) ---
  if (permitUpper === 'L') {
    notes.push('L-permit (short-term residence) → subject to IS.');
    if (livesAbroad) {
      if (livesInFrance && !frenchFrontalierConditionsNotMet) {
        return {
          tariffCode: '',
          notes: [
            'L-permit, living in France → frontalier, exempt from Vaud IS.',
            'NEW 2026: Employer must provide annual salary data to ACI Vaud (avenant 27.06.2023, ' +
            'in force 24.07.2025). Data for fiscal year 2026 must be transmitted in 2027.',
          ],
          warnings,
          exempt: true,
          reason: 'L-permit, French frontalier — exempt from Vaud IS',
        };
      }
      if (livesInGermany) {
        const code = determineGermanFrontalierCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
        return validateAndReturnVD(code, notes, warnings, 'L-permit, German frontalier');
      }
    }
    // L-permit in Switzerland → standard A/B/C/H
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'L-permit, resident in Switzerland');
  }

  // --- B, F, N or other permits ---
  if (livesInSwitzerland) {
    notes.push(`${permitUpper || 'Foreign'}-permit holder in Switzerland → subject to IS.`);

    if (annualGrossCHF && annualGrossCHF > 120000) {
      warnings.push(
        `Annual gross CHF ${annualGrossCHF.toLocaleString()} exceeds the TOU threshold ` +
        `(CHF 120,000). TOU applies: IS is withheld monthly but an ordinary assessment ` +
        `is issued at year-end. The TOU threshold is assessed individually ` +
        `(spouse incomes are NOT cumulated).`
      );
      notes.push('Gross > CHF 120,000/year: TOU (Taxation Ordinaire Ultérieure) applies.');
    }

    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, `${permitUpper || 'B'}-permit, resident in Vaud`);
  }

  if (livesAbroad) {
    if (livesInFrance && !frenchFrontalierConditionsNotMet) {
      return {
        tariffCode: '',
        notes: [
          'Living in France → French frontalier, exempt from Vaud IS (taxed in France).',
          'NEW 2026: Employer must provide annual salary data to ACI Vaud (avenant 27.06.2023, ' +
          'in force 24.07.2025). Data for fiscal year 2026 must be transmitted in 2027.',
        ],
        warnings: [],
        exempt: true,
        reason: 'French frontalier — exempt from Vaud IS',
      };
    }
    if (livesInGermany) {
      const code = determineGermanFrontalierCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
      return validateAndReturnVD(code, notes, warnings, 'German frontalier');
    }
    notes.push(`${permitUpper || 'Foreign'}-permit holder living abroad → subject to IS.`);
    warnings.push(
      'Living abroad with a B/F/N permit is unusual. ' +
      'A G-permit (frontalier) may be more appropriate.'
    );
    const code = determineResidentCodeVD(maritalStatus, kids, isSingleParent, effectiveSpouseHasSwissIncome);
    return validateAndReturnVD(code, notes, warnings, 'Foreign permit holder, living abroad');
  }

  // Fallback
  notes.push('Could not determine tariff code precisely. Using default A0.');
  warnings.push('Please verify the tariff code manually.');
  return { tariffCode: 'A0', notes, warnings, exempt: false, reason: 'Fallback' };
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Determine resident tariff code (A/B/C/H) for persons living in Switzerland.
 * Vaud supports up to 6 children.
 */
function determineResidentCodeVD(
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
    return `H${Math.max(kids, 1)}`; // H1–H6
  }
  return `A${kids}`; // A0–A6
}

/**
 * Determine German frontalier tariff code (L/M/N/P).
 * These are progressive rates capped at 4.50%.
 */
function determineGermanFrontalierCodeVD(
  maritalStatus: string,
  kids: number,
  isSingleParent?: boolean,
  spouseHasSwissIncome?: boolean,
): string {
  if (maritalStatus === 'married') {
    const letter = spouseHasSwissIncome ? 'N' : 'M';
    return `${letter}${kids}`;
  }
  if (kids > 0 && isSingleParent) {
    return `P${Math.max(kids, 1)}`; // P1–P6
  }
  return `L${kids}`; // L0–L6
}

/**
 * Validate the tariff code and return a result, falling back to A0 if unknown.
 */
function validateAndReturnVD(
  tariffCode: string,
  notes: string[],
  warnings: string[],
  reason: string,
): DeterminationResultVD {
  if (!ALL_VD_CODES.includes(tariffCode)) {
    warnings.push(
      `Tariff code "${tariffCode}" is not available in Vaud 2026 barème tables. ` +
      `Using A0 as fallback. Please verify manually.`
    );
    return { tariffCode: 'A0', notes, warnings, exempt: false, reason };
  }
  return { tariffCode, notes, warnings, exempt: false, reason };
}

// ═══════════════════════════════════════════════════════════════
// Cache invalidation (for testing)
// ═══════════════════════════════════════════════════════════════

/** No external data loaded for Vaud; provided for API symmetry with GE service. */
export function clearTariffCacheVD(): void {
  // No-op: rate data is embedded as constants
}
