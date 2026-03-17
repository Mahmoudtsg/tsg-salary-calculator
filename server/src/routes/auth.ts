import { Router, Request, Response, NextFunction } from 'express';
import {
  getUserByUsername,
  getSessionUser,
  verifyPassword,
  createSession,
  deleteSession,
  changePassword,
  logActivity,
} from '../services/database';

const router = Router();

// POST /api/auth/login
router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const user = getUserByUsername(String(username).trim());
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const token = createSession(user.id);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    logActivity(user.id, user.full_name, 'LOGIN', undefined, ip);

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          is_admin: !!user.is_admin,
          must_change_password: !!user.must_change_password,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = getSessionUser(token);
    if (user) {
      logActivity(user.id, user.full_name, 'LOGOUT');
    }
    deleteSession(token);
  }
  return res.json({ success: true, data: null });
});

// POST /api/auth/change-password
router.post('/change-password', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  const token = authHeader.slice(7);
  const sessionUser = getSessionUser(token);
  if (!sessionUser) {
    return res.status(401).json({ success: false, error: 'Session expired. Please sign in again.' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Both current and new password are required.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
  }

  const fullUser = getUserByUsername(sessionUser.username);
  if (!fullUser || !verifyPassword(String(currentPassword), fullUser.password_hash)) {
    return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
  }

  changePassword(sessionUser.id, String(newPassword));
  logActivity(sessionUser.id, sessionUser.full_name, 'PASSWORD_CHANGED');
  return res.json({ success: true, data: null });
});

export default router;
