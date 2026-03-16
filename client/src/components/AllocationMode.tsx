import React, { useState, useEffect, useCallback } from 'react';
import { Card, InputField, SelectField, Button, Disclaimer, ResultRow, Spinner, ErrorAlert, HelpTip } from './UIComponents';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { api } from '../services/api';
import { exportAllocationPDF, PDFAlignedOptions } from '../services/pdfExport';
import type { AllocationResult, FXData } from '../types';

const STORAGE_KEY = 'tsg_allocation_inputs';
function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

interface ClientRow {
  id: string;
  clientName: string;
  allocationPercent: string;
  dailyRate: string;
}

const SAMPLE_DATA = {
  salary100: '160000',
  engagementPercent: '80',
  employerMultiplier: '1.20',
  workingDays: '220',
  currency: 'CHF',
  clients: [
    { id: '1', clientName: 'Client A', allocationPercent: '60', dailyRate: '1250' },
    { id: '2', clientName: 'Client B', allocationPercent: '20', dailyRate: '1250' },
  ],
};

interface Props { fxData: FXData | null; }

export default function AllocationMode({ fxData }: Props) {
  const saved = loadSaved();
  const [salary100, setSalary100] = useState<string>(saved?.salary100 || '160000');
  const [engagementPercent, setEngagementPercent] = useState<string>(saved?.engagementPercent || '80');
  const [employerMultiplier, setEmployerMultiplier] = useState<string>(saved?.employerMultiplier || '1.20');
  const [workingDays, setWorkingDays] = useState<string>(saved?.workingDays || '220');
  const [currency, setCurrency] = useState<string>(saved?.currency || 'CHF');

  const [clients, setClients] = useState<ClientRow[]>(
    saved?.clients || [{ id: '1', clientName: 'Client A', allocationPercent: '50', dailyRate: '1000' }]
  );

  const [result, setResult] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  // Reset alignmentCurrency when it matches the base currency
  useEffect(() => {
    if (alignmentCurrency === currency) {
      const fallback = ['CHF', 'EUR', 'RON'].find(c => c !== currency) || 'CHF';
      setAlignmentCurrency(fallback);
    }
  }, [currency]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      salary100, engagementPercent, employerMultiplier, workingDays, currency, clients, alignmentCurrency,
    }));
  }, [salary100, engagementPercent, employerMultiplier, workingDays, currency, clients, alignmentCurrency]);

  const addClient = () => {
    setClients([...clients, {
      id: String(Date.now()),
      clientName: `Client ${String.fromCharCode(65 + clients.length)}`,
      allocationPercent: '20',
      dailyRate: '1000',
    }]);
  };

  const removeClient = (id: string) => {
    if (clients.length > 1) {
      setClients(clients.filter(c => c.id !== id));
    }
  };

  const updateClient = (id: string, field: keyof ClientRow, value: string) => {
    setClients(clients.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const loadSample = () => {
    setSalary100(SAMPLE_DATA.salary100);
    setEngagementPercent(SAMPLE_DATA.engagementPercent);
    setEmployerMultiplier(SAMPLE_DATA.employerMultiplier);
    setWorkingDays(SAMPLE_DATA.workingDays);
    setCurrency(SAMPLE_DATA.currency);
    setClients(SAMPLE_DATA.clients);
    setResult(null);
  };

  const calculate = useCallback(async () => {
    if (!salary100 || Number(salary100) <= 0) {
      setError('Please enter a valid salary.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.calculateAllocation({
        salary100: Number(salary100),
        engagementPercent: Number(engagementPercent),
        employerMultiplier: Number(employerMultiplier),
        workingDaysPerYear: Number(workingDays),
        currency,
        clients: clients.map(c => ({
          clientName: c.clientName,
          allocationPercent: Number(c.allocationPercent),
          dailyRate: Number(c.dailyRate),
        })),
      }) as AllocationResult;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, [salary100, engagementPercent, employerMultiplier, workingDays, currency, clients]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={currency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalAllocation = clients.reduce((s, c) => s + Number(c.allocationPercent || 0), 0);
  const allocationWarning = totalAllocation > Number(engagementPercent);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT: Inputs ====== */}
      <div className="space-y-4">
        <Card title="Employee & Engagement">
          <InputField
            label="Annual Base Salary (100%)"
            value={salary100}
            onChange={setSalary100}
            suffix={currency}
            help="The employee's full-time annual salary before any engagement adjustment."
          />

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Engagement %"
              value={engagementPercent}
              onChange={setEngagementPercent}
              suffix="%"
              min={0}
              max={100}
              help="The percentage of time the employee works (e.g., 80%)."
            />
            <InputField
              label="Employer Multiplier"
              value={employerMultiplier}
              onChange={setEmployerMultiplier}
              step={0.05}
              min={1}
              help="Multiplier applied to salary to account for employer costs (e.g., 1.20 = 20% overhead)."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Working Days/Year"
              value={workingDays}
              onChange={setWorkingDays}
              min={1}
              max={365}
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
        </Card>

        <Card title="Client Allocations">
          <div className="space-y-3">
            {clients.map((client, idx) => (
              <div key={client.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={client.clientName}
                    onChange={(e) => updateClient(client.id, 'clientName', e.target.value)}
                    className="text-sm font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                  />
                  {clients.length > 1 && (
                    <button
                      onClick={() => removeClient(client.id)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InputField
                    label="Allocation %"
                    value={client.allocationPercent}
                    onChange={(v) => updateClient(client.id, 'allocationPercent', v)}
                    suffix="%"
                    min={0}
                    max={100}
                  />
                  <InputField
                    label="Daily Rate"
                    value={client.dailyRate}
                    onChange={(v) => updateClient(client.id, 'dailyRate', v)}
                    suffix={currency}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={addClient}
              className="text-xs text-tsg-blue-500 hover:text-tsg-blue-700 font-medium"
            >
              + Add Client
            </button>
            <span className={`text-xs ${allocationWarning ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
              Total: {totalAllocation}% / {engagementPercent}%
              {allocationWarning && ' (exceeds engagement!)'}
            </span>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button onClick={calculate} disabled={loading} className="flex-1">
            {loading ? 'Calculating...' : 'Calculate'}
          </Button>
          <Button variant="outline" onClick={loadSample}>
            Load Sample
          </Button>
          {result && (
            <Button variant="outline" onClick={() => exportAllocationPDF(result, {
              salary100: Number(salary100),
              engagementPercent: Number(engagementPercent),
              employerMultiplier: Number(employerMultiplier),
            }, showAligned ? { showAligned, alignmentCurrency, rates } as PDFAlignedOptions : undefined)}>
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

            <Card title="Cost Breakdown">
              <ResultRow label="Engaged Salary" value=""
                help="Salary_100 x (Engagement% / 100)"><span className="text-sm font-mono text-gray-800">{av(result.engagedSalary)}</span></ResultRow>
              <ResultRow label="Total Employer Cost" value=""
                help="Engaged Salary x Employer Multiplier"><span className="text-sm font-mono text-gray-800">{av(result.employerCost)}</span></ResultRow>
              <ResultRow label="Base Daily Cost" value="" highlight
                help="Employer Cost / Working Days. This cost is paid once regardless of client allocations."><span className="text-sm font-mono text-tsg-blue-700">{av(result.baseDailyCost)}</span></ResultRow>
            </Card>

            <Card title="Client Profitability">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Client</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Alloc.</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Rate</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Rev/Day</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Profit/Day</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.clients.map((c, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${c.isBaseline ? 'bg-blue-50' : ''}`}>
                        <td className="py-2 px-2 font-medium text-gray-700">{c.clientName}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600">{c.allocationPercent}%</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600">{fmt(c.dailyRate)}</td>
                        <td className="py-2 px-2 text-right font-mono text-gray-600">{fmt(c.revenuePerDay)}</td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${c.profitPerDay >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmt(c.profitPerDay)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            c.isBaseline
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {c.isBaseline ? 'Baseline' : 'Incremental'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Profit Summary">
              <ResultRow label="Total Daily Profit" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.totalDailyProfit)}</span></ResultRow>
              <ResultRow label="Annual Profit" value="" highlight><span className="text-sm font-mono text-tsg-blue-700">{av(result.annualProfit)}</span></ResultRow>
              <ResultRow label="Total Allocation" value={`${result.totalAllocationPercent}% of ${result.engagementPercent}%`} />
            </Card>

            {/* Visual Profit Breakdown */}
            <Card>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Profit Breakdown</h4>
              {result.clients.map((c, i) => (
                <div key={i} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{c.clientName}</span>
                    <span className="font-mono font-medium">{fmt(c.profitPerDay)} {result.currency}/day</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(Math.max((c.profitPerDay / result.totalDailyProfit) * 100, 0), 100)}%`,
                        background: c.isBaseline ? '#2E86C1' : '#27AE60',
                      }}
                    />
                  </div>
                </div>
              ))}
            </Card>

            <Disclaimer />
          </>
        )}

        {!result && !loading && (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">Multi-client profitability modeling</p>
              <p className="text-xs mt-1">Click <strong>Load Sample</strong> to see the example scenario</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
