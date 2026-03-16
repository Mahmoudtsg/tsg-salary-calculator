import React, { useState, useEffect, useCallback } from 'react';
import { Card, InputField, SelectField, Button, Disclaimer, ResultRow, Spinner, ErrorAlert, HelpTip } from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { api } from '../services/api';
import { exportB2BPDF, PDFAlignedOptions } from '../services/pdfExport';
import type { B2BResult, PricingMode, RateType, FXData, EmployeeIdentity } from '../types';

const STORAGE_KEY = 'tsg_b2b_inputs';
function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

interface Props { fxData: FXData | null; identity: EmployeeIdentity; onIdentityChange: (id: EmployeeIdentity) => void; }

export default function B2BMode({ fxData, identity, onIdentityChange }: Props) {
  const saved = loadSaved();
  const [costRate, setCostRate] = useState<string>(saved?.costRate || '800');
  const [rateType, setRateType] = useState<RateType>(saved?.rateType || 'DAILY');
  const [currency, setCurrency] = useState<string>(saved?.currency || 'CHF');
  const [pricingMode, setPricingMode] = useState<PricingMode>(saved?.pricingMode || 'TARGET_MARGIN');
  const [targetMargin, setTargetMargin] = useState<string>(saved?.targetMargin || '30');
  const [clientRate, setClientRate] = useState<string>(saved?.clientRate || '1100');
  const [hoursPerDay, setHoursPerDay] = useState<string>(saved?.hoursPerDay || '8');
  const [workingDays, setWorkingDays] = useState<string>(saved?.workingDays || '220');

  // TARGET_MARGIN: minimum daily margin floor
  const [minDailyMargin, setMinDailyMargin] = useState<string>(saved?.minDailyMargin || '120');

  // CLIENT_BUDGET fields
  const [clientDailyRate, setClientDailyRate] = useState<string>(saved?.clientDailyRate || '1300');
  const [budgetMarginPercent, setBudgetMarginPercent] = useState<string>(saved?.budgetMarginPercent || '30');
  const [socialMultiplier, setSocialMultiplier] = useState<string>(saved?.socialMultiplier || '1.2');

  const [showIdentity, setShowIdentity] = useState(false);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  const [result, setResult] = useState<B2BResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBudgetMode = pricingMode === 'CLIENT_BUDGET';

  // Reset alignmentCurrency when it matches the base currency
  useEffect(() => {
    if (alignmentCurrency === currency) {
      const fallback = ['CHF', 'EUR', 'RON'].find(c => c !== currency) || 'CHF';
      setAlignmentCurrency(fallback);
    }
  }, [currency]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      costRate, rateType, currency, pricingMode, targetMargin, clientRate,
      clientDailyRate, budgetMarginPercent, socialMultiplier,
      minDailyMargin, hoursPerDay, workingDays, alignmentCurrency,
    }));
  }, [costRate, rateType, currency, pricingMode, targetMargin, clientRate,
      clientDailyRate, budgetMarginPercent, socialMultiplier,
      minDailyMargin, hoursPerDay, workingDays, alignmentCurrency]);

  // --- Live CLIENT_BUDGET preview ---
  const budgetPreview = isBudgetMode ? (() => {
    const budget = Number(clientDailyRate) || 0;
    const margin = Number(budgetMarginPercent) || 0;
    const mult = Number(socialMultiplier) || 1.2;
    if (budget <= 0) return null;
    const marginAmt = budget * margin / 100;
    const employerCost = budget - marginAmt;
    const maxRate = employerCost / mult;
    return { budget, marginAmt, employerCost, mult, maxRate };
  })() : null;

  const calculate = useCallback(async () => {
    if (!isBudgetMode && (!costRate || Number(costRate) <= 0)) {
      setError('Please enter a valid cost rate.');
      return;
    }
    if (isBudgetMode && (!clientDailyRate || Number(clientDailyRate) <= 0)) {
      setError('Please enter a valid Client Budget (Daily Rate).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        costRate: isBudgetMode ? 0 : Number(costRate),
        rateType,
        costCurrency: currency,
        pricingMode,
        hoursPerDay: rateType === 'HOURLY' ? Number(hoursPerDay) : undefined,
        workingDaysPerYear: Number(workingDays),
      };

      if (pricingMode === 'TARGET_MARGIN') {
        payload.costRate = Number(costRate);
        payload.targetMarginPercent = Number(targetMargin);
        payload.minDailyMargin = Number(minDailyMargin);
        payload.minDailyMarginCurrency = 'CHF'; // floor is always expressed in CHF
      } else if (pricingMode === 'CLIENT_RATE') {
        payload.clientRate = Number(clientRate);
      } else if (pricingMode === 'CLIENT_BUDGET') {
        payload.clientDailyRate = Number(clientDailyRate);
        payload.budgetMarginPercent = Number(budgetMarginPercent);
        payload.socialMultiplier = Number(socialMultiplier);
      }

      const data = await api.calculateB2B(payload) as B2BResult;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, [costRate, rateType, currency, pricingMode, targetMargin, clientRate,
      clientDailyRate, budgetMarginPercent, socialMultiplier,
      minDailyMargin, hoursPerDay, workingDays, isBudgetMode]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={currency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT: Inputs ====== */}
      <div className="space-y-4">
        <Card title="B2B Configuration">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Rate Type"
              value={rateType}
              onChange={(v) => setRateType(v as RateType)}
              options={[
                { value: 'DAILY', label: 'Daily Rate' },
                { value: 'HOURLY', label: 'Hourly Rate' },
              ]}
            />
            <SelectField
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'CHF', label: 'CHF' },
                { value: 'EUR', label: 'EUR' },
                { value: 'RON', label: 'RON' },
              ]}
            />
          </div>

          {rateType === 'HOURLY' && (
            <InputField label="Hours per Day" value={hoursPerDay} onChange={setHoursPerDay} min={1} max={24}
              help="Used to convert hourly rate to daily rate." />
          )}

          <InputField label="Working Days per Year" value={workingDays} onChange={setWorkingDays} min={1} max={365}
            help="Used for annual projections (default: 220)." />
        </Card>

        <Card title="Pricing Mode">
          <SelectField
            label="Mode"
            value={pricingMode}
            onChange={(v) => setPricingMode(v as PricingMode)}
            options={[
              { value: 'TARGET_MARGIN', label: 'Target Margin %' },
              { value: 'CLIENT_RATE', label: 'Client Daily Rate' },
              { value: 'CLIENT_BUDGET', label: 'Client Budget (Daily Rate)' },
            ]}
            help={
              pricingMode === 'TARGET_MARGIN'
                ? 'Compute client rate from cost rate and target margin. A minimum daily margin floor is enforced.'
                : pricingMode === 'CLIENT_RATE'
                ? 'You know the client rate and cost rate — compute the margin.'
                : 'Compute the maximum daily rate from the client budget, margin, and social charges multiplier.'
            }
          />

          {/* ---- TARGET_MARGIN ---- */}
          {pricingMode === 'TARGET_MARGIN' && (
            <>
              <InputField
                label={`Contractor Cost (${rateType === 'HOURLY' ? 'per hour' : 'per day'})`}
                value={costRate} onChange={setCostRate} suffix={currency} min={0}
                help="The daily rate you pay to the contractor." />
              <InputField label="Target Margin" value={targetMargin} onChange={setTargetMargin} suffix="%"
                min={0} max={99}
                help="Desired profit margin as % of revenue. Formula: Client Rate = Cost / (1 - Margin%)" />
              <InputField label="Min. Daily Margin Floor" value={minDailyMargin} onChange={setMinDailyMargin}
                suffix="CHF" min={0}
                help="If the calculated daily margin falls below this floor, the Client Rate is bumped to Cost + Floor. Value is in CHF and auto-converted to the working currency." />
            </>
          )}

          {/* ---- CLIENT_RATE ---- */}
          {pricingMode === 'CLIENT_RATE' && (
            <>
              <InputField
                label={`Contractor Cost (${rateType === 'HOURLY' ? 'per hour' : 'per day'})`}
                value={costRate} onChange={setCostRate} suffix={currency} min={0}
                help="The rate you pay to the contractor." />
              <InputField label={`Client Rate (${rateType === 'HOURLY' ? 'per hour' : 'per day'})`}
                value={clientRate} onChange={setClientRate} suffix={currency}
                help="The rate charged to the client." />
            </>
          )}

          {/* ---- CLIENT_BUDGET ---- */}
          {pricingMode === 'CLIENT_BUDGET' && (
            <>
              <InputField label="Client Budget (Daily Rate)" value={clientDailyRate} onChange={setClientDailyRate}
                suffix={currency} min={0}
                help="The daily rate the client pays (their total budget per day)." />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Margin on Sales" value={budgetMarginPercent} onChange={setBudgetMarginPercent}
                  suffix="%" min={0} max={99} step={1}
                  help="Target profit margin as % of client budget (e.g. 30% of 1,300 = 390)." />
                <InputField label="Social Multiplier" value={socialMultiplier} onChange={setSocialMultiplier}
                  min={1} max={3} step={0.01}
                  help="Social charges factor on top of employer cost (default 1.2 = 20% social charges). Max Daily Rate = Employer Cost / Multiplier." />
              </div>

              {/* Live budget breakdown preview */}
              {budgetPreview && (
                <div className="mt-2 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg space-y-1.5">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Budget Breakdown Preview</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-gray-600">Client Budget / day:</span>
                    <span className="text-right font-mono font-medium">{fmt(budgetPreview.budget)} {currency}</span>
                    <span className="text-gray-600">Margin ({budgetMarginPercent}%):</span>
                    <span className="text-right font-mono font-medium text-green-700">{fmt(budgetPreview.marginAmt)} {currency}</span>
                    <span className="text-gray-600">Employer Cost:</span>
                    <span className="text-right font-mono font-medium">{fmt(budgetPreview.employerCost)} {currency}</span>
                    <span className="text-gray-600">÷ Social Multiplier ({socialMultiplier}):</span>
                    <span className="text-right font-mono font-bold text-blue-800">{fmt(budgetPreview.maxRate)} {currency}/day</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 italic">Max Daily Rate = Employer Cost / Social Multiplier</p>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Employee Identity */}
        <Card>
          <button onClick={() => setShowIdentity(!showIdentity)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>Employee Details (optional)</span>
            <span className={`transform transition-transform ${showIdentity ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showIdentity && <div className="mt-4"><EmployeeIdentityFields identity={identity} onChange={onIdentityChange} /></div>}
        </Card>

        <div className="flex gap-3">
          <Button onClick={calculate} disabled={loading} className="flex-1">
            {loading ? 'Calculating...' : 'Calculate'}
          </Button>
          {result && (
            <Button variant="outline" onClick={() => exportB2BPDF(result, { costRate: Number(costRate), rateType, pricingMode, currency }, identity, showAligned ? { showAligned, alignmentCurrency, rates } as PDFAlignedOptions : undefined)}>
              Download PDF
            </Button>
          )}
        </div>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      </div>

      {/* ====== RIGHT: Results ====== */}
      <div className="space-y-4">
        {loading && <Spinner />}

        {result && !loading && (
          <>
            {/* Aligned Currency Panel — only when FX data is available */}
            {fxData && (
              <AlignedCurrencyPanel baseCurrency={currency} fxData={fxData}
                alignmentCurrency={alignmentCurrency} setAlignmentCurrency={setAlignmentCurrency}
                showAligned={showAligned} setShowAligned={setShowAligned} />
            )}

            {/* ===== CLIENT_BUDGET: Budget Breakdown ===== */}
            {result.budgetBreakdown && (
              <Card title="Budget Breakdown">
                <div className="space-y-0.5">
                  <ResultRow label="Client Budget / Day" value="" highlight>
                    <span className="text-sm font-mono text-tsg-blue-700">{av(result.budgetBreakdown.clientBudgetDaily)}</span>
                  </ResultRow>
                  <ResultRow label={`Margin (${result.budgetBreakdown.budgetMarginPercent}% on sales)`} value="">
                    <span className="text-sm font-mono text-green-700 font-semibold">{av(result.budgetBreakdown.marginAmount)}</span>
                  </ResultRow>
                  <ResultRow label="Employer Cost" value="">
                    <span className="text-sm font-mono text-gray-800">{av(result.budgetBreakdown.employerCost)}</span>
                  </ResultRow>
                  <div className="border-t border-gray-200 pt-1 mt-1">
                    <ResultRow label={`÷ Social Multiplier (${result.budgetBreakdown.socialMultiplier})`} value="" />
                    <ResultRow label="Max Daily Rate" value="" highlight>
                      <span className="text-sm font-mono font-bold text-tsg-blue-700">{av(result.budgetBreakdown.maxDailyRate)}</span>
                    </ResultRow>
                  </div>
                </div>
              </Card>
            )}

            {/* ===== MIN MARGIN FLOOR ALERT (TARGET_MARGIN) ===== */}
            {result.minMarginFloorApplied && result.minMarginFloorExplanation && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Minimum Daily Margin Floor Applied</p>
                    <p className="text-xs text-amber-700 mt-1">{result.minMarginFloorExplanation}</p>
                    {result.originalClientRateDaily !== undefined && (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                        <span className="text-amber-600">Original Client Rate:</span>
                        <span className="text-right font-mono line-through text-amber-500">{fmt(result.originalClientRateDaily)} {currency}</span>
                        <span className="text-amber-600">Original Margin:</span>
                        <span className="text-right font-mono line-through text-amber-500">{fmt(result.originalMarginAmount ?? 0)} {currency}</span>
                        <span className="text-amber-800 font-semibold">Adjusted Client Rate:</span>
                        <span className="text-right font-mono font-bold text-amber-800">{fmt(result.clientRateDaily)} {currency}</span>
                        <span className="text-amber-800 font-semibold">Applied Margin:</span>
                        <span className="text-right font-mono font-bold text-amber-800">{fmt(result.marginAmount)} {currency}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Card title="Profitability Analysis">
              <ResultRow label="Client Daily Rate" value="" highlight>
                <span className="text-sm font-mono text-tsg-blue-700">{av(result.clientRateDaily)}</span>
              </ResultRow>
              <ResultRow label={isBudgetMode ? 'Max Daily Rate (Contractor)' : 'Cost Daily Rate'} value="">
                <span className="text-sm font-mono text-gray-800">{av(result.costRateDaily)}</span>
              </ResultRow>
              <ResultRow label="Daily Margin" value="" highlight>
                <span className={`text-sm font-mono font-semibold ${result.marginAmount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {av(result.marginAmount)}
                </span>
              </ResultRow>
              <div className="my-2 border-t border-gray-200"></div>
              <ResultRow label="Margin %" value={`${result.marginPercent.toFixed(1)}%`}
                help="Margin as percentage of client rate (revenue)." />
              <ResultRow label="Markup %" value={`${result.markupPercent.toFixed(1)}%`}
                help="Markup as percentage of cost rate." />
            </Card>

            <Card title="Annual Projections">
              <ResultRow label="Annual Revenue" value=""><span className="text-sm font-mono text-gray-800">{av(result.annualRevenue)}</span></ResultRow>
              <ResultRow label="Annual Cost" value=""><span className="text-sm font-mono text-gray-800">{av(result.annualCost)}</span></ResultRow>
              <ResultRow label="Annual Profit" value="" highlight>
                <span className={`text-sm font-mono font-semibold ${result.annualProfit >= 0 ? 'text-tsg-blue-700' : 'text-red-600'}`}>
                  {av(result.annualProfit)}
                </span>
              </ResultRow>
            </Card>

            {/* Visual Margin Bar */}
            <Card>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Margin Visualization</h4>
              <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(result.marginPercent, 0), 100)}%`,
                    background: result.marginPercent >= 0
                      ? `linear-gradient(90deg, #2E86C1, #27AE60)`
                      : '#E74C3C',
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                  {result.marginPercent.toFixed(1)}% margin
                </span>
              </div>
            </Card>

            <Disclaimer />
          </>
        )}

        {!result && !loading && (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">B2B contractor cost & margin modeling</p>
              <p className="text-xs mt-1">No payroll taxes - pure cost vs revenue analysis</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
