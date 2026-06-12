import jwt from 'jsonwebtoken';

/*
 * 라비린스 자체 JWT 발급·검증.
 * 라비린스는 자체 계정(lab_users)을 가지므로 토큰을 직접 발급한다(duo와 무관).
 * JWT_SECRET 은 라비린스 전용 시크릿(운영 필수, 개발 폴백 제공).
 *
 * 토큰에는 userId 만 담는다. chat_enabled 같은 가변 상태는 매 요청/접속 시 DB 에서
 * 최신값을 조회한다(소셜 연동으로 도중에 바뀔 수 있으므로 토큰에 박지 않는다).
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('[jwt] JWT_SECRET not set - using development fallback (DO NOT USE IN PRODUCTION)');
  return 'dev-only-insecure-secret';
}

const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRES_IN = '30d';

export interface JwtPayload {
  userId: number;
  iat?: number;
  exp?: number;
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
