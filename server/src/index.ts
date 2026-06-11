// env 로딩은 반드시 가장 먼저.
import './config/env';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupDatabase } from './config/database';
import { setupLabyrinthNamespace } from './socket/labyrinth';

// 전역 에러 안전망 — 소켓/타이머 콜백 에러로 프로세스가 죽지 않게.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

const app = express();
const httpServer = createServer(app);

const allowedOriginsEnv = process.env.ALLOWED_ORIGINS?.trim();
const corsOrigin: string | string[] = allowedOriginsEnv
  ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
  : '*';

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'labyrinth-online', message: 'Labyrinth server running' });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 라비린스 전용 네임스페이스 /labyrinth
setupLabyrinthNamespace(io);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await setupDatabase();
    httpServer.listen(PORT, () => {
      console.log(`🧩 Labyrinth Online server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
