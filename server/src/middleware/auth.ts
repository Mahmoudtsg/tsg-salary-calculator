// ============================================================
// Microsoft Entra ID — JWT validation middleware
// Validates every API request with a Bearer token from MSAL
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;

if (!tenantId || !clientId) {
  console.warn(
    '[Auth] AZURE_TENANT_ID or AZURE_CLIENT_ID not set — ' +
    'all API requests will be rejected with 401.'
  );
}

// JWKS client: fetches and caches Microsoft's public signing keys
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 60 * 1000, // 10 hours
  rateLimit: true,
});

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid!, (err, key) => {
    if (err) return callback(err);
    callback(null, key!.getPublicKey());
  });
}

// Attach decoded token payload to req so route handlers can read it
declare global {
  namespace Express {
    interface Request {
      user?: jwt.JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!tenantId || !clientId) {
    return res.status(401).json({ success: false, error: 'Authentication not configured on server.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.slice(7);

  jwt.verify(
    token,
    getSigningKey,
    {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    },
    (err, decoded) => {
      if (err) {
        const msg = err.name === 'TokenExpiredError'
          ? 'Token expired. Please sign in again.'
          : 'Invalid token.';
        return res.status(401).json({ success: false, error: msg });
      }
      req.user = decoded as jwt.JwtPayload;
      next();
    }
  );
}
