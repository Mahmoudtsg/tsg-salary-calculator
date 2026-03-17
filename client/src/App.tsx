import React, { useState, useEffect } from 'react';
import EmployeeMode from './components/EmployeeMode';
import B2BMode from './components/B2BMode';
import AllocationMode from './components/AllocationMode';
import AdminMode from './components/AdminMode';
import LoginScreen from './components/LoginScreen';
import { api } from './services/api';
import type { AppMode, FXData, EmployeeIdentity, CurrentUser } from './types';

const MAIN_TABS: { key: AppMode; label: string; icon: string }[] = [
  { key: 'employee', label: 'Employee', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { key: 'b2b', label: 'B2B', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'allocation', label: 'Allocation', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
];

const IDENTITY_STORAGE_KEY = 'tsg_employee_identity';

function loadIdentity(): EmployeeIdentity {
  try {
    const s = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { employeeName: '', dateOfBirth: '', roleOrPosition: '' };
}

function loadSession(): CurrentUser | null {
  try {
    const s = localStorage.getItem('tsg_session');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(loadSession);
  const [activeTab, setActiveTab] = useState<AppMode>('employee');
  const [fxData, setFxData] = useState<FXData | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [identity, setIdentity] = useState<EmployeeIdentity>(loadIdentity);

  // Change-password modal
  const [showChangePw, setShowChangePw] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpNew2, setCpNew2] = useState('');
  const [cpError, setCpError] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpSuccess, setCpSuccess] = useState(false);

  const loadFXRates = async () => {
    setFxLoading(true);
    try { setFxData(await api.getFXRates() as FXData); }
    catch (err) { console.warn('Failed to load FX rates:', err); }
    finally { setFxLoading(false); }
  };

  const refreshFX = async () => {
    setFxLoading(true);
    try { setFxData(await api.refreshFXRates() as FXData); }
    catch (err) { console.warn('Failed to refresh FX rates:', err); }
    finally { setFxLoading(false); }
  };

  useEffect(() => { localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity)); }, [identity]);
  useEffect(() => { if (currentUser) loadFXRates(); }, []);

  const handleLogin = (user: CurrentUser) => {
    setCurrentUser(user);
    setActiveTab('employee');
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    localStorage.removeItem('tsg_session');
    setCurrentUser(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(''); setCpSuccess(false);
    if (cpNew.length < 6) { setCpError('New password must be at least 6 characters.'); return; }
    if (cpNew !== cpNew2) { setCpError('Passwords do not match.'); return; }
    setCpLoading(true);
    try {
      await api.changePassword(cpCurrent, cpNew);
      setCpSuccess(true);
      setCpCurrent(''); setCpNew(''); setCpNew2('');
      setTimeout(() => { setShowChangePw(false); setCpSuccess(false); }, 1500);
    } catch (err: any) {
      setCpError(err.message || 'Failed to change password.');
    } finally { setCpLoading(false); }
  };

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const tabs = currentUser.is_admin
    ? [...MAIN_TABS, { key: 'admin' as AppMode, label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }]
    : MAIN_TABS;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ====== Header ====== */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <img src="/logo.png" alt="Logo" className="h-10 w-10 mr-2 object-contain" />
              <h1 className="text-lg font-bold text-gray-900">Salary & Cost Calculator</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* FX status */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                {fxData && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span>FX: {fxData.lastUpdate?.slice(0, 10)}</span>
                    <button onClick={refreshFX} disabled={fxLoading}
                      className="text-tsg-blue-500 hover:text-tsg-blue-700 disabled:opacity-50" title="Refresh FX rates">
                      <svg className={`w-3.5 h-3.5 ${fxLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* User info + change password */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-xs text-gray-600 font-medium">{currentUser.full_name}</span>
                <button onClick={() => { setShowChangePw(true); setCpError(''); setCpSuccess(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors" title="Change password">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </button>
                <button onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors" title="Sign out">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ====== Tab Navigation ====== */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key ? 'border-tsg-red text-tsg-red' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ====== Main Content ====== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'employee' && <EmployeeMode fxData={fxData} identity={identity} onIdentityChange={setIdentity} currentUser={currentUser} />}
        {activeTab === 'b2b' && <B2BMode fxData={fxData} identity={identity} onIdentityChange={setIdentity} currentUser={currentUser} />}
        {activeTab === 'allocation' && <AllocationMode fxData={fxData} currentUser={currentUser} />}
        {activeTab === 'admin' && currentUser.is_admin && <AdminMode />}
      </main>

      {/* ====== Footer ====== */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} TSG. Internal use only.</p>
            <p className="text-xs text-gray-400">Tax Year: 2026 | All calculations are estimates</p>
          </div>
        </div>
      </footer>

      {/* ====== Change Password Modal ====== */}
      {showChangePw && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Change Password</h2>
            <p className="text-xs text-gray-500 mb-4">Signed in as <strong>{currentUser.full_name}</strong></p>
            {cpSuccess ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Password changed successfully!
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
                  <input type="password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red" required autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                  <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red"
                    placeholder="At least 6 characters" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
                  <input type="password" value={cpNew2} onChange={e => setCpNew2(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red" required />
                </div>
                {cpError && <p className="text-xs text-red-600">{cpError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowChangePw(false)}
                    className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={cpLoading}
                    className="flex-1 px-4 py-2 text-sm bg-tsg-red text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                    {cpLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
