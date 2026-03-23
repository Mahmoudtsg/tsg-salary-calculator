// ============================================================
// API Service — all backend calls, with Entra Bearer token
// ============================================================

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalConfig, loginScopes } from '../authConfig';

const API_BASE = '/api';

// Reuse the same MSAL instance (singleton created in main.tsx)
// We import the config here just to construct an identical instance reference.
// In practice the browser-cached singleton is used — MSAL deduplicates by clientId.
let _msalInstance: PublicClientApplication | null = null;
function getMsal(): PublicClientApplication {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}

/** Silently get an up-to-date ID token for the active account */
async function getBearerToken(): Promise<string | null> {
  try {
    const msal = getMsal();
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    if (!account) return null;
    const result = await msal.acquireTokenSilent({ scopes: loginScopes, account });
    return result.idToken;          // ID token validated server-side by audience = clientId
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      // Session expired — force a fresh redirect login
      getMsal().loginRedirect({ scopes: loginScopes });
    }
    return null;
  }
}

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getBearerToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
};
