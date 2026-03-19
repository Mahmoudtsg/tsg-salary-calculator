import React, { useState, useEffect, useCallback } from 'react';
import { Card, InputField, SelectField, Button, Disclaimer, ResultRow, Spinner, ErrorAlert, HelpTip } from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import { api } from '../services/api';
import type { AllocationResultCH, ClientResultCH, FXData, EmployeeIdentity } from '../types';

const STORAGE_KEY = 'tsg_allocation_v2_inputs';
function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

interface ClientRow {
  id: string;
  clientName: string;
  allocationPercent: string;
  dailyRate: string;
  isBilled: boolean;
}

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

function getLPPBandLabel(age: number): string {
  if (age < 18) return 'Below LPP age (no pension)';
  if (age <= 24) return '18–24 yrs: 0.3% total';
  if (age <= 34) return '25–34 yrs: 8.4% total';
  if (age <= 44) return '35–44 yrs: 11.4% total';
  if (age <= 54) return '45–54 yrs: 17.4% total';
  if (age <= 65) return '55–65 yrs: 20.4% total';
  return 'Above LPP age (no pension)';
}

interface BreakEvenClient extends ClientResultCH {
  breakEvenRate: number;
  slack: number; // currentRate - breakEvenRate
}

function computeBreakEvens(result: AllocationResultCH): BreakEvenClient[] {
  const billed = result.clients.filter(c => c.isBilled);
  return billed.map(client => {
    const otherRevenue = billed
      .filter(c => c.clientName !== client.clientName)
      .reduce((s, c) => s + c.annualRevenue, 0);
    const breakEvenRate = client.days > 0
      ? (result.totalEmployerCost - otherRevenue) / client.days
      : 0;
    return { ...client, breakEvenRate, slack: client.dailyRate - breakEvenRate };
  });
}

interface SensitivityRow {
  rate: number;
  clientRevenue: number;
  totalRevenue: number;
  profit: number;
  marginPct: number;
  isNearBreakEven: boolean;
  isHighlighted: boolean; // closest row to exact break-even
}

function computeSensitivity(
  result: AllocationResultCH,
  weakest: BreakEvenClient,
): SensitivityRow[] {
  const otherRevenue = result.clients
    .filter(c => c.isBilled && c.clientName !== weakest.clientName)
    .reduce((s, c) => s + c.annualRevenue, 0);

  const rows: SensitivityRow[] = [];
  let closestIdx = 0;
  let closestDist = Infinity;

  for (let rate = 500; rate <= 2000; rate += 100) {
    const clientRevenue = weakest.days * rate;
    const totalRevenue = otherRevenue + clientRevenue;
    const profit = totalRevenue - result.totalEmployerCost;
    const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const dist = Math.abs(rate - weakest.breakEvenRate);
    if (dist < closestDist) { closestDist = dist; closestIdx = rows.length; }
    rows.push({ rate, clientRevenue, totalRevenue, profit, marginPct, isNearBreakEven: false, isHighlighted: false });
  }

  if (rows.length > 0) rows[closestIdx].isHighlighted = true;

  return rows.map(r => ({
    ...r,
    isNearBreakEven: r.profit >= 0 && r.marginPct < 5,
  }));
}

interface Props { fxData: FXData | null; currentUser?: { full_name: string; token: string } | null; }

export default function AllocationMode({ fxData, currentUser }: Props) {
  const saved = loadSaved();

  const [identity, setIdentity] = useState<EmployeeIdentity>(saved?.identity || { employeeName: '', dateOfBirth: '', roleOrPosition: '' });
  const [grossSalary, setGrossSalary] = useState<string>(saved?.grossSalary || '120000');
  const [workingDays, setWorkingDays] = useState<string>(saved?.workingDays || '220');
  const [currency, setCurrency] = useState<string>(saved?.currency || 'CHF');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lfpRate, setLfpRate] = useState<string>(saved?.lfpRate || '0.1');
  const [laaRate, setLaaRate] = useState<string>(saved?.laaRate || '1.5');

  const [clients, setClients] = useState<ClientRow[]>(
    saved?.clients || [{ id: '1', clientName: 'Client A', allocationPercent: '100', dailyRate: '1200', isBilled: true }]
  );

  const [result, setResult] = useState<AllocationResultCH | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employeeAge = computeAge(identity.dateOfBirth);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ identity, grossSalary, workingDays, currency, lfpRate, laaRate, clients }));
  }, [identity, grossSalary, workingDays, currency, lfpRate, laaRate, clients]);

  const totalAllocation = clients.reduce((s, c) => s + Number(c.allocationPercent || 0), 0);
  const remaining = Math.round((100 - totalAllocation) * 10) / 10;
  const isAllocationValid = Math.abs(totalAllocation - 100) < 0.5;

  const addClient = () => {
    if (clients.length >= 4) return;
    setClients([...clients, {
      id: String(Date.now()),
      clientName: `Client ${String.fromCharCode(65 + clients.length)}`,
      allocationPercent: '0',
      dailyRate: '1200',
      isBilled: true,
    }]);
  };

  const removeClient = (id: string) => {
    if (clients.length > 1) setClients(clients.filter(c => c.id !== id));
  };

  const updateClient = (id: string, field: keyof ClientRow, value: string | boolean) => {
    setClients(clients.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const calculate = useCallback(async () => {
    if (!grossSalary || Number(grossSalary) <= 0) { setError('Please enter a valid gross salary.'); return; }
    if (!isAllocationValid) { setError(`Allocations must sum to 100% (currently ${totalAllocation.toFixed(1)}%).`); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api.calculateAllocation({
        grossAnnualSalary: Number(grossSalary),
        workingDaysPerYear: Number(workingDays || 220),
        currency,
        clients: clients.map(c => ({
          clientName: c.clientName,
          allocationPercent: Number(c.allocationPercent),
          dailyRate: Number(c.dailyRate || 0),
          isBilled: c.isBilled,
        })),
        employeeAge: employeeAge ?? undefined,
        lfpRate: Number(lfpRate) / 100,
        laaNonProfessionalRate: Number(laaRate) / 100,
      }) as AllocationResultCH;
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }, [grossSalary, workingDays, currency, clients, employeeAge, lfpRate, laaRate, isAllocationValid, totalAllocation]);

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ---- Derived result computations ----
  const breakEvens: BreakEvenClient[] = result ? computeBreakEvens(result) : [];
  const weakestClient = breakEvens.length > 0
    ? breakEvens.reduce((a, b) => a.slack < b.slack ? a : b)
    : null;
  const sensitivityRows: SensitivityRow[] = result && weakestClient
    ? computeSensitivity(result, weakestClient)
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT: Inputs ====== */}
      <div className="space-y-4">

        {/* 1. Consultant identity */}
        <Card title="Consultant">
          <EmployeeIdentityFields identity={identity} onChange={setIdentity} />
          {employeeAge !== null && (
            <p className="text-xs text-indigo-600 mt-1">
              <strong>Age:</strong> {employeeAge} yrs &mdash; <strong>LPP:</strong> {getLPPBandLabel(employeeAge)}
            </p>
          )}
        </Card>

        {/* 2. Salary & working time */}
        <Card title="Salary & Working Time">
          <InputField
            label="Gross Annual Salary"
            value={grossSalary}
            onChange={setGrossSalary}
            suffix={currency}
            min={0}
            help="Consultant's gross annual salary before any deductions."
          />
          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Working Days / Year"
              value={workingDays}
              onChange={setWorkingDays}
              min={1} max={365}
              help="Default 220. Adjust for part-time or local calendar."
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

        {/* 3. Swiss social advanced */}
        <Card>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800"
          >
            <span>Advanced Options (Swiss Social Charges)</span>
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="LFP Vocational Training Rate"
                  value={lfpRate}
                  onChange={setLfpRate}
                  suffix="%" step={0.01}
                  help="Employer-only contribution. Typical range: 0.03–0.15%. Default 0.1%."
                />
                <InputField
                  label="LAA Non-Professional Rate"
                  value={laaRate}
                  onChange={setLaaRate}
                  suffix="%" step={0.1}
                  help="Non-professional accident insurance (employee share). Default 1.5%."
                />
              </div>
              <p className="text-xs text-gray-400">
                All other rates (AVS 5.3%, AC 1.1%, CAF 2.22%, LAMat 0.029%, CPE 0.07%, LAA professional 1.0%) use 2026 statutory values.
                LPP is computed automatically from date of birth.
              </p>
            </div>
          )}
        </Card>

        {/* 4. Client allocations */}
        <Card title="Client Allocations">
          <div className="space-y-3">
            {clients.map((client) => (
              <div key={client.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={client.clientName}
                    onChange={(e) => updateClient(client.id, 'clientName', e.target.value)}
                    className="text-sm font-medium text-gray-700 bg-transparent border-none focus:outline-none p-0 w-full"
                    placeholder="Client name"
                  />
                  {clients.length > 1 && (
                    <button onClick={() => removeClient(client.id)} className="ml-2 text-red-400 hover:text-red-600 text-xs shrink-0">
                      Remove
                    </button>
                  )}
                </div>

                {/* Billed / Internal toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">Type:</span>
                  <button
                    type="button"
                    onClick={() => updateClient(client.id, 'isBilled', true)}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      client.isBilled ? 'bg-green-100 border-green-400 text-green-700' : 'border-gray-300 text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => updateClient(client.id, 'isBilled', false)}
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      !client.isBilled ? 'bg-gray-200 border-gray-500 text-gray-700' : 'border-gray-300 text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    Internal
                  </button>
                </div>

                <div className={`grid gap-2 ${client.isBilled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <InputField
                    label="Allocation %"
                    value={client.allocationPercent}
                    onChange={(v) => updateClient(client.id, 'allocationPercent', v)}
                    suffix="%" min={0} max={100}
                  />
                  {client.isBilled && (
                    <InputField
                      label="Daily Rate"
                      value={client.dailyRate}
                      onChange={(v) => updateClient(client.id, 'dailyRate', v)}
                      suffix={currency}
                      min={0}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Allocation indicator */}
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Allocated</span>
              <span className={`font-semibold ${isAllocationValid ? 'text-green-600' : remaining > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {totalAllocation.toFixed(0)}% / 100%
                {isAllocationValid ? ' ✓' : remaining > 0 ? ` — ${remaining.toFixed(1)}% remaining` : ` — ${Math.abs(remaining).toFixed(1)}% over`}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${isAllocationValid ? 'bg-green-500' : totalAllocation > 100 ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(totalAllocation, 100)}%` }}
              />
            </div>
          </div>

          {clients.length < 4 && (
            <button
              onClick={addClient}
              className="mt-3 text-xs text-tsg-blue-500 hover:text-tsg-blue-700 font-medium"
            >
              + Add Client
            </button>
          )}
        </Card>

        <div className="flex gap-3">
          <Button onClick={calculate} disabled={loading || !isAllocationValid} className="flex-1">
            {loading ? 'Calculating…' : 'Calculate'}
          </Button>
        </div>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
      </div>

      {/* ====== RIGHT: Results ====== */}
      <div className="space-y-4">
        {loading && <Spinner />}

        {!result && !loading && (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">Multi-client profitability modeling</p>
              <p className="text-xs mt-1">Fill in the inputs and click <strong>Calculate</strong></p>
            </div>
          </Card>
        )}

        {result && !loading && (
          <>
            {/* Section 2 — Social charge breakdown */}
            <Card title="Employer Social Charges Breakdown">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500">Contribution</th>
                      <th className="text-right py-1.5 px-2 font-medium text-gray-500">Rate</th>
                      <th className="text-right py-1.5 px-2 font-medium text-gray-500">Base</th>
                      <th className="text-right py-1.5 px-2 font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.employerContributions.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 px-2 text-gray-700">{c.name}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-600">{(c.rate * 100).toFixed(2)}%</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-600">{fmtInt(c.base)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-800">{fmt(c.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="py-1.5 px-2 text-gray-700" colSpan={3}>Total employer contributions</td>
                      <td className="py-1.5 px-2 text-right font-mono text-gray-800">{fmt(result.totalEmployerContributions)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500">Gross Annual Salary</p>
                  <p className="font-mono font-semibold text-gray-800">{fmt(result.grossAnnualSalary)} {result.currency}</p>
                </div>
                <div className="bg-tsg-blue-50 rounded p-2">
                  <p className="text-tsg-blue-600">Total Employer Cost</p>
                  <p className="font-mono font-semibold text-tsg-blue-700">{fmt(result.totalEmployerCost)} {result.currency}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500">Daily Employer Cost</p>
                  <p className="font-mono font-semibold text-gray-800">{fmt(result.dailyEmployerCost)} {result.currency}/day</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500">Effective employer load</p>
                  <p className="font-mono font-semibold text-gray-800">
                    {fmt((result.totalEmployerContributions / result.grossAnnualSalary) * 100)}%
                  </p>
                </div>
              </div>
            </Card>

            {/* Section 3 — Per-client P&L + total */}
            <Card title="Per-Client P&L Summary">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Client</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Alloc.</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Days</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Rate/day</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Revenue</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Cost*</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.clients.map((c, i) => {
                      const propCost = Math.round(result.totalEmployerCost * c.allocationPercent / 100);
                      const profit = c.annualRevenue - propCost;
                      const margin = c.annualRevenue > 0 ? (profit / c.annualRevenue) * 100 : null;
                      return (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-2 text-gray-700 font-medium">
                            {c.clientName}
                            <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${c.isBilled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {c.isBilled ? 'billed' : 'internal'}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-gray-600">{c.allocationPercent}%</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-600">{c.days}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-600">{c.isBilled ? fmt(c.dailyRate) : '—'}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-800">{c.isBilled ? fmtInt(c.annualRevenue) : '—'}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-500">{fmtInt(propCost)}</td>
                          <td className={`py-2 px-2 text-right font-mono font-semibold ${c.isBilled ? (profit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                            {c.isBilled ? (
                              <>
                                {fmtInt(profit)}
                                {margin !== null && <span className="ml-1 text-[10px] font-normal">({margin.toFixed(0)}%)</span>}
                              </>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                      <td className="py-2 px-2 text-gray-700">Total</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-600">100%</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-600">{result.workingDaysPerYear}</td>
                      <td />
                      <td className="py-2 px-2 text-right font-mono text-gray-800">{fmtInt(result.totalRevenue)}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-500">{fmtInt(result.totalEmployerCost)}</td>
                      <td className={`py-2 px-2 text-right font-mono font-bold ${result.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {fmtInt(result.totalProfit)}
                        <span className="ml-1 text-[10px] font-normal">
                          ({result.marginPercent.toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">* Proportional cost = total employer cost × allocation%</p>
            </Card>

            {/* Section 4 — Break-even per billed client */}
            {breakEvens.length > 0 && (
              <Card title="Break-even Analysis">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Client</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Days</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Current rate</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Break-even rate</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Slack</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakEvens.map((c, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 px-2 text-gray-700 font-medium">{c.clientName}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-600">{c.days}</td>
                          <td className="py-2 px-2 text-right font-mono text-gray-800">{fmt(c.dailyRate)}</td>
                          <td className="py-2 px-2 text-right font-mono text-amber-700">{fmt(c.breakEvenRate)}</td>
                          <td className={`py-2 px-2 text-right font-mono font-semibold ${c.slack >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {c.slack >= 0 ? '+' : ''}{fmt(c.slack)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              c.slack < 0 ? 'bg-red-100 text-red-700' :
                              c.slack < c.dailyRate * 0.05 ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {c.slack < 0 ? 'Below break-even' : c.slack < c.dailyRate * 0.05 ? 'Near break-even' : 'Profitable'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Break-even rate = (total employer cost − other billed clients' revenue) ÷ client days
                </p>
              </Card>
            )}

            {/* Section 5 — Sensitivity table for weakest billed client */}
            {weakestClient && sensitivityRows.length > 0 && (
              <Card title={`Sensitivity — ${weakestClient.clientName} (weakest margin)`}>
                <p className="text-xs text-gray-500 mb-3">
                  Daily rate scenarios CHF 500–2,000 for <strong>{weakestClient.clientName}</strong>.
                  Break-even at <strong>{fmt(weakestClient.breakEvenRate)} {result.currency}/day</strong>.
                  All other clients' rates are held constant.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-right py-1.5 px-2 font-medium text-gray-500">Rate/day</th>
                        <th className="text-right py-1.5 px-2 font-medium text-gray-500">Revenue</th>
                        <th className="text-right py-1.5 px-2 font-medium text-gray-500">Total revenue</th>
                        <th className="text-right py-1.5 px-2 font-medium text-gray-500">Profit / Loss</th>
                        <th className="text-right py-1.5 px-2 font-medium text-gray-500">Margin</th>
                        <th className="text-center py-1.5 px-2 font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivityRows.map((row, i) => {
                        const isLoss = row.profit < 0;
                        const isOrange = !isLoss && row.isNearBreakEven;
                        const bgClass = row.isHighlighted
                          ? 'bg-amber-100 border-l-2 border-amber-500'
                          : isLoss ? 'bg-red-50'
                          : isOrange ? 'bg-orange-50'
                          : '';
                        const textClass = isLoss ? 'text-red-700' : isOrange ? 'text-orange-700' : 'text-green-700';
                        return (
                          <tr key={i} className={`border-b border-gray-100 ${bgClass}`}>
                            <td className={`py-1.5 px-2 text-right font-mono font-semibold ${row.isHighlighted ? 'text-amber-800' : 'text-gray-800'}`}>
                              {fmtInt(row.rate)}
                              {row.isHighlighted && <span className="ml-1 text-[9px] text-amber-600">← BEP</span>}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-gray-700">{fmtInt(row.clientRevenue)}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-gray-700">{fmtInt(row.totalRevenue)}</td>
                            <td className={`py-1.5 px-2 text-right font-mono font-semibold ${textClass}`}>
                              {row.profit >= 0 ? '+' : ''}{fmtInt(row.profit)}
                            </td>
                            <td className={`py-1.5 px-2 text-right font-mono ${textClass}`}>
                              {row.marginPct.toFixed(1)}%
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                isLoss ? 'bg-red-100 text-red-700' :
                                isOrange ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {isLoss ? 'Loss' : isOrange ? 'Marginal' : 'Profitable'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Disclaimer />
          </>
        )}
      </div>
    </div>
  );
}
