import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, InputField, SelectField, Toggle, Button, Disclaimer,
  ResultRow, ContributionTable, Spinner, ErrorAlert
} from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { api } from '../services/api';
import { exportEmployeePDF } from '../services/pdfExport';
import type { EmployeeResult, CountryCode, CalculationBasis, Period, CHAdvancedOptions, ROAdvancedOptions, FXData, EmployeeIdentity } from '../types';

const STORAGE_KEY = 'tsg_employee_inputs';
function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

interface Props { fxData: FXData | null; identity: EmployeeIdentity; onIdentityChange: (id: EmployeeIdentity) => void; }

export default function EmployeeMode({ fxData, identity, onIdentityChange }: Props) {
  const saved = loadSaved();
  const [country, setCountry] = useState<CountryCode>(saved?.country || 'CH');
  const [basis, setBasis] = useState<CalculationBasis>(saved?.basis || 'GROSS');
  const [period, setPeriod] = useState<Period>(saved?.period || 'YEARLY');
  const [amount, setAmount] = useState<string>(saved?.amount || '100000');
  const [occRate, setOccRate] = useState<string>(saved?.occRate || '100');
  const [clientDailyRate, setClientDailyRate] = useState<string>(saved?.clientDailyRate || '');

  const [lppRate, setLppRate] = useState<string>(saved?.lppRate || '7');
  const [lfpRate, setLfpRate] = useState<string>(saved?.lfpRate || '0.1');
  const [laaRate, setLaaRate] = useState<string>(saved?.laaRate || '1.5');
  const [pensionMode, setPensionMode] = useState<string>(saved?.pensionMode || 'MANDATORY_BVG');

  const [disabledExemption, setDisabledExemption] = useState(saved?.disabledExemption || false);
  const [mealBenefits, setMealBenefits] = useState<string>(saved?.mealBenefits || '0');
  const [baseFunction, setBaseFunction] = useState(saved?.baseFunction !== false);
  const [dependents, setDependents] = useState<string>(saved?.dependents || '0');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [result, setResult] = useState<EmployeeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  const baseCurrency = country === 'CH' ? 'CHF' : country === 'RO' ? 'RON' : 'EUR';

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      country, basis, period, amount, occRate, clientDailyRate,
      lppRate, lfpRate, laaRate, pensionMode,
      disabledExemption, mealBenefits, baseFunction, dependents,
      alignmentCurrency,
    }));
  }, [country, basis, period, amount, occRate, clientDailyRate, lppRate, lfpRate, laaRate, pensionMode, disabledExemption, mealBenefits, baseFunction, dependents, alignmentCurrency]);

  const calculate = useCallback(async () => {
    if (!amount || Number(amount) <= 0) { setError('Please enter a valid amount greater than 0.'); return; }
    setLoading(true); setError(null);
    try {
      let advancedOptions: any = {};
      if (country === 'CH') {
        advancedOptions = { lppRate: Number(lppRate) / 100, lfpRate: Number(lfpRate) / 100, laaNonProfessionalRate: Number(laaRate) / 100, pensionPlanMode: pensionMode } as CHAdvancedOptions;
      } else if (country === 'RO') {
        advancedOptions = { disabledTaxExemption: disabledExemption, monthlyMealBenefits: Number(mealBenefits), baseFunctionToggle: baseFunction, dependents: Number(dependents) } as ROAdvancedOptions;
      }
      const data = await api.calculateEmployee({
        country, calculationBasis: basis, period, amount: Number(amount),
        occupationRate: Number(occRate), advancedOptions,
        clientDailyRate: clientDailyRate ? Number(clientDailyRate) : undefined,
      }) as EmployeeResult;
      setResult(data);
    } catch (err: any) { setError(err.message || 'Calculation failed'); }
    finally { setLoading(false); }
  }, [country, basis, period, amount, occRate, clientDailyRate, lppRate, lfpRate, laaRate, pensionMode, disabledExemption, mealBenefits, baseFunction, dependents]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={baseCurrency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT ====== */}
      <div className="space-y-4">
        <Card title="Employee Configuration">
          <SelectField label="Country" value={country} onChange={(v) => setCountry(v as CountryCode)}
            options={[{ value: 'CH', label: 'Switzerland (CHF)' }, { value: 'RO', label: 'Romania (RON)' }, { value: 'ES', label: 'Spain (EUR)' }]} />
          <SelectField label="Calculation Basis" value={basis} onChange={(v) => setBasis(v as CalculationBasis)}
            options={[{ value: 'GROSS', label: 'From Gross Salary' }, { value: 'NET', label: 'From Net Salary' }, { value: 'TOTAL_COST', label: 'From Total Employer Cost' }]}
            help="Choose the starting point for the calculation." />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Period" value={period} onChange={(v) => setPeriod(v as Period)}
              options={[{ value: 'YEARLY', label: 'Yearly' }, { value: 'MONTHLY', label: 'Monthly' }]} />
            <InputField label="Occupation Rate" value={occRate} onChange={setOccRate} suffix="%" min={0} max={100}
              help="Employment percentage (e.g., 80% for part-time)." />
          </div>
          <InputField
            label={`${basis === 'NET' ? 'Net' : basis === 'TOTAL_COST' ? 'Total Employer Cost' : 'Gross'} Amount (${period === 'MONTHLY' ? 'Monthly' : 'Yearly'})`}
            value={amount} onChange={setAmount} suffix={baseCurrency} min={0} />
          <InputField label="Client Daily Rate (optional)" value={clientDailyRate} onChange={setClientDailyRate}
            suffix={baseCurrency} placeholder="Optional" help="For margin calculation." />
        </Card>

        {/* Employee Identity */}
        <Card>
          <button onClick={() => setShowIdentity(!showIdentity)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>Employee Details (optional)</span>
            <span className={`transform transition-transform ${showIdentity ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showIdentity && <div className="mt-4"><EmployeeIdentityFields identity={identity} onChange={onIdentityChange} /></div>}
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
                <InputField label="LPP Pension Rate" value={lppRate} onChange={setLppRate} suffix="%" step={0.5} help="BVG/LPP pension contribution rate. Default 7%." />
                <InputField label="LFP Vocational Training Rate" value={lfpRate} onChange={setLfpRate} suffix="%" step={0.01} help="Employer-only (0.03-0.15%)." />
                <InputField label="LAA Non-Professional Rate" value={laaRate} onChange={setLaaRate} suffix="%" step={0.1} help="Non-professional accident insurance." />
                <SelectField label="Pension Plan Mode" value={pensionMode} onChange={setPensionMode}
                  options={[{ value: 'MANDATORY_BVG', label: 'Mandatory BVG (capped)' }, { value: 'SUPER_OBLIGATORY', label: 'Super-Obligatory (uncapped)' }]}
                  help="Mandatory BVG caps insured salary at 90,720 CHF/year." />
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

        <div className="flex gap-3">
          <Button onClick={calculate} disabled={loading} className="flex-1">{loading ? 'Calculating...' : 'Calculate'}</Button>
          {result && (
            <Button variant="outline" onClick={() => exportEmployeePDF(result, { country, calculationBasis: basis, period, amount: Number(amount), occupationRate: Number(occRate) }, identity)}>
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

          <Card title="Salary Summary">
            <ResultRow label="Gross Salary (Monthly)" value="" ><span className="text-sm font-mono text-gray-800">{av(result.grossSalaryMonthly)}</span></ResultRow>
            <ResultRow label="Gross Salary (Yearly)" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.grossSalaryYearly)}</span></ResultRow>
            <ResultRow label="Net Salary (Monthly)" value=""><span className="text-sm font-mono text-gray-800">{av(result.netSalaryMonthly)}</span></ResultRow>
            <ResultRow label="Net Salary (Yearly)" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.netSalaryYearly)}</span></ResultRow>
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

          <Card title="Contributions Breakdown">
            <ContributionTable title="Employee Contributions" contributions={result.employeeContributions} currency={baseCurrency} />
            <ContributionTable title="Employer Contributions" contributions={result.employerContributions} currency={baseCurrency} />
          </Card>

          <Card title="Business Metrics">
            <ResultRow label="Employer Daily Rate" value={`${fmt(result.dailyRate)} ${baseCurrency}`} highlight help="Total employer cost / working days." />
            {result.marginVsClientRate !== undefined && <ResultRow label="Margin vs Client Rate" value={`${fmt(result.marginVsClientRate)} ${baseCurrency}`} highlight />}
          </Card>
          <Disclaimer />
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
