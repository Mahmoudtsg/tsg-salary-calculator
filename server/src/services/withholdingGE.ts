// ============================================================
// Geneva Withholding Tax (Impôt à la source) - Tariff Parser
// Reads the official Geneva ASCII barème file (tar26ge.txt)
// Swiss standard Quellensteuer file format
// ============================================================

import fs from 'fs';
import path from 'path';

// ---- Types ----
export interface TariffBracket {
  incomeLowerCHF: number;   // Lower bound of bracket (CHF)
  bracketWidthCHF: number;  // Width of the bracket (CHF)
  taxAmountCHF: number;     // Total tax for this bracket (CHF)
}

export interface TariffTable {
  code: string;             // e.g. "A0", "B1", "C2"
  church: string;           // "N" or "Y"
  validFrom: string;        // "20260101"
  brackets: TariffBracket[];
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

// ---- Barème code descriptions ----
export const TARIFF_DESCRIPTIONS: Record<string, string> = {
  A:  'Single / widowed / divorced / separated / registered partnership dissolved',
  B:  'Married, single-earner household',
  C:  'Secondary income / replacement income',
  E:  'Expatriate (flat rate)',
  G:  'Cross-border worker (frontalier) – single or double-earner',
  H:  'Single with children (single parent)',
  L:  'Short-term (L-permit), living abroad',
  M:  'Cross-border worker – married, single-earner',
  N:  'Cross-border worker – married, double-earner',
  P:  'Cross-border worker – single parent with children',
  Q:  'Cross-border worker – secondary activity',
};

// ---- Cache ----
let tariffCache: Map<string, TariffTable> | null = null;
let availableCodes: string[] = [];

/**
 * Parse the Geneva tariff ASCII file.
 * File format (per data line, whitespace-separated):
 *   Field 1: "0601GE" + tariffCode(2) + church(1)  e.g. "0601GEA0N"
 *   Field 2: date(8) + incomeLower(6) + bracketStep(12)
 *   Field 3: taxAmount(16)
 *
 * Units:
 *   incomeLower × 10 = monthly gross in CHF
 *   bracketStep / 100 = bracket width in CHF
 *   taxAmount = total monthly tax in whole CHF for that income level
 */
export function parseTariffFile(filePath?: string): Map<string, TariffTable> {
  if (tariffCache) return tariffCache;

  const file = filePath || path.join(__dirname, '../../data/tar26ge.txt');
  const raw = fs.readFileSync(file, 'utf-8');
  const lines = raw.split(/\r?\n/);

  const tables = new Map<string, TariffTable>();

  for (const line of lines) {
    // Skip header line (starts with "00") and empty lines
    if (!line.startsWith('06')) continue;

    // Parse fixed fields from the whitespace-separated tokens
    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;

    const field1 = parts[0]; // "0601GEA0N"
    const field2 = parts[1]; // date + income data
    const field3 = parts[2]; // tax amount

    // Extract from field1
    const tariffCode = field1.substring(6, 8);   // e.g. "A0"
    const church = field1.substring(8, 9);        // "N" or "Y"

    // Extract from field2
    const validFrom = field2.substring(0, 8);     // "20260101"
    const incomeLower = parseInt(field2.substring(8, 14), 10);  // 6 digits
    const bracketStep = parseInt(field2.substring(14, 26), 10); // 12 digits

    // Extract from field3: format = childCount(2 digits) + taxAmount(14 digits)
    // e.g. "0200000000000253" → children=02, tax=253
    const taxAmount = parseInt(field3.substring(2), 10);

    // Compute CHF values
    const incomeLowerCHF = incomeLower * 10;
    const bracketWidthCHF = bracketStep / 100;
    const taxAmountCHF = taxAmount; // Already in whole CHF

    // Build table key: code + church, e.g. "A0N" or "A0Y"
    const key = `${tariffCode}${church}`;

    if (!tables.has(key)) {
      tables.set(key, {
        code: tariffCode,
        church,
        validFrom,
        brackets: [],
      });
    }

    tables.get(key)!.brackets.push({
      incomeLowerCHF,
      bracketWidthCHF,
      taxAmountCHF,
    });
  }

  // Sort brackets by income lower bound
  for (const table of tables.values()) {
    table.brackets.sort((a, b) => a.incomeLowerCHF - b.incomeLowerCHF);
  }

  tariffCache = tables;
  availableCodes = Array.from(tables.keys()).sort();
  return tables;
}

/**
 * Get all available tariff codes in the file
 */
export function getAvailableTariffCodes(): string[] {
  parseTariffFile();
  return availableCodes;
}

/**
 * Look up the withholding tax for a given monthly gross and tariff code.
 * 
 * @param grossMonthly - Monthly gross salary in CHF
 * @param tariffCode - e.g. "A0", "B1", "C2"
 * @param church - "N" (default) or "Y"
 * @returns WithholdingResult with tax amount, rate, and bracket info
 */
export function lookupWithholdingTax(
  grossMonthly: number,
  tariffCode: string,
  church: string = 'N'
): WithholdingResult {
  const tables = parseTariffFile();
  const key = `${tariffCode}${church}`;
  const table = tables.get(key);

  if (!table) {
    throw new Error(
      `Tariff code "${tariffCode}" with church="${church}" not found. ` +
      `Available codes: ${availableCodes.join(', ')}`
    );
  }

  const notes: string[] = [];
  const brackets = table.brackets;

  // Find the bracket: last bracket where incomeLowerCHF <= grossMonthly
  let matchedBracket: TariffBracket | null = null;

  for (let i = brackets.length - 1; i >= 0; i--) {
    if (brackets[i].incomeLowerCHF <= grossMonthly) {
      matchedBracket = brackets[i];
      break;
    }
  }

  if (!matchedBracket) {
    // Income is below the first bracket (tax-free zone)
    return {
      tariffCode,
      church,
      grossMonthly,
      taxAmount: 0,
      effectiveRate: 0,
      bracketFrom: 0,
      bracketTo: brackets.length > 0 ? brackets[0].incomeLowerCHF : 0,
      notes: ['Income falls below the first taxable bracket — no withholding tax.'],
      warnings: [],
      exempt: false,
    };
  }

  // Check if income exceeds the highest bracket
  const lastBracket = brackets[brackets.length - 1];
  const lastBracketTop = lastBracket.incomeLowerCHF + lastBracket.bracketWidthCHF;
  if (grossMonthly > lastBracketTop) {
    notes.push(
      `Income ${grossMonthly.toLocaleString()} CHF exceeds the tariff table maximum ` +
      `(${lastBracketTop.toLocaleString()} CHF). Using the highest bracket tax.`
    );
  }

  const taxAmount = matchedBracket.taxAmountCHF;
  const effectiveRate = grossMonthly > 0
    ? Math.round((taxAmount / grossMonthly) * 10000) / 100
    : 0;

  const bracketFrom = matchedBracket.incomeLowerCHF;
  const bracketTo = bracketFrom + matchedBracket.bracketWidthCHF;

  // Add tariff description
  const letter = tariffCode.charAt(0);
  const childCount = tariffCode.charAt(1);
  if (TARIFF_DESCRIPTIONS[letter]) {
    notes.push(`Tariff ${letter}: ${TARIFF_DESCRIPTIONS[letter]}`);
  }
  if (childCount !== '0') {
    notes.push(`Number of children: ${childCount === '9' ? 'special' : childCount}`);
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
    warnings: [],
    exempt: false,
  };
}

// ---- Determination Input ----
export interface DeterminationInput {
  nationality: 'swiss' | 'foreign';
  permit?: string;               // "B", "C", "L", "G", "F", "N", etc.
  residence: 'geneva' | 'other_swiss_canton' | 'france' | 'other_abroad';
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'separated';
  childrenCount: number;
  isSingleParent?: boolean;
  spouseHasSwissIncome?: boolean;
  annualGrossCHF?: number;       // For the 120k threshold check
  isShortTermAssignment?: boolean; // < 90 days, no residence permit
  assignmentDays?: number;        // Number of days for short-term
}

export interface DeterminationResult {
  tariffCode: string;
  notes: string[];
  warnings: string[];
  exempt: boolean;
  reason?: string;                // Short reason for exemption or IS
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
 *    → Living abroad, working in Geneva → cross-border tariffs (G/M/N/P/Q)
 *
 * 3. SWISS nationals living ABROAD and commuting to Geneva
 *    → Same treatment as cross-border workers → tariffs (G/M/N/P/Q)
 *    → This is the "Swiss frontalier" scenario
 *
 * 4. C-permit holders living ABROAD
 *    → Subject to IS (lose ordinary taxation when leaving Switzerland)
 *
 * 5. SHORT-TERM assignments (< 90 days, no permit)
 *    → Subject to IS at source, typically flat rate or A0
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHO IS EXEMPT from IS?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. SWISS nationals living in Switzerland → ordinary taxation
 * 2. C-permit holders living in Switzerland → ordinary taxation
 * 3. B-permit holders earning > 120,000 CHF/year in Geneva
 *    → Switched to Taxation Ordinaire Ultérieure (TOU)
 *    → Still withheld at source, but with year-end ordinary assessment
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TARIFF LETTERS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Resident in Switzerland:
 *   A = Single / divorced / widowed / separated (no children)
 *   B = Married, single-earner household
 *   C = Double earner (spouse also has Swiss income) or secondary income
 *   H = Single parent with children (custody)
 *   E = Expatriate (special flat rate — not auto-determined here)
 *
 * Cross-border (living abroad, working in GE):
 *   G = Single or double-earner without children (replaces A/C)
 *   M = Married single-earner (replaces B)
 *   N = Married double-earner (replaces C when cross-border)
 *   P = Single parent with children (replaces H)
 *   Q = Secondary activity (cross-border with another main job)
 *
 * Special:
 *   L = Short-term L-permit, living abroad
 *   E = Expatriate (flat 5% — must be manually selected)
 *
 * DIGIT = number of dependent children (0-5, capped)
 *   Special codes: G9, Q9, E0 (fixed digit)
 *   H, P: start at 1 (must have ≥1 child)
 *   All other letters: 0-5 children
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
    annualGrossCHF,
    isShortTermAssignment,
    assignmentDays,
  } = params;

  const permitUpper = (permit || '').toUpperCase();
  const livesInSwitzerland = residence === 'geneva' || residence === 'other_swiss_canton';
  const livesAbroad = residence === 'france' || residence === 'other_abroad';
  const kids = Math.min(Math.max(childrenCount || 0, 0), 5);

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
    // Short-term → use A0 for single, B for married, same logic but always subject
    const letter = determineLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome, false);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;
    return validateAndReturn(code, notes, warnings, 'Short-term assignment — IS at source');
  }

  // ────────────────────────────────────────────────────
  // STEP 1: Swiss national — depends on residence
  // ────────────────────────────────────────────────────
  if (nationality === 'swiss') {
    if (livesInSwitzerland) {
      // Swiss + lives in CH → ordinary taxation, NOT subject to IS
      return {
        tariffCode: '',
        notes: ['Swiss national living in Switzerland → subject to ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'Swiss national, resident in Switzerland',
      };
    }

    // Swiss + lives abroad → CROSS-BORDER (frontalier suisse)
    // Subject to IS with cross-border tariffs
    notes.push(
      'Swiss national living abroad and working in Geneva → subject to withholding tax ' +
      'as a cross-border worker (frontalier). Same treatment as G-permit holders.'
    );
    const letter = determineCrossBorderLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;

    if (residence === 'france') {
      notes.push(
        'Residence in France: Geneva applies IS under the Franco-Swiss tax agreement. ' +
        'France grants a tax credit for the Swiss IS paid.'
      );
    }

    return validateAndReturn(code, notes, warnings, 'Swiss cross-border worker (frontalier)');
  }

  // ────────────────────────────────────────────────────
  // STEP 2: Foreign national — depends on permit + residence
  // ────────────────────────────────────────────────────

  // --- C-permit ---
  if (permitUpper === 'C') {
    if (livesInSwitzerland) {
      // C-permit + lives in CH → ordinary taxation
      return {
        tariffCode: '',
        notes: ['C-permit holder (permanent resident) living in Switzerland → ordinary taxation (not IS).'],
        warnings: [],
        exempt: true,
        reason: 'C-permit, resident in Switzerland',
      };
    }
    // C-permit + lives abroad → subject to IS (lost ordinary taxation by leaving CH)
    notes.push(
      'C-permit holder living abroad → subject to withholding tax. ' +
      'Ordinary taxation applies only while residing in Switzerland.'
    );
    const letter = determineCrossBorderLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;
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
    const letter = determineCrossBorderLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;

    if (residence === 'france') {
      notes.push(
        'Residence in France: Geneva IS applies under the Franco-Swiss agreement ' +
        '(accord amiable du 11 avril 1983). France grants a corresponding tax credit.'
      );
    }

    return validateAndReturn(code, notes, warnings, 'G-permit cross-border worker');
  }

  // --- L-permit (short-term) ---
  if (permitUpper === 'L') {
    notes.push('L-permit (short-term residence) → subject to withholding tax.');
    if (livesAbroad) {
      // L-permit + abroad → L-tariff
      const digit = getDigit('L', kids);
      const code = `L${digit}`;
      notes.push('L-permit holder living abroad → Tariff L (flat cross-border rate).');
      return validateAndReturn(code, notes, warnings, 'L-permit, living abroad');
    }
    // L-permit + lives in CH → standard resident tariffs (A/B/C/H)
    const letter = determineLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome, false);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;
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

    const letter = determineLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome, false);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;
    return validateAndReturn(code, notes, warnings, `${permitUpper || 'B'}-permit, resident in Switzerland`);
  }

  // --- Foreign national with B/F/N permit but living abroad (unusual) ---
  if (livesAbroad) {
    notes.push(
      `${permitUpper || 'Foreign'}-permit holder living abroad → subject to withholding tax ` +
      `using cross-border tariffs.`
    );
    warnings.push(
      'Living abroad with a B/F/N permit is unusual. Verify the permit type — ' +
      'a G-permit (frontalier) may be more appropriate.'
    );
    const letter = determineCrossBorderLetter(maritalStatus, kids, isSingleParent, spouseHasSwissIncome);
    const digit = getDigit(letter, kids);
    const code = `${letter}${digit}`;
    return validateAndReturn(code, notes, warnings, 'Foreign permit holder, living abroad');
  }

  // --- Fallback ---
  notes.push('Could not determine precise tariff. Using default A0.');
  warnings.push('Please verify the tariff code manually based on the specific situation.');
  return { tariffCode: 'A0', notes, warnings, exempt: false, reason: 'Fallback' };
}

// ---- Internal helpers ----

/**
 * Determine the tariff letter for residents in Switzerland.
 */
function determineLetter(
  maritalStatus: string,
  kids: number,
  isSingleParent?: boolean,
  spouseHasSwissIncome?: boolean,
  _isCrossBorder?: boolean,
): string {
  if (maritalStatus === 'married') {
    return spouseHasSwissIncome ? 'C' : 'B';
  }
  // Single / divorced / widowed / separated
  if (kids > 0 && isSingleParent) {
    return 'H'; // single parent with children
  }
  return 'A';
}

/**
 * Determine the tariff letter for cross-border workers.
 * Maps the standard letter to the cross-border equivalent.
 *
 * Cross-border mapping:
 *   A (single) → G9 (fixed code, no digit variation)
 *   B (married, single-earner) → M0-M5
 *   C (double earner) → N0-N5
 *   H (single parent) → P1-P5
 */
function determineCrossBorderLetter(
  maritalStatus: string,
  kids: number,
  isSingleParent?: boolean,
  spouseHasSwissIncome?: boolean,
): string {
  if (maritalStatus === 'married') {
    return spouseHasSwissIncome ? 'N' : 'M';
  }
  // Single / divorced / widowed / separated
  if (kids > 0 && isSingleParent) {
    return 'P'; // cross-border single parent → P1-P5
  }
  return 'G'; // cross-border single → G9 (fixed)
}

/**
 * Get the digit (children count) for the tariff code.
 *
 * Available codes from Geneva 2026 tariff file:
 *   A: 0-5  B: 0-5  C: 0-5  E: 0 only
 *   G: 9 only (cross-border single)  Q: 9 only (cross-border secondary)
 *   H: 1-5  L: 0-5  M: 0-5  N: 0-5  P: 1-5
 */
function getDigit(letter: string, kids: number): number {
  // Fixed-digit codes
  if (letter === 'G') return 9; // G9 is the only G code
  if (letter === 'Q') return 9; // Q9 is the only Q code
  if (letter === 'E') return 0; // E0 is the only E code

  // H and P require at least 1 child
  if (letter === 'H' || letter === 'P') {
    return Math.max(kids, 1);
  }

  // A, B, C, L, M, N → 0-5 children
  return kids;
}

/**
 * Validate the tariff code exists in the file, fallback to A0 if not.
 */
function validateAndReturn(
  tariffCode: string,
  notes: string[],
  warnings: string[],
  reason: string,
): DeterminationResult {
  const tables = parseTariffFile();
  // Try N (no church) first, then Y
  if (!tables.has(`${tariffCode}N`)) {
    warnings.push(
      `Tariff code "${tariffCode}" not found in Geneva 2026 tariff file. ` +
      `Using A0 as fallback. Please verify manually.`
    );
    return { tariffCode: 'A0', notes, warnings, exempt: false, reason };
  }
  notes.push(`→ Determined tariff code: ${tariffCode}`);
  return { tariffCode, notes, warnings, exempt: false, reason };
}

/**
 * Clear the tariff cache (useful for testing or reloading)
 */
export function clearTariffCache(): void {
  tariffCache = null;
  availableCodes = [];
}
