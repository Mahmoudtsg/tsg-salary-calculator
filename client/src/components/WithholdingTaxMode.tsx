import React, { useState, useEffect } from 'react';
import { Card, InputField, SelectField, Toggle, Button, ResultRow, Spinner, ErrorAlert, Disclaimer, HelpTip } from './UIComponents';
import { api } from '../services/api';

// ============================================================
// Withholding Tax (Impôt à la source) - Geneva - Mode
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

const RESIDENCE_OPTIONS = [
  { value: 'geneva', label: 'Geneva (canton)' },
  { value: 'other_canton', label: 'Other Swiss canton' },
  { value: 'abroad', label: 'Abroad (cross-border)' },
];

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married / Registered partnership' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

const TARIFF_LETTERS: Record<string, string> = {
  A: 'Single / widowed / divorced / separated',
  B: 'Married, single-earner household',
  C: 'Secondary income / replacement income',
  E: 'Expatriate (flat rate)',
  G: 'Cross-border (frontalier)',
  H: 'Single with children (single parent)',
  L: 'Cross-border – flat rate',
  M: 'Cross-border – married',
  N: 'Cross-border – married double-earner',
  P: 'Cross-border – single with children',
  Q: 'Cross-border – secondary activity',
};

interface WithholdingResult {
  tariffCode: string;
  church: string;
  grossMonthly: number;
  taxAmount: number;
  effectiveRate: number;
  bracketFrom: number;
  bracketTo: number;
  exempt: boolean;
  notes: string[];
}

export default function WithholdingTaxMode() {
  const saved = loadSaved();

  const [grossMonthly, setGrossMonthly] = useState(saved?.grossMonthly || '');
  const [nationality, setNationality] = useState(saved?.nationality || 'foreign');
  const [permit, setPermit] = useState(saved?.permit || 'B');
  const [residence, setResidence] = useState(saved?.residence || 'geneva');
  const [maritalStatus, setMaritalStatus] = useState(saved?.maritalStatus || 'single');
  const [childrenCount, setChildrenCount] = useState(saved?.childrenCount || '0');
  const [isSingleParent, setIsSingleParent] = useState(saved?.isSingleParent || false);
  const [spouseHasSwissIncome, setSpouseHasSwissIncome] = useState(saved?.spouseHasSwissIncome || false);
  const [church, setChurch] = useState(saved?.church || 'N');
  const [manualCode, setManualCode] = useState(saved?.manualCode || '');
  const [useManualCode, setUseManualCode] = useState(saved?.useManualCode || false);

  const [result, setResult] = useState<WithholdingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save inputs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      grossMonthly, nationality, permit, residence, maritalStatus,
      childrenCount, isSingleParent, spouseHasSwissIncome, church,
      manualCode, useManualCode,
    }));
  }, [grossMonthly, nationality, permit, residence, maritalStatus,
      childrenCount, isSingleParent, spouseHasSwissIncome, church,
      manualCode, useManualCode]);

  const handleCalculate = async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const payload: any = {
        grossMonthly: Number(grossMonthly),
        church,
      };

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
      }

      const data = await api.calculateWithholding(payload) as WithholdingResult;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const showSpouseField = maritalStatus === 'married' && !useManualCode;
  const showSingleParent = ['single', 'divorced', 'widowed', 'separated'].includes(maritalStatus) && Number(childrenCount) > 0 && !useManualCode;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            Impôt à la source (GE)
            <span className="ml-2 text-xs font-normal text-gray-400">Withholding Tax — Geneva 2026</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Based on the official Geneva tariff tables (barèmes) for tax year 2026
          </p>
        </div>
        <span className="px-2 py-1 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full">Canton GE</span>
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
          </Card>

          {/* Personal situation */}
          <Card title="Personal Situation">
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
                  placeholder="e.g. A0, B2, H1"
                  help="The Geneva withholding tax tariff code. Letter = category, digit = children count."
                />
                <div className="mt-2 p-2 bg-gray-50 rounded text-[10px] text-gray-500 space-y-0.5">
                  {Object.entries(TARIFF_LETTERS).map(([k, v]) => (
                    <div key={k}><strong>{k}</strong>: {v}</div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <SelectField
                  label="Nationality"
                  value={nationality}
                  onChange={setNationality}
                  options={NATIONALITY_OPTIONS}
                />
                {nationality === 'foreign' && (
                  <SelectField
                    label="Residence Permit"
                    value={permit}
                    onChange={setPermit}
                    options={PERMIT_OPTIONS}
                    help="The type of Swiss residence permit held."
                  />
                )}
                <SelectField
                  label="Place of Residence"
                  value={residence}
                  onChange={setResidence}
                  options={RESIDENCE_OPTIONS}
                />
                <SelectField
                  label="Marital Status"
                  value={maritalStatus}
                  onChange={setMaritalStatus}
                  options={MARITAL_OPTIONS}
                />
                <InputField
                  label="Number of Children"
                  value={childrenCount}
                  onChange={setChildrenCount}
                  min={0}
                  max={9}
                  step={1}
                  help="Children under 18 or in education (up to 25). Affects the tariff digit."
                />
                {showSingleParent && (
                  <Toggle
                    label="Single parent (garde exclusive)"
                    checked={isSingleParent}
                    onChange={setIsSingleParent}
                    help="If you are the sole parent with custody, tariff H applies instead of A."
                  />
                )}
                {showSpouseField && (
                  <Toggle
                    label="Spouse has Swiss income"
                    checked={spouseHasSwissIncome}
                    onChange={setSpouseHasSwissIncome}
                    help="If your spouse also earns income subject to Swiss taxation, tariff C applies instead of B."
                  />
                )}
              </>
            )}

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
          </Card>

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
              {/* Exempt badge */}
              {result.exempt && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-green-800">Not subject to withholding tax</span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    {result.notes[0]}
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
                  <ResultRow label="Withholding Tax" value={`− ${fmt(result.taxAmount)} CHF`} />
                  <ResultRow
                    label="Net After IS"
                    value={`${fmt(result.grossMonthly - result.taxAmount)} CHF`}
                    highlight
                  />
                  <ResultRow label="Tariff Code" value={`${result.tariffCode}${result.church}`} />
                  <ResultRow label="Income Bracket" value={`${fmt(result.bracketFrom)} – ${fmt(result.bracketTo)} CHF`} />

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
                    Withholding tax for selected monthly gross levels using tariff <strong>{result.tariffCode}{result.church}</strong>:
                  </p>
                  <QuickReferenceTable tariffCode={result.tariffCode} church={result.church} currentGross={result.grossMonthly} />
                </Card>
              )}

              <Disclaimer />
            </>
          )}

          {/* Pre-calculation info */}
          {!result && !loading && !error && (
            <Card>
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">
                  Enter a gross monthly salary and personal details, then click <strong>Calculate</strong>.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Based on official Geneva cantonal withholding tax tariffs (barèmes) 2026.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Quick Reference Sub-Component ----
function QuickReferenceTable({ tariffCode, church, currentGross }: { tariffCode: string; church: string; currentGross: number }) {
  const [rows, setRows] = useState<{ gross: number; tax: number; rate: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const grossLevels = [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 20000];
    // Add current gross if not already in the list
    if (!grossLevels.includes(currentGross)) {
      grossLevels.push(currentGross);
      grossLevels.sort((a, b) => a - b);
    }

    Promise.all(
      grossLevels.map(g =>
        api.calculateWithholding({ grossMonthly: g, tariffCode, church })
          .then((r: any) => ({ gross: g, tax: r.taxAmount, rate: r.effectiveRate }))
          .catch(() => ({ gross: g, tax: 0, rate: 0 }))
      )
    ).then(results => {
      setRows(results);
      setLoading(false);
    });
  }, [tariffCode, church, currentGross]);

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
                  {isCurrent && <span className="ml-1 text-[9px] text-tsg-blue-500">◄ current</span>}
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
