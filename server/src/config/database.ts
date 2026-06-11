import { Pool } from 'pg';

/*
 * 라비린스 독립 서버의 DB 접근.
 *
 * ⚠️ 듀오(Minigame)와 "같은 PostgreSQL"을 공유한다(DATABASE_URL 동일). 단, 이 서버는
 *    오직 lab_ 테이블만 읽고 쓴다. dm_/ctr_/sj_ 등 남의 테이블은 읽지도 쓰지도 않는다.
 *    유저 식별은 JWT 토큰의 userId 만 신뢰하고, 닉네임은 클라이언트가 보낸 값을 쓴다.
 *
 * DB 미설정 시(getPool null)에도 게임은 메모리상에서 동작하도록 모든 호출부가 방어한다.
 */
let pool: Pool | null = null;

export function getPool(): Pool | null {
  return pool;
}

export async function setupDatabase(): Promise<void> {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('⚠️  DATABASE_URL not set, running without database (메모리 모드)');
    return;
  }
  // 개발 환경에서는 컨테이너 호스트명(duo-db)을 localhost 로 치환
  if (process.env.NODE_ENV === 'development') {
    databaseUrl = databaseUrl.replace('duo-db', 'localhost');
  }

  pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    console.log('✅ Connected to PostgreSQL (shared with 듀오, lab_ 전용 쓰기)');

    // === lab_ 테이블만 생성 (남의 스키마 미수정) ===
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_matches (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(12) UNIQUE NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'playing',
        player_count SMALLINT NOT NULL,
        seed BIGINT NOT NULL,
        is_ranked BOOLEAN DEFAULT FALSE,
        winner_user_id INTEGER,
        turn_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lab_matches_status ON lab_matches(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS lab_match_players (
        id SERIAL PRIMARY KEY,
        match_id INTEGER NOT NULL REFERENCES lab_matches(id) ON DELETE CASCADE,
        seat SMALLINT NOT NULL,
        user_id INTEGER,
        nickname VARCHAR(50) NOT NULL,
        is_bot BOOLEAN DEFAULT FALSE,
        home VARCHAR(2) NOT NULL,
        treasures_total SMALLINT NOT NULL,
        treasures_collected SMALLINT DEFAULT 0,
        placement SMALLINT,
        result VARCHAR(8),
        UNIQUE(match_id, seat)
      );
      CREATE INDEX IF NOT EXISTS idx_lab_match_players_user ON lab_match_players(user_id, match_id);

      CREATE TABLE IF NOT EXISTS lab_user_stats (
        user_id INTEGER PRIMARY KEY,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        treasures_collected INTEGER DEFAULT 0,
        best_turns INTEGER,
        elo INTEGER DEFAULT 1200,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ lab_ 테이블 준비 완료');
  } finally {
    client.release();
  }
}
