import { Request, Response, NextFunction } from 'express';
import { User } from '../services/database';

export interface AuthRequest extends Request {
  user?: User;
  sessionToken?: string;
}

// Auth is disabled — all routes are open access
const DEFAULT_USER: User = {
  id: 1,
  username: 'admin',
  full_name: 'Administrator',
  is_admin: 1,
  must_change_password: 0,
  created_at: new Date().toISOString(),
};

export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  req.user = DEFAULT_USER;
  req.sessionToken = 'no-auth';
  next();
}

export async function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  req.user = DEFAULT_USER;
  req.sessionToken = 'no-auth';
  next();
}
