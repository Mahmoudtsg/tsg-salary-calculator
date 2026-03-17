import React, { useState } from 'react';
import { api } from '../services/api';
import type { CurrentUser } from '../types';

interface Props {
  onLogin: (user: CurrentUser) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [pendingUser, setPendingUser] = useState<CurrentUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [changePwError, setChangePwError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(username.trim(), password) as any;
      const currentUser: CurrentUser = { ...user, token };
      localStorage.setItem('tsg_session', JSON.stringify(currentUser));
      if (currentUser.must_change_password) {
        setPendingUser(currentUser);
      } else {
        onLogin(currentUser);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwError('');
    if (newPassword.length < 6) { setChangePwError('Password must be at least 6 characters.'); return; }
    if (newPassword !== newPassword2) { setChangePwError('Passwords do not match.'); return; }
    setChangingPw(true);
    try {
      await api.changePassword(password, newPassword);
      const updated: CurrentUser = { ...pendingUser!, must_change_password: false };
      localStorage.setItem('tsg_session', JSON.stringify(updated));
      onLogin(updated);
    } catch (err: any) {
      setChangePwError(err.message || 'Failed to change password.');
    } finally {
      setChangingPw(false);
    }
  };

  if (pendingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Logo" width="80" height="80" className="mb-4" />
            <h1 className="text-xl font-bold text-gray-900">Set your password</h1>
            <p className="text-sm text-gray-500 mt-1">You must set a new password before continuing.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red"
                  placeholder="At least 6 characters" required autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
                <input type="password" value={newPassword2} onChange={e => setNewPassword2(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red"
                  placeholder="Repeat new password" required />
              </div>
              {changePwError && <p className="text-xs text-red-600">{changePwError}</p>}
              <button type="submit" disabled={changingPw}
                className="w-full bg-tsg-red hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors">
                {changingPw ? 'Saving…' : 'Set password & continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Logo" width="120" height="120" className="mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Salary Calculator</h1>
          <p className="text-sm text-gray-500 mt-1">Internal Tool</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-base font-semibold text-gray-800 mb-6">Sign in to continue</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red focus:border-transparent"
                autoComplete="username" required autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red focus:border-transparent"
                autoComplete="current-password" required />
            </div>
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-tsg-red hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-[11px] text-gray-400 text-center mt-5">Internal use only — Tax Year 2026</p>
        </div>
      </div>
    </div>
  );
}
