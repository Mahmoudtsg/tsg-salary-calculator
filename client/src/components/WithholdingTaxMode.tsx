import React, { useState, useEffect } from 'react';
import { Card, InputField, SelectField, Toggle, Button, ResultRow, Spinner, ErrorAlert, Disclaimer, HelpTip } from './UIComponents';
import { api } from '../services/api';

// ============================================================
// Withholding Tax (Impôt à la source) - Geneva & Vaud - Mode
// Complete scenario coverage for all worker types
// ============================================================

const STORAGE_KEY = 'tsg_withholding_inputs';

function loadSaved(): any {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

const NATIONALITY_OPTIONS = [
  { value: 'foreign', label: 'Foreign' },
  { value: 'swiss', label: 'Swiss' },
];

const PERMIT_OPTIONS = [
  { value: 'B', label: 'B – Annual residence' },
  { value: 'L', label: 'L – Short-term' },
  { value: 'G', label: 'G – Cross-border (frontalier)' },
  { value: 'C', label: 'C – Permanent residence' },
  { value: 'F', label: 'F – Provisionally admitted' },
  { value: 'N', label: 'N – Asylum seeker' },
  { value: 'other', label: 'Other' },
];

const RESIDENCE_OPTIONS_GE = [
  { value: 'geneva', label: 'Geneva (canton)' },
  { value: 'other_swiss_canton', label: 'Other Swiss canton' },
  { value: 'france', label: 'France (cross-border)' },
  { value: 'other_abroad', label: 'Other country abroad' },
];

const RESIDENCE_OPTIONS_VD = [
  { value: 'vaud', label: 'Vaud (canton)' },
  { value: 'other_swiss_canton', label: 'Other Swiss canton' },
  { value: 'france', label: 'France (cross-border)' },
  { value: 'germany', label: 'Germany (cross-border)' },
  { value: 'other_abroad', label: 'Other country abroad' },
];

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married / Registered partnership' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

const TARIFF_LETTERS_GE: Record<string, string> = {
  A: 'Single / widowed / divorced / separated',
  B: 'Married, single-earner household',
  C: 'Secondary income / double-earner household',
  E: 'Expatriate (flat rate)',
  G: 'Cross-border worker (frontalier) – single/double',
  H: 'Single with children (single parent)',
  L: 'Short-term L-permit, living abroad',
  M: 'Cross-border – married, single-earner',
  N: 'Cross-border – married, double-earner',
  P: 'Cross-border – single parent with children',
  Q: 'Cross-border – secondary activity',
};

const TARIFF_LETTERS_VD: Record<string, string> = {
  A: 'Single / divorced / widowed / separated (resident)',
  B: 'Married, single-earner household (resident)',
  C: 'Married, double-earner household (resident)',
  H: 'Single parent living with children',
  G: 'Compensation income not paid through employer',
  I: 'Capital benefit – single person',
  J: 'Capital benefit – married',
  K: 'Capital benefit – married double-earner',
  L: 'German frontalier – single (capped 4.50%)',
  M: 'German frontalier – married, single-earner (capped 4.50%)',
  N: 'German frontalier – married, double-earner (capped 4.50%)',
  P: 'German frontalier – single parent (capped 4.50%)',
  Q: 'German frontalier – compensation income (capped 4.50%)',
};

interface WithholdingResult {
  tariffCode: string;
  church?: string;
  grossMonthly: number;
  taxAmount: number;
  effectiveRate: number;
  bracketFrom?: number;
  bracketTo?: number;
  annualisedGross?: number;
  exempt: boolean;
  reason?: string;
  notes: string[];
  warnings: string[];
}

export default function WithholdingTaxMode() {
  const saved = loadSaved();

  const [canton, setCanton] = useState<'GE' | 'VD'>(saved?.canton || 'GE');
  const [grossMonthly, setGrossMonthly] = useState(saved?.grossMonthly || '');
  const [annualGross, setAnnualGross] = useState(saved?.annualGross || '');
  const [nationality, setNationality] = useState(saved?.nationality || 'foreign');
  const [permit, setPermit] = useState(saved?.permit || 'B');
  const [residence, setResidence] = useState(saved?.residence || 'geneva');
  const [maritalStatus, setMaritalStatus] = useState(saved?.maritalStatus || 'single');
  const [childrenCount, setChildrenCount] = useState(saved?.childrenCount || '0');
  const [isSingleParent, setIsSingleParent] = useState(saved?.isSingleParent || false);
  const [spouseHasSwissIncome, setSpouseHasSwissIncome] = useState(saved?.spouseHasSwissIncome || false);
  const [spouseAnnualIncomeCHF, setSpouseAnnualIncomeCHF] = useState(saved?.spouseAnnualIncomeCHF || '');
  const [frenchFrontalierConditionsNotMet, setFrenchFrontalierConditionsNotMet] = useState(saved?.frenchFrontalierConditionsNotMet || false);
  const [church, setChurch] = useState(saved?.church || 'N');
  const [manualCode, setManualCode] = useState(saved?.manualCode || '');
  const [useManualCode, setUseManualCode] = useState(saved?.useManualCode || false);
  const [isShortTerm, setIsShortTerm] = useState(saved?.isShortTerm || false);
  const [assignmentDays, setAssignmentDays] = useState(saved?.assignmentDays || '');

  const [result, setResult] = useState<WithholdingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save inputs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      canton, grossMonthly, annualGross, nationality, permit, residence, maritalStatus,
      childrenCount, isSingleParent, spouseHasSwissIncome, spouseAnnualIncomeCHF,
      frenchFrontalierConditionsNotMet, church, manualCode, useManualCode, isShortTerm, assignmentDays,
    }));
  }, [canton, grossMonthly, annualGross, nationality, permit, residence, maritalStatus,
      childrenCount, isSingleParent, spouseHasSwissIncome, spouseAnnualIncomeCHF,
      frenchFrontalierConditionsNotMet, church, manualCode, useManualCode, isShortTerm, assignmentDays]);

  const handleCalculate = async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const payload: any = {
        grossMonthly: Number(grossMonthly),
      };

      // Church tax only for Geneva
      if (canton === 'GE') {
        payload.church = church;
      }

      if (useManualCode && manualCode.trim()) {
        payload.tariffCode = manualCode.trim().toUpperCase();
      } else {
        payload.nationality = nationality;
        payload.permit = permit;
        payload.residence = residence;
        payload.maritalStatus = maritalStatus;
        payload.childrenCount = Number(childrenCount);
        payload.isSingleParent = isSingleParent;
        payload.spouseHasSwissIncome = spouseHasSwissIncome;
        payload.isShortTermAssignment = isShortTerm;
        if (isShortTerm && assignmentDays) {
          payload.assignmentDays = Number(assignmentDays);
        }
        // Annual gross for 120k threshold
        const annual = annualGross ? Number(annualGross) : Number(grossMonthly) * 12;
        if (annual > 0) payload.annualGrossCHF = annual;

        // VD-specific fields
        if (canton === 'VD') {
          if (residence === 'france') {
            payload.frenchFrontalierConditionsNotMet = frenchFrontalierConditionsNotMet;
          }
          if (maritalStatus === 'married' && spouseHasSwissIncome && spouseAnnualIncomeCHF) {
            payload.spouseAnnualIncomeCHF = Number(spouseAnnualIncomeCHF);
          }
        }
      }

      const data = canton === 'VD'
        ? await api.calculateWithholdingVD(payload) as WithholdingResult
        : await api.calculateWithholding(payload) as WithholdingResult;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Conditional display flags
  const showPermit = nationality === 'foreign' && !isShortTerm && !useManualCode;
  const showResidence = !isShortTerm && !useManualCode;
  const showMaritalStatus = !useManualCode;
  const showChildren = !useManualCode;
  const showSpouseField = maritalStatus === 'married' && !useManualCode && !isShortTerm;
  const showSingleParent = ['single', 'divorced', 'widowed', 'separated'].includes(maritalStatus)
    && Number(childrenCount) > 0 && !useManualCode && !isShortTerm;
  const livesInCH = residence === 'geneva' || residence === 'vaud' || residence === 'other_swiss_canton';
  const showAnnualGross = !useManualCode && !isShortTerm
    && nationality === 'foreign'
    && ['B', 'F', 'N', 'L', 'other'].includes(permit)
    && livesInCH;
  const showFrenchFrontalierField = canton === 'VD' && residence === 'france' && !useManualCode && !isShortTerm;
  const showSpouseIncome = canton === 'VD' && showSpouseField;
  const residenceOptions = canton === 'VD' ? RESIDENCE_OPTIONS_VD : RESIDENCE_OPTIONS_GE;
  const tariffLetters = canton === 'VD' ? TARIFF_LETTERS_VD : TARIFF_LETTERS_GE;

  // Scenario hint for the user
  const scenarioHint = getScenarioHint(nationality, permit, residence, isShortTerm, useManualCode, canton);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            Impôt à la source ({canton})
            <span className="ml-2 text-xs font-normal text-gray-400">
              Withholding Tax — {canton === 'GE' ? 'Geneva 2026' : 'Vaud 2025'}
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {canton === 'GE'
              ? 'Based on the official Geneva tariff tables (barèmes) for tax year 2026'
              : 'Based on the official ACI Vaud tariff tables (barèmes) for tax year 2025'}
          </p>
        </div>
        {/* Canton toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => { setCanton('GE'); setResidence('geneva'); setResult(null); }}
              className={`px-3 py-1.5 transition-colors ${canton === 'GE' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >GE</button>
            <button
              onClick={() => { setCanton('VD'); setResidence('vaud'); setResult(null); }}
              className={`px-3 py-1.5 transition-colors ${canton === 'VD' ? 'bg-tsg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >VD</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ====== Input Panel ====== */}
        <div className="lg:col-span-1 space-y-4">
          {/* Gross salary */}
          <Card title="Monthly Gross Salary">
            <InputField
              label="Gross Monthly Salary"
              value={grossMonthly}
              onChange={setGrossMonthly}
              suffix="CHF"
              min={0}
              step={50}
              placeholder="e.g. 7500"
              help="The monthly gross salary before any deductions, in Swiss Francs."
            />
            {showAnnualGross && (
              <InputField
                label="Annual Gross (if different from × 12)"
                value={annualGross}
                onChange={setAnnualGross}
                suffix="CHF"
                min={0}
                step={1000}
                placeholder={grossMonthly ? `auto: ${(Number(grossMonthly) * 12).toLocaleString('en')}` : 'Optional'}
                help="Only fill this if the annual gross differs from monthly × 12 (e.g. 13th month, bonus). Used for the 120,000 CHF TOU threshold check."
              />
            )}
          </Card>

          {/* Personal situation */}
          <Card title="Personal Situation">
            {/* Short-term assignment toggle */}
            <Toggle
              label="Short-term assignment (< 90 days, no permit)"
              checked={isShortTerm}
              onChange={(v) => {
                setIsShortTerm(v);
                if (v) {
                  setPermit('');
                }
              }}
              help="For temporary assignments under 90 days where no Swiss residence permit is held. Always subject to IS regardless of nationality."
            />

            {isShortTerm && (
              <InputField
                label="Assignment Duration"
                value={assignmentDays}
                onChange={setAssignmentDays}
                suffix="days"
                min={1}
                max={365}
                step={1}
                placeholder="e.g. 45"
                help="Number of working days in Switzerland. If > 90 days, a warning is issued that a permit may be required."
              />
            )}

            <Toggle
              label="Use manual barème code"
              checked={useManualCode}
              onChange={setUseManualCode}
              help="Override automatic tariff determination. Enter the 2-character code directly (e.g. A0, B2, H1)."
            />

            {useManualCode ? (
              <div>
                <InputField
                  label="Barème Code"
                  value={manualCode}
                  onChange={setManualCode}
                  type="text"
                  placeholder={canton === 'VD' ? 'e.g. A0, B2, H1, L0, M2' : 'e.g. A0, B2, H1, G0, M2'}
                  help={`The ${canton === 'VD' ? 'Vaud' : 'Geneva'} withholding tax tariff code. Letter = category, digit = children count.`}
                />
                <div className="mt-2 p-2 bg-gray-50 rounded text-[10px] text-gray-500 space-y-0.5">
                  <p className="font-semibold text-gray-600 mb-1">Resident in Switzerland:</p>
                  {(canton === 'VD' ? ['A', 'B', 'C', 'H'] : ['A', 'B', 'C', 'H', 'E']).map(k => (
                    <div key={k}><strong>{k}</strong>: {tariffLetters[k]}</div>
                  ))}
                  <p className="font-semibold text-gray-600 mt-2 mb-1">
                    {canton === 'VD' ? 'German frontaliers (living abroad):' : 'Cross-border (living abroad):'}
                  </p>
                  {(canton === 'VD' ? ['L', 'M', 'N', 'P', 'Q', 'G'] : ['G', 'M', 'N', 'P', 'Q', 'L']).map(k => (
                    <div key={k}><strong>{k}</strong>: {tariffLetters[k]}</div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {!isShortTerm && (
                  <SelectField
                    label="Nationality"
                    value={nationality}
                    onChange={setNationality}
                    options={NATIONALITY_OPTIONS}
                  />
                )}

                {showPermit && (
                  <SelectField
                    label="Residence Permit"
                    value={permit}
                    onChange={setPermit}
                    options={PERMIT_OPTIONS}
                    help="The type of Swiss residence permit held by the employee."
                  />
                )}

                {showResidence && (
                  <SelectField
                    label="Place of Residence"
                    value={residence}
                    onChange={setResidence}
                    options={residenceOptions}
                    help="Where the employee actually lives. Cross-border workers (frontaliers) live abroad."
                  />
                )}

                {showFrenchFrontalierField && (
                  <Toggle
                    label="French frontalier conditions NOT met"
                    checked={frenchFrontalierConditionsNotMet}
                    onChange={setFrenchFrontalierConditionsNotMet}
                    help="In Vaud, French frontaliers are normally taxed in France (exempt from IS). Toggle ON if the return-to-France or telework conditions are not met — IS then applies in Switzerland."
                  />
                )}

                {showMaritalStatus && (
                  <SelectField
                    label="Marital Status"
                    value={maritalStatus}
                    onChange={setMaritalStatus}
                    options={MARITAL_OPTIONS}
                  />
                )}

                {showChildren && (
                  <InputField
                    label="Number of Children"
                    value={childrenCount}
                    onChange={setChildrenCount}
                    min={0}
                    max={9}
                    step={1}
                    help="Dependent children under 18 or in education (up to 25). Affects the tariff digit (0-5, capped)."
                  />
                )}

                {showSingleParent && (
                  <Toggle
                    label="Single parent (garde exclusive)"
                    checked={isSingleParent}
                    onChange={setIsSingleParent}
                    help="If you have sole custody of the child(ren), tariff H (or P for cross-border) applies instead of A (or G)."
                  />
                )}

                {showSpouseField && (
                  <Toggle
                    label="Spouse has Swiss income"
                    checked={spouseHasSwissIncome}
                    onChange={setSpouseHasSwissIncome}
                    help="If your spouse also earns income in Switzerland, tariff C (or N for cross-border) applies instead of B (or M)."
                  />
                )}

                {showSpouseIncome && spouseHasSwissIncome && (
                  <InputField
                    label="Spouse Annual Income (optional)"
                    value={spouseAnnualIncomeCHF}
                    onChange={setSpouseAnnualIncomeCHF}
                    suffix="CHF/yr"
                    min={0}
                    step={1000}
                    placeholder="e.g. 60000"
                    help="Vaud uses the spouse's annual income to determine the median income threshold for tariff C determination."
                  />
                )}
              </>
            )}

            {canton === 'GE' && (
              <SelectField
                label="Church Tax"
                value={church}
                onChange={setChurch}
                options={[
                  { value: 'N', label: 'N – No church tax' },
                  { value: 'Y', label: 'Y – Church tax applicable' },
                ]}
                help="Whether the person is a member of a recognized church (Catholic, Protestant, or Old Catholic in Geneva)."
              />
            )}
          </Card>

          {/* Scenario hint */}
          {scenarioHint && !useManualCode && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700 flex items-start gap-1.5">
                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{scenarioHint}</span>
              </p>
            </div>
          )}

          {/* Calculate */}
          <Button onClick={handleCalculate} disabled={loading || !grossMonthly} className="w-full">
            {loading ? 'Calculating…' : 'Calculate Withholding Tax'}
          </Button>
        </div>

        {/* ====== Results Panel ====== */}
        <div className="lg:col-span-2 space-y-4">
          {loading && <Spinner />}
          {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

          {result && (
            <>
              {/* Warnings */}
              {result.warnings && result.warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="text-sm font-semibold text-amber-800">Important Notices</span>
                  </div>
                  <ul className="space-y-2">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 pl-7">{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Exempt badge */}
              {result.exempt && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-green-800">Not subject to withholding tax (IS)</span>
                  </div>
                  {result.reason && (
                    <p className="text-xs text-green-700 mt-1 pl-7 font-medium">{result.reason}</p>
                  )}
                  <p className="text-xs text-green-600 mt-2 pl-7">
                    This person is subject to ordinary taxation (déclaration d'impôt ordinaire), not IS.
                  </p>
                </div>
              )}

              {/* Main result */}
              {!result.exempt && (
                <Card title="Withholding Tax Result">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Tax Amount — prominent display */}
                    <div className="col-span-2 bg-tsg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-xs text-tsg-blue-600 uppercase font-semibold mb-1">Monthly Withholding Tax</p>
                      <p className="text-3xl font-bold text-tsg-blue-800">{fmt(result.taxAmount)} <span className="text-lg">CHF</span></p>
                      <p className="text-sm text-tsg-blue-600 mt-1">Effective rate: {result.effectiveRate}%</p>
                    </div>
                  </div>

                  <ResultRow label="Gross Monthly Salary" value={`${fmt(result.grossMonthly)} CHF`} />
                  <ResultRow label="Withholding Tax (IS)" value={`− ${fmt(result.taxAmount)} CHF`} />
                  <ResultRow
                    label="Net After IS"
                    value={`${fmt(result.grossMonthly - result.taxAmount)} CHF`}
                    highlight
                  />
                  <ResultRow label="Tariff Code" value={`${result.tariffCode}${result.church ?? ''}`} />
                  {result.bracketFrom !== undefined && result.bracketTo !== undefined && (
                    <ResultRow label="Income Bracket" value={`${fmt(result.bracketFrom)} – ${fmt(result.bracketTo)} CHF`} />
                  )}
                  {result.annualisedGross !== undefined && (
                    <ResultRow label="Annualised Gross (rate basis)" value={`${fmt(result.annualisedGross)} CHF`} />
                  )}

                  {/* Annual projection */}
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Annual Projection (× 12 months)</h4>
                    <ResultRow label="Annual Gross" value={`${fmt(result.grossMonthly * 12)} CHF`} />
                    <ResultRow label="Annual IS Tax" value={`${fmt(result.taxAmount * 12)} CHF`} />
                    <ResultRow
                      label="Annual Net After IS"
                      value={`${fmt((result.grossMonthly - result.taxAmount) * 12)} CHF`}
                      highlight
                    />
                  </div>

                  {/* Visual bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Net: {(100 - result.effectiveRate).toFixed(1)}%</span>
                      <span>Tax: {result.effectiveRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-tsg-blue-500 rounded-full transition-all"
                        style={{ width: `${100 - result.effectiveRate}%` }}
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Notes */}
              {result.notes.length > 0 && (
                <Card title="Determination Notes">
                  <ul className="space-y-1.5">
                    {result.notes.map((note, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <svg className="w-3.5 h-3.5 text-tsg-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {note}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Quick reference table */}
              {!result.exempt && (
                <Card title="Tariff Quick Reference">
                  <p className="text-[10px] text-gray-500 mb-2">
                    Withholding tax for selected monthly gross levels using tariff <strong>{result.tariffCode}{result.church ?? ''}</strong>:
                  </p>
                  <QuickReferenceTable tariffCode={result.tariffCode} church={result.church ?? ''} currentGross={result.grossMonthly} canton={canton} />
                </Card>
              )}

              <Disclaimer />
            </>
          )}

          {/* Pre-calculation info */}
          {!result && !loading && !error && (
            <Card>
              <div className="text-center py-6">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">
                  Enter a gross monthly salary and personal details, then click <strong>Calculate</strong>.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {canton === 'GE'
                    ? 'Based on official Geneva cantonal withholding tax tariffs (barèmes) 2026.'
                    : 'Based on official ACI Vaud withholding tax tariffs (barèmes) 2025.'}
                </p>
              </div>

              {/* Scenario guide */}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Who is subject to IS?</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                  <ScenarioCard
                    title="Foreign with B/L/F/N permit"
                    description="Living in Switzerland → standard IS tariffs (A/B/C/H)"
                    subject
                  />
                  {canton === 'GE' ? (
                    <ScenarioCard
                      title="G-permit (frontalier)"
                      description="Living abroad, working in GE → cross-border tariffs (G/M/N/P)"
                      subject
                    />
                  ) : (
                    <ScenarioCard
                      title="French frontalier (VD)"
                      description="Living in France → normally EXEMPT, taxed in France under the 1983 Franco-Swiss agreement"
                      subject={false}
                    />
                  )}
                  {canton === 'GE' ? (
                    <ScenarioCard
                      title="Swiss living abroad"
                      description="Commuting to Geneva → same as cross-border (G/M/N/P)"
                      subject
                    />
                  ) : (
                    <ScenarioCard
                      title="German frontalier (VD)"
                      description="Living in Germany → IS applies, tariffs L/M/N/P capped at 4.50%"
                      subject
                    />
                  )}
                  <ScenarioCard
                    title="C-permit living abroad"
                    description="Lost ordinary taxation → cross-border tariffs"
                    subject
                  />
                  <ScenarioCard
                    title="Short-term (< 90 days)"
                    description="No permit needed → IS applies regardless of nationality"
                    subject
                  />
                  <ScenarioCard
                    title="Swiss in Switzerland"
                    description="Ordinary taxation → NOT subject to IS"
                    subject={false}
                  />
                  <ScenarioCard
                    title="C-permit in Switzerland"
                    description="Permanent resident → ordinary taxation, NOT IS"
                    subject={false}
                  />
                  <ScenarioCard
                    title="B-permit > 120k CHF/yr"
                    description="TOU: IS withheld but year-end ordinary assessment"
                    subject
                    special
                  />
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Scenario hint helper ----
function getScenarioHint(
  nationality: string,
  permit: string,
  residence: string,
  isShortTerm: boolean,
  useManualCode: boolean,
  canton: 'GE' | 'VD' = 'GE',
): string | null {
  if (useManualCode || isShortTerm) return null;

  const livesAbroad = residence === 'france' || residence === 'germany' || residence === 'other_abroad';
  const livesInCH = residence === 'geneva' || residence === 'vaud' || residence === 'other_swiss_canton';

  if (canton === 'VD' && residence === 'france') {
    return 'French frontaliers working in Vaud are normally taxed in France under the Franco-Swiss agreement of 1983 — IS exempt unless conditions not met. Toggle the flag above if telework or return conditions are not satisfied.';
  }
  if (canton === 'VD' && residence === 'germany') {
    return 'German frontaliers working in Vaud → subject to IS with German frontalier tariffs (L/M/N/P), capped at 4.50%.';
  }
  if (nationality === 'swiss' && livesInCH) {
    return 'Swiss national living in Switzerland → NOT subject to IS (ordinary taxation applies).';
  }
  if (nationality === 'swiss' && livesAbroad) {
    return `Swiss national living abroad and working in ${canton === 'VD' ? 'Vaud' : 'Geneva'} → subject to IS as a cross-border worker (frontalier).`;
  }
  if (nationality === 'foreign' && permit === 'C' && livesInCH) {
    return 'C-permit (permanent resident) in Switzerland → NOT subject to IS (ordinary taxation applies).';
  }
  if (nationality === 'foreign' && permit === 'C' && livesAbroad) {
    return 'C-permit holder living abroad → subject to IS. Ordinary taxation applies only while residing in Switzerland.';
  }
  if (nationality === 'foreign' && permit === 'G') {
    return canton === 'VD'
      ? 'G-permit (frontalier) → in Vaud, French frontaliers are normally exempt (taxed in France). German frontaliers use tariffs L/M/N/P (capped 4.50%).'
      : 'G-permit (frontalier) → subject to IS with cross-border tariffs. Geneva applies IS under the Franco-Swiss agreement for residents of France.';
  }
  if (nationality === 'foreign' && permit === 'L' && livesAbroad) {
    return 'L-permit (short-term) living abroad → Tariff L applies (flat cross-border rate).';
  }
  if (nationality === 'foreign' && permit === 'L' && livesInCH) {
    return 'L-permit (short-term) living in Switzerland → standard IS tariffs (A/B/C/H).';
  }
  if (nationality === 'foreign' && ['B', 'F', 'N'].includes(permit) && livesInCH) {
    return `${permit}-permit holder in Switzerland → subject to IS. If annual gross > 120,000 CHF, TOU (year-end ordinary assessment) applies.`;
  }
  return null;
}

// ---- Scenario card for pre-calculation guide ----
function ScenarioCard({ title, description, subject, special }: {
  title: string;
  description: string;
  subject: boolean;
  special?: boolean;
}) {
  return (
    <div className={`p-2 rounded border ${
      special ? 'bg-amber-50 border-amber-200' :
      subject ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
    }`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`inline-block w-2 h-2 rounded-full ${
          special ? 'bg-amber-400' : subject ? 'bg-red-400' : 'bg-green-400'
        }`} />
        <span className={`font-semibold ${
          special ? 'text-amber-700' : subject ? 'text-red-700' : 'text-green-700'
        }`}>{title}</span>
      </div>
      <p className="text-gray-500 pl-3">{description}</p>
    </div>
  );
}

// ---- Quick Reference Sub-Component ----
function QuickReferenceTable({ tariffCode, church, currentGross, canton }: { tariffCode: string; church: string; currentGross: number; canton: 'GE' | 'VD' }) {
  const [rows, setRows] = useState<{ gross: number; tax: number; rate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const grossLevels = [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 20000];
    // Add current gross if not already in the list
    if (!grossLevels.includes(currentGross)) {
      grossLevels.push(currentGross);
      grossLevels.sort((a, b) => a - b);
    }

    const calculate = canton === 'VD'
      ? (g: number) => api.calculateWithholdingVD({ grossMonthly: g, tariffCode })
      : (g: number) => api.calculateWithholding({ grossMonthly: g, tariffCode, church });

    Promise.all(
      grossLevels.map(g =>
        calculate(g)
          .then((r: any) => ({ gross: g, tax: r.taxAmount, rate: r.effectiveRate }))
          .catch(() => ({ gross: g, tax: 0, rate: 0 }))
      )
    ).then(results => {
      setRows(results);
      setLoading(false);
    });
  }, [tariffCode, church, currentGross, canton]);

  if (loading) return <Spinner />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left py-1.5 px-2 font-medium text-gray-500">Gross Monthly</th>
            <th className="text-right py-1.5 px-2 font-medium text-gray-500">IS Tax</th>
            <th className="text-right py-1.5 px-2 font-medium text-gray-500">Rate</th>
            <th className="text-right py-1.5 px-2 font-medium text-gray-500">Net After IS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isCurrent = r.gross === currentGross;
            return (
              <tr
                key={i}
                className={isCurrent ? 'bg-tsg-blue-50 font-semibold' : 'border-b border-gray-50'}
              >
                <td className="py-1.5 px-2 font-mono text-gray-700">
                  {r.gross.toLocaleString('en')} CHF
                  {isCurrent && <span className="ml-1 text-[9px] text-tsg-blue-500">&#9668; current</span>}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-800">{r.tax.toLocaleString('en')} CHF</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-600">{r.rate.toFixed(2)}%</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-800">
                  {(r.gross - r.tax).toLocaleString('en')} CHF
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
