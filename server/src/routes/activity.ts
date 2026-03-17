import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logActivity } from '../services/database';

const router = Router();

// POST /api/activity/log
router.post('/log', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { action, detail } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, error: 'Action is required.' });
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    await logActivity(req.user!.id, req.user!.full_name, String(action), detail ? String(detail) : undefined, ip);
    return res.json({ success: true, data: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
