// ============================================================
// API Service - Handles all backend communication
// ============================================================

const API_BASE = '/api';

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }
  return data.data;
}

export const api = {
  calculateEmployee: (input: any) =>
    apiCall('/calculate/employee', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  calculateB2B: (input: any) =>
    apiCall('/calculate/b2b', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  calculateAllocation: (input: any) =>
    apiCall('/calculate/allocation', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getFXRates: () => apiCall('/fx/rates'),

  convertCurrency: (amount: number, from: string, to: string) =>
    apiCall('/fx/convert', {
      method: 'POST',
      body: JSON.stringify({ amount, from, to }),
    }),

  refreshFXRates: () =>
    apiCall('/fx/refresh', { method: 'POST' }),

  // Withholding Tax (Impôt à la source) - Geneva
  getWithholdingCodes: () =>
    apiCall('/withholding/geneva/codes'),

  calculateWithholding: (input: any) =>
    apiCall('/withholding/geneva/simple', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Withholding Tax (Impôt à la source) - Vaud
  getWithholdingCodesVD: () =>
    apiCall('/withholding/vaud/codes'),

  calculateWithholdingVD: (input: any) =>
    apiCall('/withholding/vaud/simple', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
