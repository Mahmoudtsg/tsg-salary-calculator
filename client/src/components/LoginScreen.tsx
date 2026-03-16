import React, { useState } from 'react';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'tsg2026';

interface Props {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate a brief auth check
    setTimeout(() => {
      if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
        onLogin();
      } else {
        setError('Invalid username or password.');
      }
      setLoading(false);
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Branding */}
        <div className="flex flex-col items-center mb-8">
          <svg width="90" height="54" viewBox="0 0 200 120" className="mb-4">
            {/* Left red diamond */}
            <polygon points="0,60 50,10 100,60 50,110" fill="#D6001C" />
            {/* Right red arrow with V-notch */}
            <polygon points="70,12 185,12 200,60 185,108 70,108 94,60" fill="#D6001C" />
            {/* Black overlap triangle */}
            <polygon points="70,30 94,60 70,90" fill="#000000" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="text-tsg-red">TSG</span> Salary Calculator
          </h1>
          <p className="text-sm text-gray-500 mt-1">Technology Staffing Group — Internal Tool</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-base font-semibold text-gray-800 mb-6">Sign in to continue</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red focus:border-transparent"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tsg-red focus:border-transparent"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-tsg-red hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-[11px] text-gray-400 text-center mt-5">
            Internal use only &mdash; Tax Year 2026
          </p>
        </div>
      </div>
    </div>
  );
}
