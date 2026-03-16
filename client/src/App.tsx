import React, { useState, useEffect } from 'react';
import EmployeeMode from './components/EmployeeMode';
import B2BMode from './components/B2BMode';
import AllocationMode from './components/AllocationMode';
import PayslipMode from './components/PayslipMode';
import WithholdingTaxMode from './components/WithholdingTaxMode';
import LoginScreen from './components/LoginScreen';
import { api } from './services/api';
import type { AppMode, FXData, EmployeeIdentity } from './types';

const TABS: { key: AppMode; label: string; icon: string }[] = [
  { key: 'employee', label: 'Employee', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { key: 'b2b', label: 'B2B', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'allocation', label: 'Allocation', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'payslip', label: 'Payslip', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'withholding', label: 'IS (GE/VD)', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
];

const IDENTITY_STORAGE_KEY = 'tsg_employee_identity';

function loadIdentity(): EmployeeIdentity {
  try {
    const s = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { employeeName: '', dateOfBirth: '', roleOrPosition: '' };
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AppMode>('employee');
  const [fxData, setFxData] = useState<FXData | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [identity, setIdentity] = useState<EmployeeIdentity>(loadIdentity);

  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }

  // Persist identity
  useEffect(() => {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  }, [identity]);

  // Load FX rates on mount
  useEffect(() => { loadFXRates(); }, []);

  const loadFXRates = async () => {
    setFxLoading(true);
    try {
      const data = await api.getFXRates() as FXData;
      setFxData(data);
    } catch (err) {
      console.warn('Failed to load FX rates:', err);
    } finally {
      setFxLoading(false);
    }
  };

  const refreshFX = async () => {
    setFxLoading(true);
    try {
      const data = await api.refreshFXRates() as FXData;
      setFxData(data);
    } catch (err) {
      console.warn('Failed to refresh FX rates:', err);
    } finally {
      setFxLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ====== Header ====== */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <svg width="44" height="27" viewBox="0 0 200 120" className="mr-2">
                  {/* Left red diamond */}
                  <polygon points="0,60 50,10 100,60 50,110" fill="#D6001C"/>
                  {/* Right red arrow with V-notch */}
                  <polygon points="70,12 185,12 200,60 185,108 70,108 94,60" fill="#D6001C"/>
                  {/* Black overlap triangle */}
                  <polygon points="70,30 94,60 70,90" fill="#000000"/>
                </svg>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 leading-tight">
                    <span className="text-tsg-red">TSG</span> Salary & Cost Calculator
                  </h1>
                  <p className="text-[10px] text-gray-400 leading-tight">Technology Staffing Group</p>
                </div>
              </div>
            </div>

            {/* FX Status + Logout */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                {fxData && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                    <span>FX: {fxData.lastUpdate?.slice(0, 10)}</span>
                    <button
                      onClick={refreshFX}
                      disabled={fxLoading}
                      className="text-tsg-blue-500 hover:text-tsg-blue-700 disabled:opacity-50"
                      title="Refresh FX rates"
                    >
                      <svg className={`w-3.5 h-3.5 ${fxLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setAuthenticated(false)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                title="Sign out"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ====== Tab Navigation ====== */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-tsg-red text-tsg-red'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
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
        <div className="transition-all duration-200">
          {activeTab === 'employee' && <EmployeeMode fxData={fxData} identity={identity} onIdentityChange={setIdentity} />}
          {activeTab === 'b2b' && <B2BMode fxData={fxData} identity={identity} onIdentityChange={setIdentity} />}
          {activeTab === 'allocation' && <AllocationMode fxData={fxData} />}
          {activeTab === 'payslip' && <PayslipMode fxData={fxData} identity={identity} onIdentityChange={setIdentity} />}
          {activeTab === 'withholding' && <WithholdingTaxMode />}
        </div>
      </main>

      {/* ====== Footer ====== */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Technology Staffing Group. Internal use only.
            </p>
            <p className="text-xs text-gray-400">
              Tax Year: 2026 | All calculations are estimates
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
