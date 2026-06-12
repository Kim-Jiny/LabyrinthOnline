/*
 * 소셜 토큰 검증 — 네이티브 SDK(앱)가 받은 토큰을 서버가 각 제공자에 검증한다.
 * 절대 클라이언트 말만 믿지 않는다(provider_user_id 는 검증된 값만 신뢰).
 *
 * 필요한 환경변수:
 *  - GOOGLE_CLIENT_IDS : 구글 클라이언트 ID(iOS/Android/Web) 콤마구분 (id_token aud 검증)
 *  - APPLE_BUNDLE_ID   : 애플 식별 토큰 aud(=앱 번들 ID, com.jiny.labyrinthonline)
 *  카카오는 access token 을 카카오 API 로 조회하므로 서버 키 불필요.
 */
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SocialProvider, AuthError } from './authService';

export interface SocialIdentity {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  nickname: string | null;
}

// --- Google: id_token 검증 ---
const googleClient = new OAuth2Client();
async function verifyGoogle(idToken: string): Promise<SocialIdentity> {
  const audience = (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (audience.length === 0) throw new AuthError('GOOGLE_NOT_CONFIGURED', 500);
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    const p = ticket.getPayload();
    if (!p?.sub) throw new AuthError('GOOGLE_VERIFY_FAILED', 401);
    return { provider: 'google', providerUserId: p.sub, email: p.email ?? null, nickname: p.name ?? null };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('GOOGLE_VERIFY_FAILED', 401);
  }
}

// --- Apple: identity token(JWT) 검증 ---
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
async function verifyApple(identityToken: string): Promise<SocialIdentity> {
  const audience = process.env.APPLE_BUNDLE_ID || 'com.jiny.labyrinthonline';
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience,
    });
    if (!payload.sub) throw new AuthError('APPLE_VERIFY_FAILED', 401);
    return {
      provider: 'apple',
      providerUserId: String(payload.sub),
      email: (payload.email as string) ?? null,
      nickname: null, // 애플은 토큰에 이름 없음(최초 동의 시 앱이 별도 전달)
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('APPLE_VERIFY_FAILED', 401);
  }
}

// --- Kakao: access token 으로 사용자 조회 ---
async function verifyKakao(accessToken: string): Promise<SocialIdentity> {
  try {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new AuthError('KAKAO_VERIFY_FAILED', 401);
    const data: any = await res.json();
    if (!data?.id) throw new AuthError('KAKAO_VERIFY_FAILED', 401);
    return {
      provider: 'kakao',
      providerUserId: String(data.id),
      email: data.kakao_account?.email ?? null,
      nickname: data.properties?.nickname ?? data.kakao_account?.profile?.nickname ?? null,
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('KAKAO_VERIFY_FAILED', 401);
  }
}

/**
 * provider + 토큰 → 검증된 소셜 신원.
 * token 의 의미: google=id_token, apple=identity token, kakao=access token.
 */
export async function verifySocial(provider: SocialProvider, token: string): Promise<SocialIdentity> {
  if (!token || typeof token !== 'string') throw new AuthError('MISSING_TOKEN');
  switch (provider) {
    case 'google': return verifyGoogle(token);
    case 'apple': return verifyApple(token);
    case 'kakao': return verifyKakao(token);
    default: throw new AuthError('UNKNOWN_PROVIDER');
  }
}
