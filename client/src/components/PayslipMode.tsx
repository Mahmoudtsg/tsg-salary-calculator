import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, InputField, SelectField, Button, Disclaimer,
  ResultRow, Spinner, ErrorAlert
} from './UIComponents';
import EmployeeIdentityFields from './EmployeeIdentityFields';
import AlignedCurrencyPanel, { AlignedValue } from './AlignedCurrencyPanel';
import { exportPayslipPDF } from '../services/pdfExport';
import { api } from '../services/api';
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

// Monthly ceiling for AC and AANP base (annual 148'200 / 12 = 12'350)
const AC_AANP_MONTHLY_CAP = 12350;

// AAC rate: applied on full gross when gross > 12'350
const AAC_RATE = 0.092; // 0.092%

// --- LPP age-band plan constants (same as Employee mode CH) ---
const LPP_ENTRY_THRESHOLD_YEARLY = 22050;
const LPP_PLAN_CEILING_YEARLY = 300000;
const LPP_COORDINATION_DEDUCTION_YEARLY = 26460;

const LPP_AGE_BANDS = [
  { minAge: 18, maxAge: 24, totalRate: 0.003, label: '18–24 yrs: 0.3%' },
  { minAge: 25, maxAge: 34, totalRate: 0.084, label: '25–34 yrs: 8.4%' },
  { minAge: 35, maxAge: 44, totalRate: 0.114, label: '35–44 yrs: 11.4%' },
  { minAge: 45, maxAge: 54, totalRate: 0.174, label: '45–54 yrs: 17.4%' },
  { minAge: 55, maxAge: 65, totalRate: 0.204, label: '55–65 yrs: 20.4%' },
];

type LPPMode = 'MANUAL' | 'AUTO';

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

/** Get the LPP total rate for a given age, or 0 if outside bands. */
function getLPPTotalRate(age: number): number {
  for (const band of LPP_AGE_BANDS) {
    if (age >= band.minAge && age <= band.maxAge) return band.totalRate;
  }
  return 0;
}

/** Get the LPP age-band label for display. */
function getLPPBandLabel(age: number): string {
  for (const band of LPP_AGE_BANDS) {
    if (age >= band.minAge && age <= band.maxAge) return band.label;
  }
  if (age < 18) return 'Below LPP age';
  return 'Above LPP age';
}

/** Compute the monthly LPP employee deduction using the age-band plan.
 *  grossMonthly = monthly gross salary
 *  age = employee age in years
 *  Returns the employee's 50% share of the total LPP contribution, monthly. */
function computeLPPAutoMonthly(grossMonthly: number, age: number): { amount: number; rate: number; insuredSalaryMonthly: number } | null {
  const grossYearly = grossMonthly * 12;
  if (grossYearly < LPP_ENTRY_THRESHOLD_YEARLY) return null;
  const totalRate = getLPPTotalRate(age);
  if (totalRate <= 0) return null;
  const cappedYearly = Math.min(grossYearly, LPP_PLAN_CEILING_YEARLY);
  const insuredSalaryYearly = Math.max(cappedYearly - LPP_COORDINATION_DEDUCTION_YEARLY, 0);
  if (insuredSalaryYearly <= 0) return null;
  // Employee's share = 50% of total
  const halfRate = totalRate / 2;
  const yearlyAmount = Math.round(insuredSalaryYearly * halfRate * 100) / 100;
  const monthlyAmount = Math.round(yearlyAmount / 12 * 100) / 100;
  const insuredSalaryMonthly = Math.round(insuredSalaryYearly / 12 * 100) / 100;
  return { amount: monthlyAmount, rate: halfRate, insuredSalaryMonthly };
}

interface DeductionInput {
  code: string;
  label: string;
  rate: string;  // editable as string
}

interface Props {
  fxData: FXData | null;
  identity: EmployeeIdentity;
  onIdentityChange: (id: EmployeeIdentity) => void;
  currentUser?: { full_name: string; token: string } | null;
}

export default function PayslipMode({ fxData, identity, onIdentityChange, currentUser }: Props) {
  const saved = loadSaved();

  const [grossMonthlySalary, setGrossMonthlySalary] = useState<string>(saved?.grossMonthlySalary || '10000');
  const [currency, setCurrency] = useState<string>(saved?.currency || 'CHF');
  const [payPeriod, setPayPeriod] = useState<string>(saved?.payPeriod || new Date().toISOString().slice(0, 7));
  const [companyName, setCompanyName] = useState<string>(saved?.companyName || 'TSG SA');

  // LPP mode: manual or auto-calculated from DOB
  const [lppMode, setLppMode] = useState<LPPMode>(saved?.lppMode || 'MANUAL');
  const [lppEmployeeAmount, setLppEmployeeAmount] = useState<string>(saved?.lppEmployeeAmount || '0');

  // Impôt à la source (IS) — manual entry
  const [isAmount, setIsAmount] = useState<string>(saved?.isAmount || '0');

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

  // Computed age from identity DOB
  const employeeAge = computeAge(identity.dateOfBirth);

  // Persist inputs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      grossMonthlySalary, currency, lppEmployeeAmount, lppMode, payPeriod, companyName, deductions, alignmentCurrency, isAmount,
    }));
  }, [grossMonthlySalary, currency, lppEmployeeAmount, lppMode, payPeriod, companyName, deductions, alignmentCurrency, isAmount]);

  const updateDeductionRate = (code: string, rate: string) => {
    setDeductions(deductions.map(d => d.code === code ? { ...d, rate } : d));
  };

  const calculate = useCallback(() => {
    const gross = Number(grossMonthlySalary);
    if (!gross || gross <= 0) return;

    // Codes whose base is capped at AC_AANP_MONTHLY_CAP when gross exceeds it
    const CAPPED_CODES = ['AC', 'ACC'];

    const lines: PayslipDeductionLine[] = deductions.map(d => {
      const r = Number(d.rate);
      // AC and AANP: if gross > 12'350, base is capped at 12'350
      const base = CAPPED_CODES.includes(d.code) && gross > AC_AANP_MONTHLY_CAP
        ? AC_AANP_MONTHLY_CAP
        : gross;
      const amount = Math.round(base * r / 100 * 100) / 100;
      return {
        code: d.code,
        label: d.label,
        base,
        rate: r,
        amount,
        isManual: false,
      };
    });

    // AAC (Assurance Accidents Complémentaire): only when gross > 12'350
    if (gross > AC_AANP_MONTHLY_CAP) {
      const aacAmount = Math.round(gross * AAC_RATE / 100 * 100) / 100;
      lines.push({
        code: 'AAC',
        label: 'Accidents Complémentaire',
        base: gross,
        rate: AAC_RATE,
        amount: aacAmount,
        isManual: false,
      });
    }

    // LPP: manual or auto
    if (lppMode === 'MANUAL') {
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
    } else {
      // AUTO: compute from DOB
      if (employeeAge !== null && employeeAge >= 18) {
        const lppCalc = computeLPPAutoMonthly(gross, employeeAge);
        if (lppCalc) {
          lines.push({
            code: 'LPP',
            label: `LPP/BVG Pension (${getLPPBandLabel(employeeAge)})`,
            base: lppCalc.insuredSalaryMonthly,
            rate: Math.round(lppCalc.rate * 100 * 1000) / 1000, // as percentage for display
            amount: lppCalc.amount,
            isManual: false,
          });
        }
      }
    }

    // IS (Impôt à la source) — optional manual entry
    const isAmt = Number(isAmount) || 0;
    if (isAmt > 0) {
      lines.push({
        code: 'IS',
        label: 'Impôt à la source',
        base: gross,
        rate: 0,
        amount: isAmt,
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
  }, [grossMonthlySalary, currency, lppEmployeeAmount, lppMode, deductions, employeeAge, isAmount]);

  // Auto-calculate on input change
  useEffect(() => {
    if (Number(grossMonthlySalary) > 0) calculate();
  }, [grossMonthlySalary, currency, lppEmployeeAmount, lppMode, deductions, isAmount, calculate]);

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

  // LPP auto preview values (for the input panel display)
  const lppAutoPreview = (lppMode === 'AUTO' && employeeAge !== null && employeeAge >= 18)
    ? computeLPPAutoMonthly(Number(grossMonthlySalary), employeeAge)
    : null;

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
          {/* AAC info notice */}
          {Number(grossMonthlySalary) > AC_AANP_MONTHLY_CAP && (
            <p className="text-[11px] text-blue-600 -mt-1">
              Gross &gt; {fmt(AC_AANP_MONTHLY_CAP)}: AAC (Accidents Compl&eacute;mentaire) at {AAC_RATE}% will be added automatically.
            </p>
          )}
        </Card>

        {/* LPP Pension Section */}
        <Card title="LPP/BVG Pension Contribution">
          <SelectField
            label="LPP Mode"
            value={lppMode}
            onChange={(v) => setLppMode(v as LPPMode)}
            options={[
              { value: 'MANUAL', label: 'Manual entry' },
              { value: 'AUTO', label: 'Auto-calculate from Date of Birth' },
            ]}
            help="Choose whether to enter the LPP amount manually or calculate it automatically using the Swiss age-band plan."
          />
          {lppMode === 'MANUAL' && (
            <InputField
              label="LPP/BVG Employee Amount"
              value={lppEmployeeAmount}
              onChange={setLppEmployeeAmount}
              suffix={currency}
              min={0}
              help="Employee's monthly LPP pension contribution. Added to total deductions as-is."
            />
          )}
          {lppMode === 'AUTO' && (
            <div className="space-y-2">
              {!identity.dateOfBirth ? (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Please enter Date of Birth in Employee Details below to calculate LPP automatically.
                </p>
              ) : employeeAge !== null ? (
                <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                  <div><strong>Age:</strong> {employeeAge} years &mdash; <strong>LPP band:</strong> {getLPPBandLabel(employeeAge)}</div>
                  {lppAutoPreview ? (
                    <div className="mt-1">
                      <strong>Insured salary:</strong> {fmt(lppAutoPreview.insuredSalaryMonthly)} {currency}/month &mdash;
                      <strong> Employee share:</strong> {(lppAutoPreview.rate * 100).toFixed(2)}% = <strong>{fmt(lppAutoPreview.amount)} {currency}</strong>
                    </div>
                  ) : (
                    <div className="mt-1 text-amber-600">Salary below LPP entry threshold or age outside LPP range &mdash; no LPP contribution.</div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </Card>

        {/* Impôt à la source (IS) */}
        <Card title="Impôt à la source (IS)">
          <InputField
            label="Monthly IS Amount"
            value={isAmount}
            onChange={setIsAmount}
            suffix={currency}
            min={0}
            step={10}
            placeholder="0 = not applicable"
            help="Enter the monthly withholding tax (IS) if applicable. Use the IS (GE) tab to calculate the exact amount. Leave at 0 if not applicable."
          />
          {Number(isAmount) > 0 && (
            <p className="text-[11px] text-amber-600 mt-1">
              IS of {fmt(Number(isAmount) || 0)} {currency} will appear as a deduction on the payslip.
            </p>
          )}
        </Card>

        {/* Employee Identity */}
        <Card>
          <button onClick={() => setShowIdentity(!showIdentity)} className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
            <span>
              Employee Details
              {lppMode === 'AUTO' && !identity.dateOfBirth
                ? <span className="text-red-500 ml-1 text-xs">(DOB required for auto LPP)</span>
                : ' (optional)'}
            </span>
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
            <Button variant="outline" onClick={() => { exportPayslipPDF(result, {
              companyName, payPeriod: formatPeriod(payPeriod), identity,
              alignmentCurrency: showAligned ? alignmentCurrency : undefined,
              rates: showAligned ? rates : undefined,
              generatedBy: currentUser?.full_name,
            }); }}>
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
              {/* Cap notice */}
              {result.grossMonthlySalary > AC_AANP_MONTHLY_CAP && (
                <p className="text-[10px] text-amber-600 mb-2">
                  AC &amp; AANP base capped at {fmt(AC_AANP_MONTHLY_CAP)} {currency} (annual ceiling 148&apos;200 / 12).
                  AAC applied on full gross.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left py-1 font-medium">Code</th>
                      <th className="text-left py-1 font-medium">Description</th>
                      <th className="text-right py-1 font-medium">Base</th>
                      <th className="text-right py-1 font-medium">Rate</th>
                      <th className="text-right py-1 font-medium">Amount</th>
                      {showAligned && currency !== alignmentCurrency && <th className="text-right py-1 font-medium text-indigo-400">{alignmentCurrency}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.deductions.map((d, i) => {
                      const isCapped = !d.isManual && d.base < result.grossMonthlySalary;
                      return (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1.5 font-mono text-gray-500">{d.code}</td>
                          <td className="py-1.5 text-gray-700">{d.label}</td>
                          <td className={`py-1.5 text-right font-mono ${isCapped ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                            {d.isManual ? '-' : fmt(d.base)}{isCapped && ' *'}
                          </td>
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
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50 font-semibold">
                      <td colSpan={4} className="py-2 text-gray-700 text-xs">Total Deductions</td>
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
