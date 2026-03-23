// ============================================================
// AuthGuard — blocks the app until the user is signed in
// via Microsoft Entra ID (Azure AD)
// ============================================================

import React from 'react';
import {
  useIsAuthenticated,
  useMsal,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginScopes } from '../authConfig';

function SignInScreen() {
  const { instance, inProgress } = useMsal();
  const [error, setError] = React.useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    try {
      await instance.loginRedirect({ scopes: loginScopes });
    } catch (e: any) {
      setError(e.message || 'Sign-in failed. Please try again.');
    }
  };

  const isLoading = inProgress !== InteractionStatus.None;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 max-w-sm w-full text-center">
        {/* TSG branding */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-tsg-red/10 mb-4">
            <svg className="w-8 h-8 text-tsg-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">TSG Salary Calculator</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in with your TSG Microsoft account to continue</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 text-left">
            {error}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Signing in…
            </span>
          ) : (
            <>
              {/* Microsoft logo */}
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </>
          )}
        </button>

        <p className="text-[11px] text-gray-400 mt-5">
          Access is restricted to authorised TSG accounts.<br />
          Contact IT if you cannot sign in.
        </p>
      </div>
    </div>
  );
}

interface Props { children: React.ReactNode; }

export default function AuthGuard({ children }: Props) {
  const { inProgress } = useMsal();

  // MSAL is initialising — show a blank screen rather than a flash of the sign-in page
  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-tsg-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate><SignInScreen /></UnauthenticatedTemplate>
    </>
  );
}
