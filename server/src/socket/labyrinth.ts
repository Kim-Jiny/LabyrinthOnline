/**
 * 라비린스 온라인 — 전용 Socket.IO 네임스페이스 `/labyrinth` 핸들러.
 *
 * 라비린스 독립 서버. DB(공유 Postgres의 lab_ 테이블)와 JWT_SECRET 만 듀오와 공유하고
 * 코드/배포는 완전 독립이다. 남의 테이블(dm_/ctr_/sj_)은 읽지도 쓰지도 않는다.
 *
 * 인증: handshake.auth.token 의 JWT 를 검증해 userId 만 신뢰(전적 귀속). 닉네임은
 *       클라이언트가 보낸 값을 표시용으로 쓴다. 토큰 없으면 게스트(봇 연습 가능).
 *
 * 게임 룰은 서버 권위(engine.ts). 한 턴 = 삽입(INSERT) → 이동(MOVE) 2단계.
 * 봇 좌석은 서버가 자동 진행.
 */
import { Server, Socket, Namespace } from 'socket.io';
import { LabyrinthGame } from '../games/labyrinth/engine';
import { chooseInsertion, chooseMove, BotDifficulty } from '../games/labyrinth/bot';
import { makeRng } from '../games/labyrinth/board';
import { Rotation } from '../games/labyrinth/types';
import { verifyToken } from '../utils/jwt';
import * as labService from '../services/labService';

const TURN_TIME_MS = 60000;      // 한 턴(삽입+이동) 제한
const BOT_INSERT_DELAY = 900;    // 봇 연출 딜레이
const BOT_MOVE_DELAY = 900;
const MAX_PLAYERS = 4;

interface LabSeat {
  seat: number;
  socket: Socket | null;   // 봇이면 null
  userId: number | null;
  nickname: string;
  isBot: boolean;
  difficulty: BotDifficulty;
  connected: boolean;
}

interface LabRoom {
  code: string;
  hostUserKey: string;     // 방장 식별(소켓 id 또는 userId 기반)
  seats: LabSeat[];
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  game: LabyrinthGame | null;
  seed: number;
  matchId: number | null;
  turnTimer: NodeJS.Timeout | null;
  turnDeadline: number | null;
  botRng: () => number;
  botTimers: NodeJS.Timeout[];
}

const rooms = new Map<string, LabRoom>();
// 빠른대전 대기열(2인)
const quickQueue: Array<{ socket: Socket; userId: number | null; nickname: string }> = [];

function genRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (rooms.has(code));
  return code;
}

// 핸들러는 `return socket.emit(...)`(boolean) 처럼 임의 값을 반환할 수 있어 unknown 허용.
function safe(label: string, fn: () => unknown | Promise<unknown>) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).catch((e) => console.error(`[LAB:${label}]`, e));
    }
  } catch (e) {
    console.error(`[LAB:${label}]`, e);
  }
}

// === 방 직렬화(로비/대기실용) ===
function roomInfo(room: LabRoom) {
  return {
    code: room.code,
    status: room.status,
    maxPlayers: room.maxPlayers,
    seats: room.seats.map((s) => ({
      seat: s.seat,
      nickname: s.nickname,
      isBot: s.isBot,
      connected: s.connected,
      userId: s.userId,
    })),
  };
}

function emitRoom(nsp: Namespace, room: LabRoom) {
  for (const s of room.seats) {
    if (s.socket) s.socket.emit('lab:room', roomInfo(room));
  }
}

// 각 인간 좌석에 본인 시점 상태 전송(보물 카드 비공개 보장)
function broadcastState(room: LabRoom) {
  if (!room.game) return;
  for (const s of room.seats) {
    if (s.socket) {
      s.socket.emit('lab:state', room.game.snapshot(s.seat));
    }
  }
}

function emitTurn(room: LabRoom) {
  if (!room.game) return;
  const payload = {
    currentPlayer: room.game.getCurrentPlayer(),
    phase: room.game.getPhase(),
    deadline: room.turnDeadline,
  };
  for (const s of room.seats) {
    if (s.socket) s.socket.emit('lab:turn', payload);
  }
}

function clearTimers(room: LabRoom) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  for (const t of room.botTimers) clearTimeout(t);
  room.botTimers = [];
  room.turnDeadline = null;
}

function startTurn(nsp: Namespace, room: LabRoom) {
  if (!room.game || room.game.isGameOver()) return;
  clearTimers(room);
  room.turnDeadline = Date.now() + TURN_TIME_MS;
  emitTurn(room);
  broadcastState(room);

  const seat = room.game.getCurrentPlayer();
  const seatObj = room.seats[seat];

  // 턴 타임아웃 → 강제 스킵
  room.turnTimer = setTimeout(() => {
    safe('turnTimeout', () => {
      if (!room.game || room.game.isGameOver()) return;
      room.game.forceSkip();
      if (room.game.isGameOver()) {
        finishGame(nsp, room);
      } else {
        startTurn(nsp, room);
      }
    });
  }, TURN_TIME_MS);

  // 봇 차례면 자동 진행
  if (seatObj && seatObj.isBot) {
    scheduleBotTurn(nsp, room, seat);
  }
}

function scheduleBotTurn(nsp: Namespace, room: LabRoom, seat: number) {
  const t1 = setTimeout(() => {
    safe('botInsert', () => {
      if (!room.game || room.game.isGameOver()) return;
      if (room.game.getCurrentPlayer() !== seat || room.game.getPhase() !== 'INSERT') return;
      const snap = room.game.snapshot(seat);
      const seatObj = room.seats[seat];
      const target = room.game.currentTargetOf(seat);
      const home = snap.players[seat].home;
      const choice = chooseInsertion(
        snap.board, snap.spare, snap.players[seat].pos, target, home,
        snap.forbiddenInsertionId, seatObj.difficulty, room.botRng
      );
      const res = room.game.insert(seat, choice);
      if (res.ok) {
        broadcastInserted(room, seat, choice.insertionId, choice.rotation);
      }

      // 이동
      const t2 = setTimeout(() => {
        safe('botMove', () => {
          if (!room.game || room.game.isGameOver()) return;
          if (room.game.getCurrentPlayer() !== seat || room.game.getPhase() !== 'MOVE') return;
          const snap2 = room.game.snapshot(seat);
          const target2 = room.game.currentTargetOf(seat);
          const to = chooseMove(
            snap2.board, snap2.players[seat].pos, target2,
            snap2.players[seat].home, seatObj.difficulty, room.botRng
          );
          const mv = room.game.move(seat, to);
          if (mv.ok) {
            broadcastMoved(room, seat, to, mv.collected ?? null);
            if (mv.gameOver) {
              finishGame(nsp, room);
            } else {
              startTurn(nsp, room);
            }
          }
        });
      }, BOT_MOVE_DELAY);
      room.botTimers.push(t2);
    });
  }, BOT_INSERT_DELAY);
  room.botTimers.push(t1);
}

function broadcastInserted(room: LabRoom, seat: number, insertionId: number, rotation: Rotation) {
  for (const s of room.seats) {
    if (s.socket && room.game) {
      s.socket.emit('lab:inserted', {
        seat, insertionId, rotation,
        state: room.game.snapshot(s.seat),
      });
    }
  }
}

function broadcastMoved(room: LabRoom, seat: number, to: number, collected: number | null) {
  for (const s of room.seats) {
    if (s.socket && room.game) {
      // 수집한 보물 ID는 해당 좌석 본인에게만 공개(타인은 boolean만)
      s.socket.emit('lab:moved', {
        seat, to,
        collected: s.seat === seat ? collected : collected !== null,
        state: room.game.snapshot(s.seat),
      });
    }
  }
}

async function finishGame(nsp: Namespace, room: LabRoom) {
  if (!room.game) return;
  clearTimers(room);
  room.status = 'finished';
  const winner = room.game.getWinner();
  const turnCount = room.game.snapshot(null).turn;

  // 순위/결과 계산: 우승자 1위, 나머지는 수집 보물 수 내림차순
  const standings = room.seats.map((s) => {
    const ps = room.game!.getPlayerState(s.seat);
    return { seat: s.seat, userId: s.userId, isBot: s.isBot, collected: ps?.collected ?? 0 };
  });
  standings.sort((a, b) => {
    if (a.seat === winner) return -1;
    if (b.seat === winner) return 1;
    return b.collected - a.collected;
  });
  const seatResults = standings.map((s, i) => ({
    seat: s.seat,
    userId: s.userId,
    isBot: s.isBot,
    collected: s.collected,
    placement: i + 1,
    result: (s.seat === winner ? 'win' : 'loss') as 'win' | 'loss',
  }));

  const winnerUserId = winner !== null ? room.seats[winner]?.userId ?? null : null;

  await labService.finishMatch({
    matchId: room.matchId,
    winnerUserId,
    turnCount,
    status: 'finished',
    seats: seatResults,
  });

  for (const s of room.seats) {
    if (s.socket) {
      s.socket.emit('lab:gameover', {
        winner,
        winnerNickname: winner !== null ? room.seats[winner]?.nickname : null,
        standings: seatResults.map((r) => ({
          seat: r.seat, placement: r.placement,
          nickname: room.seats[r.seat]?.nickname, collected: r.collected,
        })),
        turnCount,
      });
    }
  }
}

// === 게임 시작 ===
async function startGame(nsp: Namespace, room: LabRoom) {
  const active = room.seats.filter((s) => s.isBot || s.connected);
  if (active.length < 2) {
    return { ok: false, error: 'NEED_2_PLAYERS' };
  }
  // 좌석 재인덱싱(0..n-1)
  room.seats = active.map((s, i) => ({ ...s, seat: i }));
  room.seed = Math.floor(Math.random() * 0x7fffffff);
  room.botRng = makeRng(room.seed ^ 0x5151);

  room.game = new LabyrinthGame({
    seed: room.seed,
    players: room.seats.map((s) => ({
      userId: s.userId,
      nickname: s.nickname,
      isBot: s.isBot,
    })),
  });
  room.status = 'playing';

  // DB 매치 기록
  const snap = room.game.snapshot(null);
  room.matchId = await labService.createMatch({
    roomCode: room.code,
    playerCount: room.seats.length,
    seed: room.seed,
    isRanked: false,
    players: room.seats.map((s) => ({
      seat: s.seat,
      userId: s.userId,
      nickname: s.nickname,
      isBot: s.isBot,
      home: snap.players[s.seat].home,
      treasuresTotal: snap.players[s.seat].totalCards,
    })),
  });

  for (const s of room.seats) {
    if (s.socket) s.socket.emit('lab:started', { code: room.code });
  }
  startTurn(nsp, room);
  return { ok: true };
}

// === 좌석/연결 유틸 ===
function findSeatBySocket(room: LabRoom, socket: Socket): LabSeat | undefined {
  return room.seats.find((s) => s.socket?.id === socket.id);
}

function removeFromQuickQueue(socket: Socket) {
  const i = quickQueue.findIndex((q) => q.socket.id === socket.id);
  if (i >= 0) quickQueue.splice(i, 1);
}

export function setupLabyrinthNamespace(io: Server) {
  const nsp = io.of('/labyrinth');

  // 핸드셰이크 인증. 토큰이 유효하면 그 안의 userId 만 신뢰(전적 귀속용).
  // 닉네임은 클라이언트가 보낸 값을 표시용으로 쓴다 — 다른 서비스(dm_users)를 읽지 않는다.
  nsp.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const payload = token ? verifyToken(token) : null;
    (socket.data as any).userId = payload?.userId ?? null;
    const nick = (socket.handshake.auth?.nickname as string | undefined)?.trim();
    (socket.data as any).nickname = nick && nick.length > 0 ? nick : 'Guest';
    next();
  });

  nsp.on('connection', (socket: Socket) => {
    const userId = (): number | null => (socket.data as any).userId ?? null;
    const nickname = (): string => (socket.data as any).nickname ?? 'Guest';

    // 방 만들기
    socket.on('lab:create', (data: { maxPlayers?: number } = {}) => safe('create', () => {
      const maxPlayers = Math.min(MAX_PLAYERS, Math.max(2, data.maxPlayers ?? 4));
      const code = genRoomCode();
      const room: LabRoom = {
        code,
        hostUserKey: socket.id,
        seats: [{
          seat: 0, socket, userId: userId(), nickname: nickname(),
          isBot: false, difficulty: 'normal', connected: true,
        }],
        maxPlayers,
        status: 'waiting',
        game: null,
        seed: 0,
        matchId: null,
        turnTimer: null,
        turnDeadline: null,
        botRng: makeRng(1),
        botTimers: [],
      };
      rooms.set(code, room);
      socket.join(`lab:${code}`);
      (socket.data as any).roomCode = code;
      socket.emit('lab:created', { code });
      emitRoom(nsp, room);
    }));

    // 방 입장
    socket.on('lab:join', (data: { code: string }) => safe('join', () => {
      const room = rooms.get((data.code || '').toUpperCase());
      if (!room) return socket.emit('lab:error', { code: 'ROOM_NOT_FOUND' });
      if (room.status !== 'waiting') return socket.emit('lab:error', { code: 'ALREADY_STARTED' });
      if (room.seats.length >= room.maxPlayers) return socket.emit('lab:error', { code: 'ROOM_FULL' });

      room.seats.push({
        seat: room.seats.length, socket, userId: userId(), nickname: nickname(),
        isBot: false, difficulty: 'normal', connected: true,
      });
      socket.join(`lab:${room.code}`);
      (socket.data as any).roomCode = room.code;
      socket.emit('lab:joined', { code: room.code });
      emitRoom(nsp, room);
    }));

    // 봇 추가(방장만)
    socket.on('lab:addBot', (data: { difficulty?: BotDifficulty } = {}) => safe('addBot', () => {
      const room = rooms.get((socket.data as any).roomCode);
      if (!room || room.status !== 'waiting') return;
      if (room.hostUserKey !== socket.id) return socket.emit('lab:error', { code: 'NOT_HOST' });
      if (room.seats.length >= room.maxPlayers) return socket.emit('lab:error', { code: 'ROOM_FULL' });
      const botNames = ['미노', '테세', '아리', '다이달'];
      room.seats.push({
        seat: room.seats.length, socket: null, userId: null,
        nickname: `🤖${botNames[room.seats.length % botNames.length]}`,
        isBot: true, difficulty: data.difficulty ?? 'normal', connected: true,
      });
      emitRoom(nsp, room);
    }));

    // 게임 시작(방장만)
    socket.on('lab:start', () => safe('start', async () => {
      const room = rooms.get((socket.data as any).roomCode);
      if (!room || room.status !== 'waiting') return;
      if (room.hostUserKey !== socket.id) return socket.emit('lab:error', { code: 'NOT_HOST' });
      const res = await startGame(nsp, room);
      if (!res.ok) socket.emit('lab:error', { code: res.error });
    }));

    // 빠른대전(2인): 큐에 넣고 2명 모이면 자동 시작
    socket.on('lab:quickmatch', () => safe('quickmatch', async () => {
      removeFromQuickQueue(socket);
      quickQueue.push({ socket, userId: userId(), nickname: nickname() });
      socket.emit('lab:queued', {});
      if (quickQueue.length >= 2) {
        const a = quickQueue.shift()!;
        const b = quickQueue.shift()!;
        const code = genRoomCode();
        const room: LabRoom = {
          code, hostUserKey: a.socket.id,
          seats: [
            { seat: 0, socket: a.socket, userId: a.userId, nickname: a.nickname, isBot: false, difficulty: 'normal', connected: true },
            { seat: 1, socket: b.socket, userId: b.userId, nickname: b.nickname, isBot: false, difficulty: 'normal', connected: true },
          ],
          maxPlayers: 2, status: 'waiting', game: null, seed: 0, matchId: null,
          turnTimer: null, turnDeadline: null, botRng: makeRng(1), botTimers: [],
        };
        rooms.set(code, room);
        a.socket.join(`lab:${code}`); b.socket.join(`lab:${code}`);
        (a.socket.data as any).roomCode = code;
        (b.socket.data as any).roomCode = code;
        await startGame(nsp, room);
      }
    }));

    socket.on('lab:cancelQuick', () => safe('cancelQuick', () => {
      removeFromQuickQueue(socket);
      socket.emit('lab:queueCancelled', {});
    }));

    // 타일 삽입
    socket.on('lab:insert', (data: { insertionId: number; rotation: Rotation }) => safe('insert', () => {
      const room = rooms.get((socket.data as any).roomCode);
      if (!room || !room.game) return;
      const seat = findSeatBySocket(room, socket);
      if (!seat) return;
      const res = room.game.insert(seat.seat, {
        insertionId: data.insertionId,
        rotation: data.rotation,
      });
      if (!res.ok) return socket.emit('lab:error', { code: res.error });
      broadcastInserted(room, seat.seat, data.insertionId, data.rotation);
      emitTurn(room);
    }));

    // 말 이동
    socket.on('lab:move', (data: { to: number }) => safe('move', () => {
      const room = rooms.get((socket.data as any).roomCode);
      if (!room || !room.game) return;
      const seat = findSeatBySocket(room, socket);
      if (!seat) return;
      const res = room.game.move(seat.seat, data.to);
      if (!res.ok) return socket.emit('lab:error', { code: res.error });
      broadcastMoved(room, seat.seat, data.to, res.collected ?? null);
      if (res.gameOver) {
        finishGame(nsp, room);
      } else {
        startTurn(nsp, room);
      }
    }));

    // 재연결: 같은 유저가 진행 중 방으로 복귀
    socket.on('lab:reconnect', (data: { code: string }) => safe('reconnect', () => {
      const room = rooms.get((data.code || '').toUpperCase());
      if (!room || !room.game) return socket.emit('lab:error', { code: 'ROOM_NOT_FOUND' });
      const uid = userId();
      const seat = room.seats.find((s) => !s.isBot && s.userId !== null && s.userId === uid);
      if (!seat) return socket.emit('lab:error', { code: 'SEAT_NOT_FOUND' });
      seat.socket = socket;
      seat.connected = true;
      room.game.setConnected(seat.seat, true);
      socket.join(`lab:${room.code}`);
      (socket.data as any).roomCode = room.code;
      socket.emit('lab:state', room.game.snapshot(seat.seat));
      emitTurn(room);
    }));

    socket.on('lab:leave', () => safe('leave', () => handleLeave(nsp, socket)));

    socket.on('disconnect', () => safe('disconnect', () => {
      removeFromQuickQueue(socket);
      handleLeave(nsp, socket);
    }));
  });

  console.log('🧩 [LAB] Labyrinth namespace /labyrinth ready');
}

function handleLeave(nsp: Namespace, socket: Socket) {
  const code = (socket.data as any).roomCode as string | undefined;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const seat = findSeatBySocket(room, socket);
  if (!seat) return;

  if (room.status === 'waiting') {
    // 대기실: 좌석 제거
    room.seats = room.seats.filter((s) => s.socket?.id !== socket.id);
    room.seats.forEach((s, i) => (s.seat = i));
    if (room.seats.filter((s) => !s.isBot).length === 0) {
      rooms.delete(code); // 사람이 모두 나가면 방 폐기
    } else {
      // 방장이 나갔으면 다음 사람에게 위임
      if (room.hostUserKey === socket.id && room.seats[0]?.socket) {
        room.hostUserKey = room.seats[0].socket.id;
      }
      emitRoom(nsp, room);
    }
  } else if (room.status === 'playing') {
    // 진행 중: 연결만 끊김 표시(좌석 유지 → 재연결 가능). 봇이 대신 두지는 않고
    // 턴 타임아웃에 맡긴다.
    seat.socket = null;
    seat.connected = false;
    if (room.game) room.game.setConnected(seat.seat, false);
    // 남은 인간 접속자가 0이면 방 정리
    if (room.seats.filter((s) => !s.isBot && s.connected).length === 0) {
      clearTimers(room);
      rooms.delete(code);
    }
  }
}
