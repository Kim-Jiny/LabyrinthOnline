/*
 * 라비린스 인증 서비스 — 자체 계정(lab_users) + 소셜 연동(lab_social_links).
 *
 * 규칙(사용자 요구사항):
 *  - 아이디/비번으로 가입·로그인 가능 → 기본 계정(플레이 OK).
 *  - 소셜(카카오/구글/애플)을 1개 이상 연동해야 채팅 가능(chat_enabled = TRUE).
 *  - 소셜 로그인만으로도 가입/로그인 가능(이 경우 처음부터 chat_enabled).
 */
import bcrypt from 'bcrypt';
import { getPool } from '../config/database';

export type SocialProvider = 'kakao' | 'google' | 'apple';

export interface LabUser {
  id: number;
  loginId: string | null;
  nickname: string;
  chatEnabled: boolean;
  hasPassword: boolean;
  socials: SocialProvider[];
}

// 도메인 에러(라우트에서 HTTP 상태로 매핑)
export class AuthError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

function requirePool() {
  const pool = getPool();
  if (!pool) throw new AuthError('DB_UNAVAILABLE', 503);
  return pool;
}

// --- 검증 헬퍼 ---
function validateLoginId(loginId: string) {
  if (!/^[a-zA-Z0-9_]{4,30}$/.test(loginId)) throw new AuthError('INVALID_LOGIN_ID');
}
function validatePassword(password: string) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    throw new AuthError('INVALID_PASSWORD');
  }
}
function validateNickname(nickname: string) {
  const n = (nickname ?? '').trim();
  if (n.length < 1 || n.length > 20) throw new AuthError('INVALID_NICKNAME');
}

// --- 조회 ---
export async function getUser(id: number): Promise<LabUser | null> {
  const pool = requirePool();
  const res = await pool.query(
    `SELECT u.id, u.login_id, u.nickname, u.chat_enabled, (u.password_hash IS NOT NULL) AS has_password,
            COALESCE(ARRAY_AGG(s.provider) FILTER (WHERE s.provider IS NOT NULL), '{}') AS socials
       FROM lab_users u
       LEFT JOIN lab_social_links s ON s.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return rowToUser(res.rows[0]);
}

function rowToUser(r: any): LabUser {
  return {
    id: r.id,
    loginId: r.login_id ?? null,
    nickname: r.nickname,
    chatEnabled: r.chat_enabled,
    hasPassword: r.has_password,
    socials: (r.socials ?? []) as SocialProvider[],
  };
}

// --- 아이디/비번 가입 ---
export async function signup(loginId: string, password: string, nickname: string): Promise<LabUser> {
  validateLoginId(loginId);
  validatePassword(password);
  validateNickname(nickname);
  const pool = requirePool();

  const dup = await pool.query('SELECT 1 FROM lab_users WHERE login_id = $1', [loginId]);
  if (dup.rows.length > 0) throw new AuthError('LOGIN_ID_TAKEN', 409);

  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    `INSERT INTO lab_users (login_id, password_hash, nickname, chat_enabled)
     VALUES ($1, $2, $3, FALSE) RETURNING id`,
    [loginId, hash, nickname.trim()]
  );
  return (await getUser(res.rows[0].id))!;
}

// --- 아이디/비번 로그인 ---
export async function login(loginId: string, password: string): Promise<LabUser> {
  const pool = requirePool();
  const res = await pool.query(
    'SELECT id, password_hash FROM lab_users WHERE login_id = $1',
    [loginId]
  );
  if (res.rows.length === 0) throw new AuthError('INVALID_CREDENTIALS', 401);
  const { id, password_hash } = res.rows[0];
  if (!password_hash) throw new AuthError('NO_PASSWORD_SET', 401); // 소셜 전용 계정
  const ok = await bcrypt.compare(password, password_hash);
  if (!ok) throw new AuthError('INVALID_CREDENTIALS', 401);
  return (await getUser(id))!;
}

// --- 소셜 로그인(가입 겸용) ---
// 이미 연동된 소셜이면 그 유저로 로그인. 없으면 신규 유저 생성 + 연동(채팅 가능).
export async function socialLogin(
  provider: SocialProvider,
  providerUserId: string,
  email: string | null,
  nickname: string | null
): Promise<LabUser> {
  const pool = requirePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT user_id FROM lab_social_links WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId]
    );
    let userId: number;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].user_id;
    } else {
      const nick = (nickname?.trim() || `${provider}_${providerUserId.slice(-6)}`).slice(0, 20);
      const u = await client.query(
        `INSERT INTO lab_users (nickname, chat_enabled) VALUES ($1, TRUE) RETURNING id`,
        [nick]
      );
      userId = u.rows[0].id;
      await client.query(
        `INSERT INTO lab_social_links (user_id, provider, provider_user_id, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, provider, providerUserId, email]
      );
    }
    await client.query('COMMIT');
    return (await getUser(userId))!;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// --- 기존 계정에 소셜 연동(→ 채팅 활성화) ---
export async function linkSocial(
  userId: number,
  provider: SocialProvider,
  providerUserId: string,
  email: string | null
): Promise<LabUser> {
  const pool = requirePool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      'SELECT user_id FROM lab_social_links WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId]
    );
    if (owner.rows.length > 0 && owner.rows[0].user_id !== userId) {
      throw new AuthError('SOCIAL_ALREADY_LINKED', 409); // 다른 계정이 이미 사용 중
    }
    if (owner.rows.length === 0) {
      await client.query(
        `INSERT INTO lab_social_links (user_id, provider, provider_user_id, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, provider, providerUserId, email]
      );
    }
    // 소셜이 하나라도 있으면 채팅 허용
    await client.query('UPDATE lab_users SET chat_enabled = TRUE, updated_at = NOW() WHERE id = $1', [userId]);
    await client.query('COMMIT');
    return (await getUser(userId))!;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// 소켓/요청에서 빠르게 채팅 권한만 확인
export async function isChatEnabled(userId: number): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const res = await pool.query('SELECT chat_enabled FROM lab_users WHERE id = $1', [userId]);
  return res.rows.length > 0 ? !!res.rows[0].chat_enabled : false;
}
