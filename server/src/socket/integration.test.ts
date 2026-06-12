/*
 * [LAB] 소켓 통합 테스트 — 실제 Socket.IO 로 전체 흐름을 검증한다.
 *   실행: npx ts-node src/socket/integration.test.ts
 *
 * 시나리오:
 *  1) 두 클라이언트가 방 생성/입장 → 시작.
 *  2) 각자 자기 턴을 봇 휴리스틱으로 자동 플레이(인공 딜레이 없음 → 빠름) → 게임 종료.
 *  3) 채팅 게이트: 게스트(소셜 미연동)는 lab:chat → CHAT_NOT_ALLOWED.
 * DB 없이(메모리 모드) 동작.
 */
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { setupLabyrinthNamespace } from './labyrinth';
import { chooseInsertion, chooseMove } from '../games/labyrinth/bot';
import { makeRng } from '../games/labyrinth/board';
import type { LabyrinthSnapshot } from '../games/labyrinth/types';

let passed = 0, failed = 0;
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.error('  ✗', m); } };

function startServer(): Promise<{ http: HttpServer; port: number }> {
  return new Promise((resolve) => {
    const http = createServer();
    const io = new Server(http, { cors: { origin: '*' } });
    setupLabyrinthNamespace(io);
    http.listen(0, () => resolve({ http, port: (http.address() as any).port }));
  });
}

function connect(port: number): ClientSocket {
  return ioc(`http://localhost:${port}/labyrinth`, { transports: ['websocket'], forceNew: true });
}

// 한 클라이언트가 자기 턴을 봇 로직으로 자동 플레이하도록 묶는다.
function autoplay(sock: ClientSocket, seedTag: number) {
  const rng = makeRng(1234 + seedTag);
  let snap: LabyrinthSnapshot | null = null;
  let seat: number | null = null;       // 시작 시 한 번 결정(귀환 모드면 currentTarget이 null이 되므로 캐시)
  let lastKey = '';

  function onState(s: LabyrinthSnapshot) {
    snap = s;
    if (seat === null) {
      const me = s.players.find((p) => p.currentTarget !== null);
      if (me) seat = me.index;
    }
    act();
  }
  function act() {
    if (!snap || seat === null || snap.currentPlayer !== seat) return;
    const key = `${snap.turn}-${snap.phase}`;     // 같은 상태로 중복 act 방지
    if (key === lastKey) return;
    lastKey = key;
    const me = snap.players[seat];
    if (snap.phase === 'INSERT') {
      sock.emit('lab:insert', chooseInsertion(snap.board, snap.spare, me.pos,
        me.currentTarget ?? null, me.home, snap.forbiddenInsertionId, 'hard', rng));
    } else if (snap.phase === 'MOVE') {
      sock.emit('lab:move', { to: chooseMove(snap.board, me.pos, me.currentTarget ?? null, me.home, 'hard', rng) });
    }
  }
  // 상태를 담은 이벤트에서만 act (lab:turn 은 board 가 없어 stale 위험 → 사용 안 함)
  sock.on('lab:state', onState);
  sock.on('lab:inserted', (p: any) => onState(p.state));
  sock.on('lab:moved', (p: any) => onState(p.state));
}

async function main() {
  const { http, port } = await startServer();
  const a = connect(port);
  const b = connect(port);

  const done = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT (게임이 끝나지 않음)')), 30000);

    a.on('lab:created', (d: { code: string }) => b.emit('lab:join', { code: d.code }));
    b.on('lab:joined', () => a.emit('lab:start'));

    autoplay(a, 1);
    autoplay(b, 2);

    a.on('lab:gameover', (g) => { clearTimeout(timer); resolve(g); });
    a.on('lab:error', (e) => console.error('  a error:', e));
    b.on('lab:error', (e) => console.error('  b error:', e));
  });

  a.on('connect', () => a.emit('lab:create', { maxPlayers: 2 }));

  const gameover = await done;
  ok(gameover.winner === 0 || gameover.winner === 1, '게임 종료 + 승자 존재');
  ok(typeof gameover.turnCount === 'number' && gameover.turnCount > 0, '턴 수 기록됨');
  ok(Array.isArray(gameover.standings) && gameover.standings.length === 2, '순위 2명');

  // 채팅 게이트: 게스트는 거부
  const chatGate = await new Promise<string>((resolve) => {
    a.once('lab:error', (e: { code: string }) => resolve(e.code));
    a.emit('lab:chat', { text: 'hello' });
    setTimeout(() => resolve('NO_RESPONSE'), 2000);
  });
  ok(chatGate === 'CHAT_NOT_ALLOWED', `게스트 채팅 거부 (got ${chatGate})`);

  a.disconnect(); b.disconnect();
  http.close();

  console.log(`\n[LAB] integration.test — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
