import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';

// Authorization: Bearer <jwt> 를 검증해 req.userId 를 채운다. 없으면 401.
export interface AuthedRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  req.userId = payload.userId;
  next();
}
