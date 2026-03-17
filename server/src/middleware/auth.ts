import { Request, Response, NextFunction } from 'express';
import { getSessionUser, User } from '../services/database';

export interface AuthRequest extends Request {
  user?: User;
  sessionToken?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const user = await getSessionUser(token);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (!req.user?.is_admin) {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    next();
  });
}
