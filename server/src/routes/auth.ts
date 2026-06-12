/*
 * 라비린스 인증 API — /api/lab/auth/*
 *   POST /signup  {loginId, password, nickname}       → {token, user}
 *   POST /login   {loginId, password}                 → {token, user}
 *   POST /social  {provider, token, nickname?}        → {token, user}   (소셜 로그인/가입)
 *   POST /link    {provider, token}        (인증필요)  → {user}          (소셜 연동→채팅 활성화)
 *   GET  /me                               (인증필요)  → {user}
 *
 * token 의미: google=id_token, apple=identity token, kakao=access token.
 */
import { Router } from 'express';
import {
  signup, login, socialLogin, linkSocial, getUser, AuthError, SocialProvider,
} from '../services/authService';
import { verifySocial } from '../services/socialVerify';
import { generateToken } from '../utils/jwt';
import { requireAuth, AuthedRequest } from '../utils/authMiddleware';

const router = Router();

function handleError(res: any, e: unknown) {
  if (e instanceof AuthError) {
    res.status(e.status).json({ error: e.code });
  } else {
    console.error('[auth] unexpected:', e);
    res.status(500).json({ error: 'INTERNAL' });
  }
}

const VALID_PROVIDERS: SocialProvider[] = ['kakao', 'google', 'apple'];
function parseProvider(p: unknown): SocialProvider {
  if (typeof p === 'string' && (VALID_PROVIDERS as string[]).includes(p)) return p as SocialProvider;
  throw new AuthError('UNKNOWN_PROVIDER');
}

router.post('/signup', async (req, res) => {
  try {
    const { loginId, password, nickname } = req.body ?? {};
    const user = await signup(loginId, password, nickname);
    res.json({ token: generateToken(user.id), user });
  } catch (e) { handleError(res, e); }
});

router.post('/login', async (req, res) => {
  try {
    const { loginId, password } = req.body ?? {};
    const user = await login(loginId, password);
    res.json({ token: generateToken(user.id), user });
  } catch (e) { handleError(res, e); }
});

router.post('/social', async (req, res) => {
  try {
    const provider = parseProvider(req.body?.provider);
    const identity = await verifySocial(provider, req.body?.token);
    const user = await socialLogin(
      provider, identity.providerUserId, identity.email,
      req.body?.nickname ?? identity.nickname
    );
    res.json({ token: generateToken(user.id), user });
  } catch (e) { handleError(res, e); }
});

router.post('/link', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const provider = parseProvider(req.body?.provider);
    const identity = await verifySocial(provider, req.body?.token);
    const user = await linkSocial(req.userId!, provider, identity.providerUserId, identity.email);
    res.json({ user });
  } catch (e) { handleError(res, e); }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const user = await getUser(req.userId!);
    if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    res.json({ user });
  } catch (e) { handleError(res, e); }
});

export default router;
