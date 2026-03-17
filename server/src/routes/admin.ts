import { Router, Response } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import {
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  getUserById,
  getActivityLog,
} from '../services/database';

const router = Router();
router.use(requireAdmin);

// GET /api/admin/users
router.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const { username, full_name, is_admin } = req.body;
    if (!username || !full_name) {
      return res.status(400).json({ success: false, error: 'Username and full name are required.' });
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const user = await createUser(String(username).trim(), tempPassword, String(full_name).trim(), !!is_admin);
    return res.json({ success: true, data: { user, tempPassword } });
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ success: false, error: 'Username already exists.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { full_name, is_admin } = req.body;
    const updated = await updateUser(id, {
      full_name: full_name !== undefined ? String(full_name).trim() : undefined,
      is_admin: is_admin !== undefined ? !!is_admin : undefined,
    });
    if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!(await getUserById(id))) return res.status(404).json({ success: false, error: 'User not found.' });
    const tempPassword = await resetUserPassword(id);
    return res.json({ success: true, data: { tempPassword } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (req.user?.id === id) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
    }
    if (!(await getUserById(id))) return res.status(404).json({ success: false, error: 'User not found.' });
    await deleteUser(id);
    return res.json({ success: true, data: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/logs
router.get('/logs', async (_req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getActivityLog(500) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
