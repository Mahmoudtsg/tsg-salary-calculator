// ============================================================
// Microsoft Entra ID (Azure AD) — MSAL Configuration
// SPA / PKCE flow — no client secret required
// ============================================================

import { Configuration } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string;

if (!tenantId || !clientId) {
  console.error(
    '[Auth] VITE_AZURE_TENANT_ID or VITE_AZURE_CLIENT_ID is not set. ' +
    'Create client/.env with those values.'
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,          // https://calculator.tsgcorp.com
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',  // sessionStorage: cleared when tab closes
    storeAuthStateInCookie: false,
  },
};

/** Scopes used for login and silent token acquisition */
export const loginScopes = ['openid', 'profile', 'email'];
