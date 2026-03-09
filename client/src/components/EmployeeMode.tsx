import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, InputField, SelectField, Toggle, Button, Disclaimer,
  ResultRow, ContributionTable, Spinner, ErrorAlert, HelpTip
} from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { api } from '../services/api';
import { exportEmployeePDF, PDFAlignedOptions } from '../services/pdfExport';
import type {
  EmployeeResult, CountryCode, CalculationBasis, Period,
  CHAdvancedOptions, ROAdvancedOptions, FXData, EmployeeIdentity, MarginInputType
} from '../types';

const STORAGE_KEY = 'tsg_employee_inputs';
const DEFAULT_WORKING_DAYS = 220;

function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

/** Compute employee age in whole years from a date-of-birth string (YYYY-MM-DD). */
function computeAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/** Return the LPP age-band label for UI display. */
function getLPPBandLabel(age: number): string {
  if (age < 18) return 'Below LPP age (no pension contributions)';
  if (age <= 24) return '18–24 yrs: 0.3% total (risk & costs only)';
  if (age <= 34) return '25–34 yrs: 8.4% total (7% savings + 1.4% risk)';
  if (age <= 44) return '35–44 yrs: 11.4% total (9.8% savings + 1.6% risk)';
  if (age <= 54) return '45–54 yrs: 17.4% total (15.5% savings + 1.9% risk)';
  if (age <= 65) return '55–65 yrs: 20.4% total (18% savings + 2.4% risk)';
  return 'Above LPP age (no pension contributions)';
}

interface Props { fxData: FXData | null; identity: EmployeeIdentity; onIdentityChange: (id: EmployeeIdentity) => void; }

export default function EmployeeMode({ fxData, identity, onIdentityChange }: Props) {
  const saved = loadSaved();
  const [country, setCountry] = useState<CountryCode>(saved?.country || 'CH');
  const [basis, setBasis] = useState<CalculationBasis>(saved?.basis || 'GROSS');
  const [period, setPeriod] = useState<Period>(saved?.period || 'YEARLY');
  const [amount, setAmount] = useState<string>(saved?.amount || '100000');
  const [occRate, setOccRate] = useState<string>(saved?.occRate || '100');

  // --- TOTAL_COST mode: Client Rate fields ---
  const [clientDailyRate, setClientDailyRate] = useState<string>(saved?.clientDailyRate || '1200');
  const [marginPercent, setMarginPercent] = useState<string>(saved?.marginPercent || '30');
  const [workingDays, setWorkingDays] = useState<string>(saved?.workingDays || String(DEFAULT_WORKING_DAYS));

  // --- Margin Input Type (for GROSS/NET modes only) ---
  const [marginInputType, setMarginInputType] = useState<MarginInputType>(saved?.marginInputType || 'NONE');
  const [targetMarginPct, setTargetMarginPct] = useState<string>(saved?.targetMarginPct || '30');
  const [fixedDailyAmount, setFixedDailyAmount] = useState<string>(saved?.fixedDailyAmount || '');

  // CH advanced (LPP is now age-based, no manual rate)
  const [lfpRate, setLfpRate] = useState<string>(saved?.lfpRate || '0.1');
  const [laaRate, setLaaRate] = useState<string>(saved?.laaRate || '1.5');

  const [disabledExemption, setDisabledExemption] = useState(saved?.disabledExemption || false);
  const [mealBenefits, setMealBenefits] = useState<string>(saved?.mealBenefits || '0');
  const [baseFunction, setBaseFunction] = useState(saved?.baseFunction !== false);
  const [dependents, setDependents] = useState<string>(saved?.dependents || '0');

  // Manual IS (Impôt à la source) — CH only
  const [useManualIS, setUseManualIS] = useState<boolean>(saved?.useManualIS || false);
  const [manualISAmount, setManualISAmount] = useState<string>(saved?.manualISAmount || '');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showIdentity, setShowIdentity] = useState(saved?.country === 'CH' || false);

  // Auto-expand identity section when switching to CH
  useEffect(() => {
    if (country === 'CH') setShowIdentity(true);
  }, [country]);
  const [result, setResult] = useState<EmployeeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  const baseCurrency = country === 'CH' ? 'CHF' : country === 'RO' ? 'RON' : 'EUR';

  // Compute employee age from identity DOB
  const employeeAge = computeAge(identity.dateOfBirth);

  // Validation: CH requires DOB for LPP age-band calculation
  const chMissingDOB = country === 'CH' && !identity.dateOfBirth;

  // Is this TOTAL_COST mode (client rate flow)?
  const isTotalCostMode = basis === 'TOTAL_COST';

  // Compute effective working days for preview
  const effectiveWorkingDays = Math.round(Number(workingDays || DEFAULT_WORKING_DAYS) * Number(occRate || 100) / 100);

  // Live cost envelope preview
  const liveEnvelope = isTotalCostMode ? (() => {
    const rate = Number(clientDailyRate) || 0;
    const margin = Number(marginPercent) || 0;
    const revenue = rate * effectiveWorkingDays;
    const marginAmt = revenue * margin / 100;
    const cost = revenue - marginAmt;
    return { revenue, marginAmt, cost };
  })() : null;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      country, basis, period, amount, occRate,
      clientDailyRate, marginPercent, workingDays,
      marginInputType, targetMarginPct, fixedDailyAmount,
      lfpRate, laaRate,
      disabledExemption, mealBenefits, baseFunction, dependents,
      alignmentCurrency, useManualIS, manualISAmount,
    }));
  }, [country, basis, period, amount, occRate, clientDailyRate, marginPercent, workingDays, marginInputType, targetMarginPct, fixedDailyAmount, lfpRate, laaRate, disabledExemption, mealBenefits, baseFunction, dependents, alignmentCurrency, useManualIS, manualISAmount]);

  const calculate = useCallback(async () => {
    if (country === 'CH' && !identity.dateOfBirth) {
      setError('Date of Birth is required for Switzerland (used to determine LPP pension age band).');
      return;
    }

    // Validate based on mode
    if (isTotalCostMode) {
      if (!clientDailyRate || Number(clientDailyRate) <= 0) {
        setError('Please enter a valid Client Daily Rate greater than 0.');
        return;
      }
    } else {
      if (!amount || Number(amount) <= 0) {
        setError('Please enter a valid amount greater than 0.');
        return;
      }
    }

    setLoading(true); setError(null);
    try {
      let advancedOptions: any = {};
      if (country === 'CH') {
        advancedOptions = { lfpRate: Number(lfpRate) / 100, laaNonProfessionalRate: Number(laaRate) / 100 } as CHAdvancedOptions;
      } else if (country === 'RO') {
        advancedOptions = { disabledTaxExemption: disabledExemption, monthlyMealBenefits: Number(mealBenefits), baseFunctionToggle: baseFunction, dependents: Number(dependents) } as ROAdvancedOptions;
      }

      let payload: any = {
        country,
        calculationBasis: basis,
        period: isTotalCostMode ? 'YEARLY' : period,
        amount: isTotalCostMode ? 0 : Number(amount), // amount is computed by backend for TOTAL_COST
        occupationRate: Number(occRate),
        advancedOptions,
        employeeAge: employeeAge ?? undefined,
      };

      // For TOTAL_COST, send client rate fields instead of amount
      if (isTotalCostMode) {
        payload.clientDailyRate = Number(clientDailyRate);
        payload.marginPercent = Number(marginPercent);
        payload.workingDaysPerYear = Number(workingDays || DEFAULT_WORKING_DAYS);
      }

      const data = await api.calculateEmployee(payload) as EmployeeResult;
      setResult(data);
    } catch (err: any) { setError(err.message || 'Calculation failed'); }
    finally { setLoading(false); }
  }, [country, basis, period, amount, occRate, clientDailyRate, marginPercent, workingDays, lfpRate, laaRate, disabledExemption, mealBenefits, baseFunction, dependents, identity.dateOfBirth, employeeAge, isTotalCostMode]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={baseCurrency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // --- Compute business metrics from result (GROSS/NET modes only) ---
  const computeMetrics = () => {
    if (!result || isTotalCostMode) return null;
    const dailyCostRate = result.dailyRate;

    if (marginInputType === 'TARGET_MARGIN') {
      const marginPct = Number(targetMarginPct) / 100;
      if (marginPct >= 1) return { dailyCostRate };
      const dailyPlacementRate = Math.round(dailyCostRate / (1 - marginPct) * 100) / 100;
      const dailyRevenue = Math.round((dailyPlacementRate - dailyCostRate) * 100) / 100;
      return { dailyCostRate, dailyPlacementRate, dailyRevenue, marginPct: Number(targetMarginPct) };
    }

    if (marginInputType === 'FIXED_DAILY') {
      const fixedAmt = Number(fixedDailyAmount);
      if (!fixedAmt || fixedAmt <= 0) return { dailyCostRate };
      const dailyPlacementRate = fixedAmt;
      const dailyRevenue = Math.round((dailyPlacementRate - dailyCostRate) * 100) / 100;
      const marginPct = dailyPlacementRate > 0
        ? Math.round(dailyRevenue / dailyPlacementRate * 10000) / 100
        : 0;
      const markupPct = dailyCostRate > 0
        ? Math.round(dailyRevenue / dailyCostRate * 10000) / 100
        : 0;
      return { dailyCostRate, dailyPlacementRate, dailyRevenue, marginPct, markupPct };
    }

    return { dailyCostRate };
  };

  const metrics = result && !isTotalCostMode ? computeMetrics() : null;

  // --- Monthly contributions ---
  const toMonthlyContribs = (contribs: { name: string; rate: number; base: number; amount: number }[]) =>
    contribs.map(c => ({
      ...c,
      base: Math.round(c.base / 12 * 100) / 100,
      amount: Math.round(c.amount / 12 * 100) / 100,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT ====== */}
      <div className="space-y-4">
        <Card title="Employee Configuration">
          <SelectField label="Country" value={country} onChange={(v) => setCountry(v as CountryCode)}
            options={[{ value: 'CH', label: 'Switzerland (CHF)' }, { value: 'RO', label: 'Romania (RON)' }, { value: 'ES', label: 'Spain (EUR)' }]} />
          <SelectField label="Calculation Basis" value={basis} onChange={(v) => setBasis(v as CalculationBasis)}
            options={[{ value: 'GROSS', label: 'From Gross Salary' }, { value: 'NET', label: 'From Net Salary' }, { value: 'TOTAL_COST', label: 'From Client Daily Rate' }]}
            help={isTotalCostMode
              ? 'Compute max salary from client day rate and target margin.'
              : 'Choose the starting point for the calculation.'
            } />

          {/* --- GROSS / NET mode: standard amount input --- */}
          {!isTotalCostMode && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Period" value={period} onChange={(v) => setPeriod(v as Period)}
                  options={[{ value: 'YEARLY', label: 'Yearly' }, { value: 'MONTHLY', label: 'Monthly' }]} />
                <InputField label="Occupation Rate" value={occRate} onChange={setOccRate} suffix="%" min={0} max={100}
                  help="Employment percentage. If gross is 10,000/m at 80%, calculation base is 8,000/m." />
              </div>
              <InputField
                label={`${basis === 'NET' ? 'Net' : 'Gross'} Amount – 100% FTE (${period === 'MONTHLY' ? 'Monthly' : 'Yearly'})`}
                value={amount} onChange={setAmount} suffix={baseCurrency} min={0}
                help="Enter the 100% FTE amount. It will be adjusted by the occupation rate." />
              {Number(occRate) < 100 && Number(occRate) > 0 && Number(amount) > 0 && (
                <p className="text-xs text-indigo-600 -mt-1 mb-2">
                  Effective calculation base: <strong>{fmt(Number(amount) * Number(occRate) / 100)} {baseCurrency}</strong> ({period === 'MONTHLY' ? 'monthly' : 'yearly'})
                </p>
              )}
            </>
          )}

          {/* --- TOTAL_COST mode: Client Rate fields --- */}
          {isTotalCostMode && (
            <>
              <InputField label="Occupation Rate" value={occRate} onChange={setOccRate} suffix="%" min={0} max={100}
                help="Employment percentage. Working days are adjusted accordingly (e.g. 220 × 80% = 176 days)." />
              <InputField label="Client Daily Rate" value={clientDailyRate} onChange={setClientDailyRate}
                suffix={baseCurrency} min={0}
                help="The daily rate charged to the client for this employee." />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Margin on Sales" value={marginPercent} onChange={setMarginPercent}
                  suffix="%" min={0} max={99} step={1}
                  help="Target profit margin as % of revenue (e.g. 30% means 30% of revenue is profit)." />
                <InputField label="Working Days / Year" value={workingDays} onChange={setWorkingDays}
                  min={1} max={365}
                  help="Base working days per year (default 220). Will be adjusted by occupation rate." />
              </div>

              {/* Live cost envelope preview */}
              {Number(clientDailyRate) > 0 && (
                <div className="mt-2 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg space-y-1.5">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Cost Envelope Preview</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-gray-600">Effective working days:</span>
                    <span className="text-right font-mono font-medium">{effectiveWorkingDays} days</span>
                    <span className="text-gray-600">Annual Revenue:</span>
                    <span className="text-right font-mono font-medium">{fmtInt(liveEnvelope?.revenue || 0)} {baseCurrency}</span>
                    <span className="text-gray-600">Margin ({marginPercent}%):</span>
                    <span className="text-right font-mono font-medium text-green-700">{fmtInt(liveEnvelope?.marginAmt || 0)} {baseCurrency}</span>
                    <span className="text-gray-600 font-semibold">Total Employer Cost:</span>
                    <span className="text-right font-mono font-bold text-blue-800">{fmtInt(liveEnvelope?.cost || 0)} {baseCurrency}/yr</span>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Margin Input (GROSS/NET modes only) */}
        {!isTotalCostMode && (
          <Card title="Margin Input Type">
            <SelectField
              label="Type"
              value={marginInputType}
              onChange={(v) => setMarginInputType(v as MarginInputType)}
              options={[
                { value: 'NONE', label: 'None (show daily cost only)' },
                { value: 'TARGET_MARGIN', label: 'Targeted Margin (%)' },
                { value: 'FIXED_DAILY', label: 'Fixed Daily Amount' },
              ]}
              help="Choose how to compute business placement metrics."
            />
            {marginInputType === 'TARGET_MARGIN' && (
              <InputField label="Target Margin" value={targetMarginPct} onChange={setTargetMarginPct}
                suffix="%" min={0} max={99} step={1}
                help="Desired profit margin. Daily Placement Rate = Daily Cost / (1 - Margin%)." />
            )}
            {marginInputType === 'FIXED_DAILY' && (
              <InputField label="Fixed Daily Placement Rate" value={fixedDailyAmount} onChange={setFixedDailyAmount}
                suffix={baseCurrency} min={0}
                help="The daily rate charged to the client." />
            )}
          </Card>
        )}

        {/* Employee Identity – DOB is REQUIRED for Switzerland */}
        <Card>
          <button onClick={() => setShowIdentity(!showIdentity)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>
              Employee Details
              {country === 'CH'
                ? <span className="text-red-500 ml-1 text-xs">(Date of Birth required for CH)</span>
                : ' (optional)'}
            </span>
            <span className={`transform transition-transform ${showIdentity ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showIdentity && <div className="mt-4"><EmployeeIdentityFields identity={identity} onChange={onIdentityChange} /></div>}
          {chMissingDOB && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              Date of Birth is required for Switzerland to calculate LPP pension contributions by age band.
            </p>
          )}
          {country === 'CH' && employeeAge !== null && (
            <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
              <strong>Age:</strong> {employeeAge} years &mdash; <strong>LPP band:</strong> {getLPPBandLabel(employeeAge)}
            </div>
          )}
        </Card>

        {/* Advanced Options */}
        <Card>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>Advanced Options ({country === 'CH' ? 'Swiss' : country === 'RO' ? 'Romanian' : 'Spanish'} Specific)</span>
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-2">
              {country === 'CH' && (<>
                <InputField label="LFP Vocational Training Rate" value={lfpRate} onChange={setLfpRate} suffix="%" step={0.01} help="Employer-only (0.03-0.15%)." />
                <InputField label="LAA Non-Professional Rate" value={laaRate} onChange={setLaaRate} suffix="%" step={0.1} help="Non-professional accident insurance." />
                <p className="text-xs text-gray-500 italic mt-1">LPP/BVG pension rate is determined automatically by age band (from Date of Birth).</p>
              </>)}
              {country === 'RO' && (<>
                <Toggle label="Disabled Person Tax Exemption" checked={disabledExemption} onChange={setDisabledExemption} />
                <Toggle label="Base Function (Personal Deduction)" checked={baseFunction} onChange={setBaseFunction} />
                <InputField label="Number of Dependents" value={dependents} onChange={setDependents} min={0} max={10} />
                <InputField label="Monthly Meal Benefits" value={mealBenefits} onChange={setMealBenefits} suffix="RON" />
              </>)}
              {country === 'ES' && <p className="text-xs text-gray-500 italic">Spain uses simplified IRPF progressive bands.</p>}
            </div>
          )}
        </Card>

        {/* Impôt à la source — CH only */}
        {country === 'CH' && (
          <Card title="Impôt à la source (IS)">
            <Toggle
              label="Enter IS amount manually"
              checked={useManualIS}
              onChange={(v) => { setUseManualIS(v); if (!v) setManualISAmount(''); }}
              help="If withholding tax applies to this employee, enter the monthly IS amount. It will be shown as a deduction from net salary."
            />
            {useManualIS && (
              <InputField
                label="Monthly IS Amount"
                value={manualISAmount}
                onChange={setManualISAmount}
                suffix="CHF"
                min={0}
                step={10}
                placeholder="e.g. 381"
                help="Monthly withholding tax (impôt à la source). Use the IS (GE) tab to calculate the exact amount."
              />
            )}
          </Card>
        )}

        <div className="flex gap-3">
          <Button onClick={calculate} disabled={loading} className="flex-1">{loading ? 'Calculating...' : 'Calculate'}</Button>
          {result && (
            <Button variant="outline" onClick={() => exportEmployeePDF(result, {
              country, calculationBasis: basis, period, amount: Number(amount),
              occupationRate: Number(occRate), marginInputType, targetMarginPct: Number(targetMarginPct),
              fixedDailyAmount: Number(fixedDailyAmount), metrics,
              clientDailyRate: Number(clientDailyRate), marginPercent: Number(marginPercent), workingDays: Number(workingDays),
            }, identity, showAligned ? { showAligned, alignmentCurrency, rates } as PDFAlignedOptions : undefined)}>
              Download PDF
            </Button>
          )}
        </div>
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      </div>

      {/* ====== RIGHT ====== */}
      <div className="space-y-4">
        {loading && <Spinner />}
        {result && !loading && (<>
          {/* Aligned Currency Panel */}
          <AlignedCurrencyPanel baseCurrency={baseCurrency} fxData={fxData}
            alignmentCurrency={alignmentCurrency} setAlignmentCurrency={setAlignmentCurrency}
            showAligned={showAligned} setShowAligned={setShowAligned} />

          {/* ===== COST ENVELOPE (TOTAL_COST mode) ===== */}
          {result.costEnvelope && (
            <Card title="Cost Envelope">
              <div className="space-y-0.5">
                <ResultRow label="Client Daily Rate" value="">
                  <span className="text-sm font-mono text-gray-800">{av(result.costEnvelope.clientDailyRate)}</span>
                </ResultRow>
                <ResultRow label={`Working Days (${Number(occRate) < 100 ? `${workingDays} × ${occRate}%` : 'per year'})`}
                  value={`${result.costEnvelope.workingDays} days`} />
                <ResultRow label="Annual Revenue" value="" highlight>
                  <span className="text-sm font-mono text-tsg-blue-700">{av(result.costEnvelope.annualRevenue)}</span>
                </ResultRow>
                <ResultRow label={`Margin (${result.costEnvelope.marginPercent}% on sales)`} value="">
                  <span className="text-sm font-mono text-green-700 font-semibold">{av(result.costEnvelope.marginAmount)}</span>
                </ResultRow>
                <div className="border-t border-gray-200 pt-1 mt-1">
                  <ResultRow label="Total Employer Cost Envelope" value="" highlight>
                    <span className="text-sm font-mono font-bold text-tsg-blue-700">{av(result.costEnvelope.totalEmployerCostEnvelope)}</span>
                  </ResultRow>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Daily Cost</p>
                    <p className="text-sm font-mono font-semibold text-gray-800">{av(result.costEnvelope.dailyCostRate)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">Daily Margin</p>
                    <p className="text-sm font-mono font-semibold text-green-700">{av(result.costEnvelope.dailyMargin)}</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* ===== BUSINESS METRICS (GROSS/NET modes only) ===== */}
          {!isTotalCostMode && metrics && (
            <Card title="Business Metrics">
              <ResultRow label="Daily Cost Rate" value="" highlight
                help="Total Employer Cost (Yearly) / 220 working days.">
                <span className="text-sm font-mono text-tsg-blue-700">{av(metrics.dailyCostRate)}</span>
              </ResultRow>

              {metrics.dailyPlacementRate !== undefined && (
                <ResultRow label={marginInputType === 'FIXED_DAILY' ? 'Daily Placement Rate (Fixed)' : 'Daily Placement Rate'} value="" highlight
                  help={marginInputType === 'TARGET_MARGIN'
                    ? 'Daily Cost / (1 - Target Margin %)'
                    : 'Fixed daily amount entered by the user.'
                  }>
                  <span className="text-sm font-mono text-tsg-blue-700">{av(metrics.dailyPlacementRate)}</span>
                </ResultRow>
              )}

              {metrics.dailyRevenue !== undefined && (
                <ResultRow label="Daily Revenue" value=""
                  help="Daily Placement Rate - Daily Cost Rate.">
                  <span className={`text-sm font-mono font-semibold ${metrics.dailyRevenue >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {av(metrics.dailyRevenue)}
                  </span>
                </ResultRow>
              )}

              {marginInputType === 'FIXED_DAILY' && metrics.marginPct !== undefined && (
                <>
                  <ResultRow label="Margin %" value={`${metrics.marginPct.toFixed(1)}%`}
                    help="Revenue as % of placement rate." />
                  {metrics.markupPct !== undefined && (
                    <ResultRow label="Markup %" value={`${metrics.markupPct.toFixed(1)}%`}
                      help="Revenue as % of cost rate." />
                  )}
                </>
              )}

              {marginInputType === 'TARGET_MARGIN' && metrics.marginPct !== undefined && (
                <ResultRow label="Target Margin" value={`${metrics.marginPct.toFixed(1)}%`} />
              )}
            </Card>
          )}

          {/* ===== SALARY SUMMARY ===== */}
          <Card title={isTotalCostMode ? 'Maximum Employee Salary' : 'Salary Summary'}>
            {!isTotalCostMode && result.occupationRate < 100 && result.fteAmountYearly && (
              <div className="mb-2 px-3 py-1.5 bg-indigo-50 rounded text-[11px] text-indigo-700">
                100% FTE: {fmt(result.fteAmountYearly)} {baseCurrency}/yr &rarr; Effective at {result.occupationRate}%: {fmt(result.grossSalaryYearly)} {baseCurrency}/yr
              </div>
            )}
            <ResultRow label="Gross Salary (Monthly)" value="" ><span className="text-sm font-mono text-gray-800">{av(result.grossSalaryMonthly)}</span></ResultRow>
            <ResultRow label="Gross Salary (Yearly)" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.grossSalaryYearly)}</span></ResultRow>
            <ResultRow label="Net Salary (Monthly)" value=""><span className="text-sm font-mono text-gray-800">{av(result.netSalaryMonthly)}</span></ResultRow>
            <ResultRow label="Net Salary (Yearly)" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.netSalaryYearly)}</span></ResultRow>
            {/* IS deduction — CH manual entry */}
            {country === 'CH' && useManualIS && Number(manualISAmount) > 0 && (() => {
              const isMonthly = Number(manualISAmount);
              const netAfterIS = result.netSalaryMonthly - isMonthly;
              return (
                <>
                  <div className="border-t border-amber-200 mt-2 pt-2">
                    <ResultRow label="Impôt à la source / month" value={`− ${fmt(isMonthly)} CHF`} />
                    <ResultRow label="Net after IS (Monthly)" value="" highlight>
                      <span className="text-sm font-mono font-bold text-amber-700">{av(netAfterIS)}</span>
                    </ResultRow>
                    <ResultRow label="Net after IS (Yearly)" value="" highlight>
                      <span className="text-sm font-mono font-bold text-amber-700">{av(netAfterIS * 12)}</span>
                    </ResultRow>
                  </div>
                </>
              );
            })()}
            <ResultRow label="Total Employer Cost (Monthly)" value=""><span className="text-sm font-mono text-gray-800">{av(result.totalEmployerCostMonthly)}</span></ResultRow>
            <ResultRow label="Total Employer Cost (Yearly)" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.totalEmployerCostYearly)}</span></ResultRow>
          </Card>

          {result.taxableBase !== undefined && (
            <Card title="Tax Information">
              <ResultRow label="Taxable Base (Yearly)" value={`${fmt(result.taxableBase)} ${baseCurrency}`} />
              <ResultRow label={`Income Tax (Yearly)${result.country === 'ES' ? ' - Estimate' : ''}`} value={`${fmt(result.incomeTax || 0)} ${baseCurrency}`} />
              {result.incomeTaxMonthly !== undefined && <ResultRow label="Income Tax (Monthly)" value={`${fmt(result.incomeTaxMonthly)} ${baseCurrency}`} />}
            </Card>
          )}

          {/* ===== CONTRIBUTIONS - MONTHLY BASE ===== */}
          <Card title="Contributions Breakdown (Monthly)">
            <ContributionTable title="Employee Contributions" contributions={toMonthlyContribs(result.employeeContributions)} currency={baseCurrency} />
            <ContributionTable title="Employer Contributions" contributions={toMonthlyContribs(result.employerContributions)} currency={baseCurrency} />
          </Card>

          {/* ===== DISCLAIMERS ===== */}
          <Disclaimer />
          {country === 'CH' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> Income tax is <strong>not included</strong> in this calculation.
                Swiss income tax varies by canton, commune, and church affiliation and must be assessed separately.
                For employees subject to withholding tax (IS), use the <strong>Impôt à la source (IS)</strong> section above or the <strong>IS (GE)</strong> tab.
              </p>
            </div>
          )}
        </>)}

        {!result && !loading && (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Configure your inputs and click <strong>Calculate</strong></p>
              <p className="text-xs mt-1">Employee payroll cost estimator for CH, RO, and ES</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
