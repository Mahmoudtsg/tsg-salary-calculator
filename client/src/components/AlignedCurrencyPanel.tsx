import React from 'react';
import { SelectField, Toggle } from './UIComponents';
import { AVAILABLE_CURRENCIES, getExchangeRate, formatCurrency, convertAmount } from '../utils/currency';
import type { FXData } from '../types';

interface Props {
  baseCurrency: string;
  fxData: FXData | null;
  alignmentCurrency: string;
  setAlignmentCurrency: (c: string) => void;
  showAligned: boolean;
  setShowAligned: (v: boolean) => void;
}

export default function AlignedCurrencyPanel({
  baseCurrency, fxData, alignmentCurrency, setAlignmentCurrency, showAligned, setShowAligned
}: Props) {
  const otherCurrencies = AVAILABLE_CURRENCIES.filter(c => c !== baseCurrency);
  const rate = fxData?.rates
    ? getExchangeRate(baseCurrency, alignmentCurrency, fxData.rates)
    : 0;

  return (
    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
      <h4 className="text-xs font-semibold text-indigo-700 uppercase mb-2">Aligned Currency View</h4>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <SelectField
            label="Convert to"
            value={alignmentCurrency}
            onChange={setAlignmentCurrency}
            options={otherCurrencies.map(c => ({ value: c, label: c }))}
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <Toggle
            label="Show aligned results"
            checked={showAligned}
            onChange={setShowAligned}
          />
        </div>
      </div>
      {rate > 0 && (
        <p className="text-[11px] text-indigo-600 mt-1 font-mono">
          1 {baseCurrency} = {rate.toFixed(4)} {alignmentCurrency}
        </p>
      )}
    </div>
  );
}

/** Helper: render a value with optional aligned column */
export function AlignedValue({
  amount, baseCurrency, alignmentCurrency, rates, showAligned
}: {
  amount: number;
  baseCurrency: string;
  alignmentCurrency: string;
  rates: Record<string, number>;
  showAligned: boolean;
}) {
  const base = formatCurrency(amount, baseCurrency);
  if (!showAligned || baseCurrency === alignmentCurrency) {
    return <span>{base}</span>;
  }
  const converted = convertAmount(amount, baseCurrency, alignmentCurrency, rates);
  return (
    <span>
      {base}
      <span className="ml-2 text-indigo-500 text-[11px]">({formatCurrency(converted, alignmentCurrency)})</span>
    </span>
  );
}
