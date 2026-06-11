/**
 * [LAB] 라비린스 온라인 — 매치/전적 영속화 서비스. lab_ 테이블 전용.
 *
 * 이 파일 전체가 라비린스 소유다. 듀오(dm_)/CTR(ctr_)/사자툰(sj_) 작업 중
 * 삭제·리팩터링 금지. 소유권: 리포 루트 CLAUDE.md 의 [LAB] 섹션.
 *
 * DB가 없을 때(getPool null)도 게임은 메모리상에서 정상 진행되어야 하므로,
 * 모든 함수는 풀이 없으면 조용히 no-op 한다.
 */
import { getPool } from '../config/database';

export interface LabPlayerSeed {
  seat: number;
  userId: number | null;
  nickname: string;
  isBot: boolean;
  home: string;
  treasuresTotal: number;
}

// 매치 시작 기록 → match_id 반환(없으면 null)
export async function createMatch(params: {
  roomCode: string;
  playerCount: number;
  seed: number;
  isRanked: boolean;
  players: LabPlayerSeed[];
}): Promise<number | null> {
  const pool = getPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO lab_matches (room_code, status, player_count, seed, is_ranked, started_at)
       VALUES ($1, 'playing', $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id`,
      [params.roomCode, params.playerCount, params.seed, params.isRanked]
    );
    const matchId = res.rows[0].id as number;

    for (const p of params.players) {
      await client.query(
        `INSERT INTO lab_match_players
           (match_id, seat, user_id, nickname, is_bot, home, treasures_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [matchId, p.seat, p.userId, p.nickname, p.isBot, p.home, p.treasuresTotal]
      );
    }
    await client.query('COMMIT');
    return matchId;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[LAB] createMatch failed:', err);
    return null;
  } finally {
    client.release();
  }
}

export interface LabResultSeat {
  seat: number;
  userId: number | null;
  isBot: boolean;
  collected: number;
  placement: number;          // 1 = 우승
  result: 'win' | 'loss' | 'draw' | 'abort';
}

// 매치 종료: 결과 기록 + 유저 전적 갱신
export async function finishMatch(params: {
  matchId: number | null;
  winnerUserId: number | null;
  turnCount: number;
  status: 'finished' | 'aborted';
  seats: LabResultSeat[];
}): Promise<void> {
  const pool = getPool();
  if (!pool || params.matchId === null) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE lab_matches
          SET status = $2, winner_user_id = $3, turn_count = $4,
              finished_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [params.matchId, params.status, params.winnerUserId, params.turnCount]
    );

    for (const s of params.seats) {
      await client.query(
        `UPDATE lab_match_players
            SET treasures_collected = $3, placement = $4, result = $5
          WHERE match_id = $1 AND seat = $2`,
        [params.matchId, s.seat, s.collected, s.placement, s.result]
      );

      // 봇/비로그인은 전적 미집계
      if (s.userId === null || s.isBot) continue;

      const win = s.result === 'win' ? 1 : 0;
      const loss = s.result === 'loss' ? 1 : 0;
      await client.query(
        `INSERT INTO lab_user_stats (user_id, games_played, wins, losses, treasures_collected, best_turns)
           VALUES ($1, 1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           games_played = lab_user_stats.games_played + 1,
           wins = lab_user_stats.wins + $2,
           losses = lab_user_stats.losses + $3,
           treasures_collected = lab_user_stats.treasures_collected + $4,
           best_turns = CASE
             WHEN $2 = 1 AND (lab_user_stats.best_turns IS NULL OR $5 < lab_user_stats.best_turns)
               THEN $5 ELSE lab_user_stats.best_turns END,
           updated_at = CURRENT_TIMESTAMP`,
        [s.userId, win, loss, s.collected, win === 1 ? params.turnCount : null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[LAB] finishMatch failed:', err);
  } finally {
    client.release();
  }
}

export interface LabUserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  treasuresCollected: number;
  bestTurns: number | null;
  elo: number;
}

export async function getUserStats(userId: number): Promise<LabUserStats | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT games_played, wins, losses, treasures_collected, best_turns, elo
       FROM lab_user_stats WHERE user_id = $1`,
    [userId]
  );
  if (res.rows.length === 0) {
    return { gamesPlayed: 0, wins: 0, losses: 0, treasuresCollected: 0, bestTurns: null, elo: 1200 };
  }
  const r = res.rows[0];
  return {
    gamesPlayed: r.games_played,
    wins: r.wins,
    losses: r.losses,
    treasuresCollected: r.treasures_collected,
    bestTurns: r.best_turns,
    elo: r.elo,
  };
}
