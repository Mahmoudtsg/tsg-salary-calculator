import React, { useState, useEffect, useCallback } from 'react';
import { Card, InputField, SelectField, Button, Disclaimer, ResultRow, Spinner, ErrorAlert } from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { api } from '../services/api';
import { exportB2BPDF } from '../services/pdfExport';
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
  const [targetMargin, setTargetMargin] = useState<string>(saved?.targetMargin || '20');
  const [clientRate, setClientRate] = useState<string>(saved?.clientRate || '1100');
  const [clientDailyRate, setClientDailyRate] = useState<string>(saved?.clientDailyRate || '1000');
  const [hoursPerDay, setHoursPerDay] = useState<string>(saved?.hoursPerDay || '8');
  const [workingDays, setWorkingDays] = useState<string>(saved?.workingDays || '220');

  const [showIdentity, setShowIdentity] = useState(false);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  const [result, setResult] = useState<B2BResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      costRate, rateType, currency, pricingMode, targetMargin, clientRate, clientDailyRate, hoursPerDay, workingDays, alignmentCurrency,
    }));
  }, [costRate, rateType, currency, pricingMode, targetMargin, clientRate, clientDailyRate, hoursPerDay, workingDays, alignmentCurrency]);

  const calculate = useCallback(async () => {
    if (!costRate || Number(costRate) <= 0) {
      setError('Please enter a valid cost rate.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.calculateB2B({
        costRate: Number(costRate),
        rateType,
        costCurrency: currency,
        pricingMode,
        targetMarginPercent: pricingMode === 'TARGET_MARGIN' ? Number(targetMargin) : undefined,
        clientRate: pricingMode === 'CLIENT_RATE' ? Number(clientRate) : undefined,
        clientDailyRate: pricingMode === 'CLIENT_BUDGET' ? Number(clientDailyRate) : undefined,
        hoursPerDay: rateType === 'HOURLY' ? Number(hoursPerDay) : undefined,
        workingDaysPerYear: Number(workingDays),
      }) as B2BResult;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, [costRate, rateType, currency, pricingMode, targetMargin, clientRate, clientDailyRate, hoursPerDay, workingDays]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={currency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT: Inputs ====== */}
      <div className="space-y-4">
        <Card title="Contractor Cost">
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

          <InputField
            label={`Contractor Cost (${rateType === 'HOURLY' ? 'per hour' : 'per day'})`}
            value={costRate}
            onChange={setCostRate}
            suffix={currency}
            min={0}
            help="The rate you pay to the contractor."
          />

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
            help="Target Margin: compute client rate from margin. Client Rate: compute margin from rates. Client Budget: provide client daily rate to compute margin."
          />

          {pricingMode === 'TARGET_MARGIN' && (
            <InputField label="Target Margin" value={targetMargin} onChange={setTargetMargin} suffix="%"
              min={0} max={99}
              help="Desired profit margin as % of revenue. Formula: Client Rate = Cost / (1 - Margin%)" />
          )}

          {pricingMode === 'CLIENT_RATE' && (
            <InputField label={`Client Rate (${rateType === 'HOURLY' ? 'per hour' : 'per day'})`}
              value={clientRate} onChange={setClientRate} suffix={currency}
              help="The rate charged to the client." />
          )}

          {pricingMode === 'CLIENT_BUDGET' && (
            <InputField label="Client Daily Rate" value={clientDailyRate} onChange={setClientDailyRate} suffix={currency}
              help="The daily rate the client pays. Used to compute margin against contractor cost." />
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
            <Button variant="outline" onClick={() => exportB2BPDF(result, { costRate: Number(costRate), rateType, pricingMode, currency }, identity)}>
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
            {/* Aligned Currency Panel */}
            <AlignedCurrencyPanel baseCurrency={currency} fxData={fxData}
              alignmentCurrency={alignmentCurrency} setAlignmentCurrency={setAlignmentCurrency}
              showAligned={showAligned} setShowAligned={setShowAligned} />

            <Card title="Profitability Analysis">
              <ResultRow label="Client Daily Rate" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.clientRateDaily)}</span></ResultRow>
              <ResultRow label="Cost Daily Rate" value=""><span className="text-sm font-mono text-gray-800">{av(result.costRateDaily)}</span></ResultRow>
              <ResultRow label="Daily Margin" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.marginAmount)}</span></ResultRow>
              <div className="my-2 border-t border-gray-200"></div>
              <ResultRow label="Margin %" value={`${result.marginPercent.toFixed(1)}%`}
                help="Margin as percentage of client rate (revenue)." />
              <ResultRow label="Markup %" value={`${result.markupPercent.toFixed(1)}%`}
                help="Markup as percentage of cost rate." />
            </Card>

            <Card title="Annual Projections">
              <ResultRow label="Annual Revenue" value=""><span className="text-sm font-mono text-gray-800">{av(result.annualRevenue)}</span></ResultRow>
              <ResultRow label="Annual Cost" value=""><span className="text-sm font-mono text-gray-800">{av(result.annualCost)}</span></ResultRow>
              <ResultRow label="Annual Profit" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.annualProfit)}</span></ResultRow>
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
