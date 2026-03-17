import { Router, Request, Response } from 'express';
import {
  getUserByUsername,
  getSessionUser,
  verifyPassword,
  createSession,
  deleteSession,
  changePassword,
  logActivity,
} from '../services/database';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const user = await getUserByUsername(String(username).trim());
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
    const token = await createSession(user.id);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    await logActivity(user.id, user.full_name, 'LOGIN', undefined, ip);
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
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = await getSessionUser(token);
    if (user) await logActivity(user.id, user.full_name, 'LOGOUT');
    await deleteSession(token);
  }
  return res.json({ success: true, data: null });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both current and new password are required.' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
    }
    const fullUser = await getUserByUsername(req.user!.username);
    if (!fullUser || !verifyPassword(String(currentPassword), fullUser.password_hash)) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }
    await changePassword(req.user!.id, String(newPassword));
    await logActivity(req.user!.id, req.user!.full_name, 'PASSWORD_CHANGED');
    return res.json({ success: true, data: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
