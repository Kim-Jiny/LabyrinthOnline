import jwt from 'jsonwebtoken';

/*
 * JWT 검증 — 듀오(Minigame) 서버가 발급한 토큰을 그대로 검증한다.
 * 따라서 JWT_SECRET 은 반드시 듀오와 "동일한 값"을 환경변수로 주입해야 한다.
 * 라비린스는 토큰을 발급하지 않고 검증만 한다(로그인 자체는 듀오에서).
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

export interface JwtPayload {
  userId: number;
  iat?: number;
  exp?: number;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
