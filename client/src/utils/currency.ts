// ============================================================
// Currency Utility - formatting & conversion
// Encapsulated so provider can be swapped later
// ============================================================

const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string }> = {
  CHF: { symbol: 'CHF', locale: 'de-CH' },
  EUR: { symbol: 'EUR', locale: 'de-DE' },
  RON: { symbol: 'RON', locale: 'ro-RO' },
  USD: { symbol: 'USD', locale: 'en-US' },
  GBP: { symbol: 'GBP', locale: 'en-GB' },
};

/** Format a number with proper currency symbol and thousands/decimal separators */
export function formatCurrency(amount: number, currency: string): string {
  const cfg = CURRENCY_CONFIG[currency];
  if (cfg) {
    try {
      return new Intl.NumberFormat(cfg.locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // fallback
    }
  }
  return `${amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** Simple number format (no currency symbol) with 2 decimals */
export function formatNum(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Convert using FX rates (RON-based). Returns rounded to 2 decimals. */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) return amount;
  const valueRON = amount / fromRate;
  return Math.round(valueRON * toRate * 100) / 100;
}

/** Get the exchange rate: 1 fromCurrency = X toCurrency */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return 1;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) return 0;
  return Math.round((toRate / fromRate) * 10000) / 10000;
}

export const AVAILABLE_CURRENCIES = ['CHF', 'EUR', 'RON', 'USD', 'GBP'];
