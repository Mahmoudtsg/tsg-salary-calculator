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
}

// ---- Barème code descriptions ----
export const TARIFF_DESCRIPTIONS: Record<string, string> = {
  A:  'Single / widowed / divorced / separated / registered partnership dissolved',
  B:  'Married, single-earner household',
  C:  'Secondary income / replacement income',
  E:  'Expatriate (flat rate)',
  G:  'Cross-border worker (frontalier) – no church tax correction',
  H:  'Single with children (single parent)',
  L:  'Cross-border worker – flat rate (German treaties)',
  M:  'Cross-border worker – German treaty, married',
  N:  'Cross-border worker – German treaty, married double-earner',
  P:  'Cross-border worker – German treaty, single with children',
  Q:  'Cross-border worker – German treaty, secondary activity',
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
  };
}

/**
 * Determine the tariff code based on personal situation.
 * This is a SIMPLIFIED rule — the actual Swiss IS determination is more complex
 * and depends on canton-specific regulations.
 *
 * Basic rules (simplified for Geneva):
 *   - Swiss nationals or C-permit holders are generally NOT subject to IS
 *   - B-permit holders are subject to IS
 *   - The letter depends on marital status:
 *       A = single/divorced/widowed
 *       B = married, single earner
 *       C = secondary income / spouse also earns
 *       H = single with children
 *   - The digit = number of children (0-5)
 */
export function determineTariffCode(params: {
  nationality: 'swiss' | 'foreign';
  permit?: string;             // "B", "C", "L", "G", etc.
  residence: 'geneva' | 'other_canton' | 'abroad';
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'separated';
  childrenCount: number;
  isSingleParent?: boolean;
  spouseHasSwissIncome?: boolean;
}): { tariffCode: string; notes: string[]; exempt: boolean } {
  const notes: string[] = [];
  const {
    nationality,
    permit,
    residence,
    maritalStatus,
    childrenCount,
    isSingleParent,
    spouseHasSwissIncome,
  } = params;

  // Swiss nationals and C-permit holders are exempt from IS
  if (nationality === 'swiss') {
    return {
      tariffCode: '',
      notes: ['Swiss nationals are not subject to withholding tax (impôt à la source).'],
      exempt: true,
    };
  }

  const permitUpper = (permit || '').toUpperCase();

  if (permitUpper === 'C') {
    return {
      tariffCode: '',
      notes: ['C-permit holders (permanent residents) are not subject to withholding tax.'],
      exempt: true,
    };
  }

  // Determine the letter
  let letter = 'A'; // default: single

  if (maritalStatus === 'married') {
    if (spouseHasSwissIncome) {
      letter = 'C'; // double earner
      notes.push('Married with spouse earning Swiss income → Tariff C (double earner).');
    } else {
      letter = 'B'; // single earner
      notes.push('Married, single earner → Tariff B.');
    }
  } else if (['single', 'divorced', 'widowed', 'separated'].includes(maritalStatus)) {
    if (childrenCount > 0 && isSingleParent) {
      letter = 'H'; // single parent with children
      notes.push('Single parent with children → Tariff H.');
    } else {
      letter = 'A';
      notes.push(`${maritalStatus.charAt(0).toUpperCase() + maritalStatus.slice(1)} → Tariff A.`);
    }
  }

  // Cross-border workers
  if (residence === 'abroad') {
    if (permitUpper === 'G') {
      // G-permit (frontalier)
      if (letter === 'A' || letter === 'C') letter = 'G';
      else if (letter === 'B') letter = 'M';
      else if (letter === 'H') letter = 'P';
      notes.push(`Cross-border worker (G-permit) → adjusted to Tariff ${letter}.`);
    } else if (permitUpper === 'L') {
      letter = 'L';
      notes.push('Short-term resident abroad (L-permit) → Tariff L.');
    }
  }

  // Children count (0-5, capped)
  const kids = Math.min(Math.max(childrenCount, 0), 5);

  // For A/C/E codes, digit is always 0 (no child deduction for single/secondary)
  const digit = (letter === 'A' || letter === 'C' || letter === 'E')
    ? 0
    : kids;

  const tariffCode = `${letter}${digit}`;

  // Verify the code exists in the tariff file
  const tables = parseTariffFile();
  if (!tables.has(`${tariffCode}N`)) {
    notes.push(`Warning: Tariff code ${tariffCode} not found in Geneva tariff file. Using A0 as fallback.`);
    return { tariffCode: 'A0', notes, exempt: false };
  }

  return { tariffCode, notes, exempt: false };
}

/**
 * Clear the tariff cache (useful for testing or reloading)
 */
export function clearTariffCache(): void {
  tariffCache = null;
  availableCodes = [];
}
