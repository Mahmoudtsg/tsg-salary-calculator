import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, InputField, SelectField, Button, Disclaimer,
  ResultRow, Spinner, ErrorAlert
} from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { exportPayslipPDF } from '../services/pdfExport';
import type { FXData, EmployeeIdentity, PayslipResult, PayslipDeductionLine } from '../types';

const STORAGE_KEY = 'tsg_payslip_inputs';
function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

// --- Default deduction rates (Geneva / CH standard) ---
const DEFAULT_DEDUCTIONS = [
  { code: 'AVS', label: 'AVS/AI/APG',       rate: 5.30 },
  { code: 'MAT', label: 'Maternity',         rate: 0.029 },
  { code: 'AC',  label: 'Unemployment (AC)',  rate: 1.10 },
  { code: 'ACC', label: 'Accident (AANP)',    rate: 1.153 },
  { code: 'MAL', label: 'Sickness (IJM)',     rate: 0.407 },
];

interface DeductionInput {
  code: string;
  label: string;
  rate: string;  // editable as string
}

interface Props {
  fxData: FXData | null;
  identity: EmployeeIdentity;
  onIdentityChange: (id: EmployeeIdentity) => void;
}

export default function PayslipMode({ fxData, identity, onIdentityChange }: Props) {
  const saved = loadSaved();

  const [grossMonthlySalary, setGrossMonthlySalary] = useState<string>(saved?.grossMonthlySalary || '10000');
  const [currency, setCurrency] = useState<string>(saved?.currency || 'CHF');
  const [lppEmployeeAmount, setLppEmployeeAmount] = useState<string>(saved?.lppEmployeeAmount || '0');
  const [payPeriod, setPayPeriod] = useState<string>(saved?.payPeriod || new Date().toISOString().slice(0, 7));
  const [companyName, setCompanyName] = useState<string>(saved?.companyName || 'Technology Staffing Group SA');

  // Editable deduction rates
  const [deductions, setDeductions] = useState<DeductionInput[]>(
    saved?.deductions || DEFAULT_DEDUCTIONS.map(d => ({ code: d.code, label: d.label, rate: String(d.rate) }))
  );

  const [showIdentity, setShowIdentity] = useState(true);
  const [showRateEditor, setShowRateEditor] = useState(false);

  // Aligned currency
  const [alignmentCurrency, setAlignmentCurrency] = useState<string>(saved?.alignmentCurrency || 'EUR');
  const [showAligned, setShowAligned] = useState(false);

  const [result, setResult] = useState<PayslipResult | null>(null);

  // Persist inputs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      grossMonthlySalary, currency, lppEmployeeAmount, payPeriod, companyName, deductions, alignmentCurrency,
    }));
  }, [grossMonthlySalary, currency, lppEmployeeAmount, payPeriod, companyName, deductions, alignmentCurrency]);

  const updateDeductionRate = (code: string, rate: string) => {
    setDeductions(deductions.map(d => d.code === code ? { ...d, rate } : d));
  };

  const calculate = useCallback(() => {
    const gross = Number(grossMonthlySalary);
    if (!gross || gross <= 0) return;

    const lines: PayslipDeductionLine[] = deductions.map(d => {
      const r = Number(d.rate);
      const amount = Math.round(gross * r / 100 * 100) / 100;
      return {
        code: d.code,
        label: d.label,
        base: gross,
        rate: r,
        amount,
        isManual: false,
      };
    });

    const lpp = Number(lppEmployeeAmount) || 0;
    if (lpp > 0) {
      lines.push({
        code: 'LPP',
        label: 'LPP/BVG Pension',
        base: gross,
        rate: 0,
        amount: lpp,
        isManual: true,
      });
    }

    const totalDeductions = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const netSalary = Math.round((gross - totalDeductions) * 100) / 100;

    setResult({
      grossMonthlySalary: gross,
      deductions: lines,
      totalDeductions,
      netSalary,
      currency,
    });
  }, [grossMonthlySalary, currency, lppEmployeeAmount, deductions]);

  // Auto-calculate on input change
  useEffect(() => {
    if (Number(grossMonthlySalary) > 0) calculate();
  }, [grossMonthlySalary, currency, lppEmployeeAmount, deductions, calculate]);

  const rates = fxData?.rates || {};
  const av = (amt: number) => (
    <AlignedValue amount={amt} baseCurrency={currency} alignmentCurrency={alignmentCurrency} rates={rates} showAligned={showAligned} />
  );
  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Format period for display
  const formatPeriod = (p: string) => {
    try {
      const [y, m] = p.split('-');
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[Number(m) - 1]} ${y}`;
    } catch { return p; }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ====== LEFT: Inputs ====== */}
      <div className="space-y-4">
        <Card title="Payslip Configuration">
          <InputField
            label="Company Name"
            value={companyName}
            onChange={setCompanyName}
            type="text"
            help="Company name displayed on the payslip header."
          />
          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Pay Period"
              value={payPeriod}
              onChange={setPayPeriod}
              type="month"
              help="Month and year of the payslip."
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
            label="Gross Monthly Salary"
            value={grossMonthlySalary}
            onChange={setGrossMonthlySalary}
            suffix={currency}
            min={0}
            help="The gross monthly salary before deductions."
          />
          <InputField
            label="LPP/BVG Employee Amount (manual)"
            value={lppEmployeeAmount}
            onChange={setLppEmployeeAmount}
            suffix={currency}
            min={0}
            help="LPP pension contribution entered manually. Added to total deductions as-is."
          />
        </Card>

        {/* Employee Identity */}
        <Card>
          <button onClick={() => setShowIdentity(!showIdentity)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>Employee Details (optional)</span>
            <span className={`transform transition-transform ${showIdentity ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showIdentity && <div className="mt-4"><EmployeeIdentityFields identity={identity} onChange={onIdentityChange} /></div>}
        </Card>

        {/* Editable Rates */}
        <Card>
          <button onClick={() => setShowRateEditor(!showRateEditor)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>Edit Deduction Rates</span>
            <span className={`transform transition-transform ${showRateEditor ? 'rotate-180' : ''}`}>&#9660;</span>
          </button>
          {showRateEditor && (
            <div className="mt-4 space-y-2">
              {deductions.map(d => (
                <InputField
                  key={d.code}
                  label={`${d.label} (${d.code})`}
                  value={d.rate}
                  onChange={(v) => updateDeductionRate(d.code, v)}
                  suffix="%"
                  step={0.001}
                  min={0}
                />
              ))}
              <button
                onClick={() => setDeductions(DEFAULT_DEDUCTIONS.map(d => ({ code: d.code, label: d.label, rate: String(d.rate) })))}
                className="text-xs text-tsg-blue-500 hover:text-tsg-blue-700"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </Card>

        <div className="flex gap-3">
          {result && (
            <Button variant="outline" onClick={() => exportPayslipPDF(result, {
              companyName, payPeriod: formatPeriod(payPeriod), identity,
              alignmentCurrency: showAligned ? alignmentCurrency : undefined,
              rates: showAligned ? rates : undefined,
            })}>
              Download Payslip PDF
            </Button>
          )}
        </div>
      </div>

      {/* ====== RIGHT: Payslip Preview ====== */}
      <div className="space-y-4">
        {/* Aligned Currency Panel */}
        <AlignedCurrencyPanel baseCurrency={currency} fxData={fxData}
          alignmentCurrency={alignmentCurrency} setAlignmentCurrency={setAlignmentCurrency}
          showAligned={showAligned} setShowAligned={setShowAligned} />

        {result ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* Payslip Header */}
            <div className="bg-gray-800 text-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="28" height="22" viewBox="0 0 120 100">
                      <polygon points="10,50 35,25 60,50 35,75" fill="#D6001C"/>
                      <polygon points="35,50 60,25 85,50 60,75" fill="#FFFFFF"/>
                      <polygon points="35,50 47,38 60,50 47,62" fill="#D6001C"/>
                    </svg>
                    <span className="font-bold text-sm">{companyName}</span>
                  </div>
                  <p className="text-gray-400 text-xs">Pay Statement</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatPeriod(payPeriod)}</p>
                  <p className="text-gray-400 text-[10px]">{result.currency}</p>
                </div>
              </div>
            </div>

            {/* Employee Details */}
            {(identity.employeeName || identity.dateOfBirth || identity.roleOrPosition) && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Employee Details</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {identity.employeeName && <div><span className="text-gray-400">Name:</span> <span className="font-medium">{identity.employeeName}</span></div>}
                  {identity.dateOfBirth && <div><span className="text-gray-400">DOB:</span> <span className="font-medium">{identity.dateOfBirth}</span></div>}
                  {identity.roleOrPosition && <div><span className="text-gray-400">Role:</span> <span className="font-medium">{identity.roleOrPosition}</span></div>}
                </div>
              </div>
            )}

            {/* Earnings */}
            <div className="px-5 py-3 border-b border-gray-200">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Earnings</h4>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs text-gray-700">Gross Monthly Salary</span>
                <span className="text-sm font-mono font-semibold text-gray-800">{av(result.grossMonthlySalary)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div className="px-5 py-3 border-b border-gray-200">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Deductions</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left py-1 font-medium">Code</th>
                      <th className="text-left py-1 font-medium">Description</th>
                      <th className="text-right py-1 font-medium">Rate</th>
                      <th className="text-right py-1 font-medium">Amount</th>
                      {showAligned && currency !== alignmentCurrency && <th className="text-right py-1 font-medium text-indigo-400">{alignmentCurrency}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.deductions.map((d, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 font-mono text-gray-500">{d.code}</td>
                        <td className="py-1.5 text-gray-700">{d.label}</td>
                        <td className="py-1.5 text-right font-mono text-gray-500">
                          {d.isManual ? 'Manual' : `${d.rate.toFixed(3)}%`}
                        </td>
                        <td className="py-1.5 text-right font-mono text-red-600">-{fmt(d.amount)}</td>
                        {showAligned && currency !== alignmentCurrency && (
                          <td className="py-1.5 text-right font-mono text-indigo-500 text-[11px]">
                            -{fmt(convertAmt(d.amount, currency, alignmentCurrency, rates))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50 font-semibold">
                      <td colSpan={3} className="py-2 text-gray-700 text-xs">Total Deductions</td>
                      <td className="py-2 text-right font-mono text-red-700">-{fmt(result.totalDeductions)}</td>
                      {showAligned && currency !== alignmentCurrency && (
                        <td className="py-2 text-right font-mono text-indigo-600 text-[11px]">
                          -{fmt(convertAmt(result.totalDeductions, currency, alignmentCurrency, rates))}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Net Salary */}
            <div className="px-5 py-4 bg-green-50">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-800">Net Salary</span>
                <span className="text-lg font-mono font-bold text-green-700">{av(result.netSalary)}</span>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Enter a gross monthly salary to preview the payslip</p>
              <p className="text-xs mt-1">Geneva-style deductions with configurable rates</p>
            </div>
          </Card>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}

// Helper for inline aligned conversion
function convertAmt(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}
