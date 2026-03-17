// ============================================================
// API Service - Handles all backend communication
// ============================================================

const API_BASE = '/api';

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('tsg_session');
    if (!stored) return null;
    return JSON.parse(stored).token ?? null;
  } catch { return null; }
}

async function apiCall<T>(endpoint: string, options?: RequestInit, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
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

  // ---- Auth ----
  login: (username: string, password: string) =>
    apiCall<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    apiCall('/auth/logout', { method: 'POST' }, true),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiCall('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }, true),

  // ---- Activity log ----
  logActivity: (action: string, detail?: string) =>
    apiCall('/activity/log', {
      method: 'POST',
      body: JSON.stringify({ action, detail }),
    }, true).catch(() => { /* silent — don't break the app if logging fails */ }),

  // ---- Admin ----
  getUsers: () => apiCall<any[]>('/admin/users', undefined, true),

  createUser: (username: string, full_name: string, is_admin: boolean) =>
    apiCall<{ user: any; tempPassword: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, full_name, is_admin }),
    }, true),

  updateUser: (id: number, updates: { full_name?: string; is_admin?: boolean }) =>
    apiCall<any>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, true),

  resetUserPassword: (id: number) =>
    apiCall<{ tempPassword: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }, true),

  deleteUser: (id: number) =>
    apiCall(`/admin/users/${id}`, { method: 'DELETE' }, true),

  getActivityLog: () => apiCall<any[]>('/admin/logs', undefined, true),
};
