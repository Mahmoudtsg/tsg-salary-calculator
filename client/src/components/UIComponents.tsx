import React, { useState } from 'react';

// ============================================================
// Reusable UI Components
// ============================================================

// --- Help Tooltip ---
export function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        className="w-4 h-4 rounded-full bg-gray-300 text-gray-700 text-[10px] font-bold leading-none hover:bg-tsg-blue-500 hover:text-white transition-colors inline-flex items-center justify-center"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        ?
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
        </div>
      )}
    </span>
  );
}

// --- Section Card ---
export function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-5 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">{title}</h3>}
      {children}
    </div>
  );
}

// --- Input Field ---
interface InputFieldProps {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  help?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
}

export function InputField({ label, value, onChange, type = 'number', help, suffix, min, max, step, disabled, placeholder }: InputFieldProps) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {help && <HelpTip text={help} />}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tsg-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Select Field ---
interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  help?: string;
}

export function SelectField({ label, value, onChange, options, help }: SelectFieldProps) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {help && <HelpTip text={help} />}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-tsg-blue-500 focus:border-transparent bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// --- Toggle ---
export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (val: boolean) => void; help?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {help && <HelpTip text={help} />}
      </label>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-tsg-blue-500' : 'bg-gray-300'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}

// --- Disclaimer ---
export function Disclaimer() {
  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
      <p className="text-xs text-amber-700">
        <strong>Disclaimer:</strong> This calculator provides <strong>estimates</strong> based on current tax rules and rates.
        Results are for planning only and must be validated by a tax professional.
      </p>
    </div>
  );
}

// --- Result Row ---
export function ResultRow({ label, value, highlight, help, children }: { label: string; value: string; highlight?: boolean; help?: string; children?: React.ReactNode }) {
  return (
    <div className={`flex justify-between items-center py-2 px-3 ${highlight ? 'bg-tsg-blue-50 rounded-md font-semibold' : 'border-b border-gray-100'}`}>
      <span className="text-xs text-gray-600">
        {label}
        {help && <HelpTip text={help} />}
      </span>
      {children || <span className={`text-sm font-mono ${highlight ? 'text-tsg-blue-700' : 'text-gray-800'}`}>{value}</span>}
    </div>
  );
}

// --- Button ---
export function Button({ children, onClick, variant = 'primary', disabled, className = '' }: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  disabled?: boolean;
  className?: string;
}) {
  const base = 'px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-tsg-red text-white hover:bg-red-700',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

// --- Contribution Table ---
export function ContributionTable({ title, contributions, currency }: {
  title: string;
  contributions: { name: string; rate: number; base: number; amount: number }[];
  currency: string;
}) {
  const total = contributions.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">{title}</h4>
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
            {contributions.map((c, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5 px-2 text-gray-700">{c.name}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-600">{(c.rate * 100).toFixed(2)}%</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-600">{c.base.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-800">{c.amount.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="py-1.5 px-2 text-gray-700" colSpan={3}>Total</td>
              <td className="py-1.5 px-2 text-right font-mono text-gray-800">{total.toLocaleString('en', { minimumFractionDigits: 2 })} {currency}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Loading Spinner ---
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <div className="w-6 h-6 border-2 border-tsg-red border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

// --- Error Alert ---
export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-md flex justify-between items-start">
      <p className="text-xs text-red-700">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 text-red-400 hover:text-red-600 text-sm">&times;</button>
      )}
    </div>
  );
}
