/*
 * 라비린스 전적 API — /api/lab/stats/*
 *   GET /me                 (인증) → 내 전적
 *   GET /leaderboard?limit= (공개) → 승수 상위 랭킹
 */
import { Router } from 'express';
import { getUserStats, getLeaderboard } from '../services/labService';
import { requireAuth, AuthedRequest } from '../utils/authMiddleware';

const router = Router();

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const stats = await getUserStats(req.userId!);
    res.json({ stats });
  } catch (e) {
    console.error('[stats] me:', e);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const leaderboard = await getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (e) {
    console.error('[stats] leaderboard:', e);
    res.status(500).json({ error: 'INTERNAL' });
  }
});

export default router;
