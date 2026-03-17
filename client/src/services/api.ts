// ============================================================
// API Service - Handles all backend communication
// ============================================================

const API_BASE = '/api';

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(`${API_BASE}${endpoint}`, { headers, ...options });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server error (${res.status}). Please try again or contact support.`);
  }
  if (!data.success) throw new Error(data.error || 'API request failed');
  return data.data;
}

export const api = {
  // ---- Calculations (no auth required) ----
  calculateEmployee: (input: any) =>
    apiCall('/calculate/employee', { method: 'POST', body: JSON.stringify(input) }),

  calculateB2B: (input: any) =>
    apiCall('/calculate/b2b', { method: 'POST', body: JSON.stringify(input) }),

  calculateAllocation: (input: any) =>
    apiCall('/calculate/allocation', { method: 'POST', body: JSON.stringify(input) }),

  getFXRates: () => apiCall('/fx/rates'),

  convertCurrency: (amount: number, from: string, to: string) =>
    apiCall('/fx/convert', { method: 'POST', body: JSON.stringify({ amount, from, to }) }),

  refreshFXRates: () => apiCall('/fx/refresh', { method: 'POST' }),

  getWithholdingCodes: () => apiCall('/withholding/geneva/codes'),

  calculateWithholding: (input: any) =>
    apiCall('/withholding/geneva/simple', { method: 'POST', body: JSON.stringify(input) }),

  getWithholdingCodesVD: () => apiCall('/withholding/vaud/codes'),

  calculateWithholdingVD: (input: any) =>
    apiCall('/withholding/vaud/simple', { method: 'POST', body: JSON.stringify(input) }),

  // Stubs — activity logging and admin removed (no database on Vercel)
  logActivity: (_action: string, _detail?: string) => Promise.resolve(),
  getUsers: () => Promise.resolve([] as any[]),
  createUser: (_u: string, _n: string, _a: boolean) => Promise.reject(new Error('Not available')),
  updateUser: (_id: number, _u: any) => Promise.reject(new Error('Not available')),
  resetUserPassword: (_id: number) => Promise.reject(new Error('Not available')),
  deleteUser: (_id: number) => Promise.reject(new Error('Not available')),
  getActivityLog: () => Promise.resolve([] as any[]),
};
