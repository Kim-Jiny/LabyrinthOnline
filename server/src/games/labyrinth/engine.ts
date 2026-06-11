/**
 * 라비린스 — 게임 상태머신 (서버 권위)
 *
 * 한 턴 = 2단계:
 *   1) INSERT: 여분 타일을 12개 삽입 지점 중 하나로 밀어넣는다(회전 선택 가능).
 *              직전 삽입을 그대로 되돌리는 수는 금지.
 *   2) MOVE:   통로로 연결된 칸으로 말을 이동(제자리 허용). 현재 목표 보물 칸에
 *              도달하면 수집하고 다음 보물로 진행.
 *   모든 보물 수집 후 자기 홈 코너에 도달하면 승리.
 *
 * 이 클래스는 입력 검증과 상태 전이만 담당한다. 네트워크/타이머/DB는 외부(socket)에서.
 */

import {
  Tile,
  Rotation,
  Phase,
  Corner,
  CORNER_INDEX,
  PlayerState,
  PublicPlayer,
  LabyrinthSnapshot,
  findInsertion,
  oppositeInsertionId,
} from './types';
import {
  generateBoard,
  applyInsertion,
  reachable,
  makeRng,
  RNG,
} from './board';

export interface CreateOptions {
  // 좌석별 플레이어 정의(2~4명). 순서대로 턴 진행.
  players: Array<{ userId: number | null; nickname: string; isBot: boolean }>;
  // 각자 모을 보물 카드 수(기본: 인원수에 따라 자동). 24개를 균등 분배.
  cardsPerPlayer?: number;
  seed: number; // 재현용 시드(셔플/카드분배)
}

const HOME_ORDER: Corner[] = ['TL', 'TR', 'BR', 'BL'];

export interface InsertAction {
  insertionId: number;
  rotation: Rotation; // 밀어넣을 spare의 회전
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  collected?: number;        // 이번 이동으로 새로 수집한 보물 ID(없으면 undefined)
  gameOver?: boolean;
  winner?: number | null;
}

export class LabyrinthGame {
  private board: Tile[];
  private spare: Tile;
  private players: PlayerState[];
  private phase: Phase;
  private current: number;
  private lastInsertionId: number | null = null;
  private winner: number | null = null;
  private turnCount = 0;
  private rng: RNG;

  constructor(opts: CreateOptions) {
    if (opts.players.length < 2 || opts.players.length > 4) {
      throw new Error('Labyrinth requires 2~4 players');
    }
    this.rng = makeRng(opts.seed);

    const gen = generateBoard(this.rng);
    this.board = gen.board;
    this.spare = gen.spare;

    // 보물 카드 분배: 24개 셔플 후 인원수로 균등 분배
    const deck = this.shuffledTreasures();
    const n = opts.players.length;
    const per =
      opts.cardsPerPlayer ?? Math.floor(deck.length / n); // 2인=12, 3인=8, 4인=6
    const hands: number[][] = [];
    for (let i = 0; i < n; i++) {
      hands.push(deck.slice(i * per, i * per + per));
    }

    this.players = opts.players.map((p, i) => {
      const home = HOME_ORDER[i];
      const start = CORNER_INDEX[home];
      return {
        index: i,
        userId: p.userId,
        nickname: p.nickname,
        isBot: p.isBot,
        home,
        pos: start,
        cards: hands[i],
        collected: 0,
        connected: true,
      } as PlayerState;
    });

    this.phase = 'INSERT';
    this.current = 0;
  }

  private shuffledTreasures(): number[] {
    const deck: number[] = [];
    for (let t = 1; t <= 24; t++) deck.push(t);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  // === 조회 ===
  getPhase(): Phase {
    return this.phase;
  }
  getCurrentPlayer(): number {
    return this.current;
  }
  getWinner(): number | null {
    return this.winner;
  }
  isGameOver(): boolean {
    return this.phase === 'FINISHED';
  }
  getPlayerCount(): number {
    return this.players.length;
  }
  getPlayerState(index: number): PlayerState | undefined {
    return this.players[index];
  }
  findSeatByUserId(userId: number): number {
    return this.players.findIndex((p) => p.userId === userId);
  }
  setConnected(index: number, connected: boolean): void {
    if (this.players[index]) this.players[index].connected = connected;
  }

  // 현재 플레이어가 노리는 보물 ID(없으면 null = 모두 수집, 귀환만 남음)
  currentTargetOf(index: number): number | null {
    const p = this.players[index];
    if (!p) return null;
    if (p.collected >= p.cards.length) return null;
    return p.cards[p.collected];
  }

  private forbiddenInsertionId(): number | null {
    if (this.lastInsertionId === null) return null;
    return oppositeInsertionId(this.lastInsertionId);
  }

  // 직렬화: viewerSeat에게만 본인 목표 보물을 공개.
  snapshot(viewerSeat: number | null = null): LabyrinthSnapshot {
    const players: PublicPlayer[] = this.players.map((p) => ({
      index: p.index,
      nickname: p.nickname,
      isBot: p.isBot,
      home: p.home,
      pos: p.pos,
      totalCards: p.cards.length,
      collected: p.collected,
      currentTarget:
        viewerSeat === p.index ? this.currentTargetOf(p.index) : null,
      connected: p.connected,
    }));
    return {
      board: this.board.map((t) => ({ ...t })),
      spare: { ...this.spare },
      phase: this.phase,
      currentPlayer: this.current,
      players,
      lastInsertionId: this.lastInsertionId,
      forbiddenInsertionId: this.forbiddenInsertionId(),
      winner: this.winner,
      turn: this.turnCount,
    };
  }

  // === 1단계: 타일 삽입 ===
  insert(seat: number, action: InsertAction): ActionResult {
    if (this.phase !== 'INSERT') return { ok: false, error: 'NOT_INSERT_PHASE' };
    if (seat !== this.current) return { ok: false, error: 'NOT_YOUR_TURN' };

    const point = findInsertion(action.insertionId);
    if (!point) return { ok: false, error: 'INVALID_INSERTION' };
    if (action.insertionId === this.forbiddenInsertionId()) {
      return { ok: false, error: 'FORBIDDEN_REVERSE' };
    }
    if (action.rotation < 0 || action.rotation > 3) {
      return { ok: false, error: 'INVALID_ROTATION' };
    }

    // 회전 적용한 spare로 삽입
    const spareToInsert: Tile = { ...this.spare, rotation: action.rotation as Rotation };
    const result = applyInsertion(this.board, spareToInsert, point);
    this.board = result.board;
    this.spare = result.spare;

    // 말 위치 갱신(밀려난/이동된 칸)
    for (const p of this.players) {
      const moved = result.pawnMap.get(p.pos);
      if (moved !== undefined) p.pos = moved;
    }

    this.lastInsertionId = action.insertionId;
    this.phase = 'MOVE';
    return { ok: true };
  }

  // === 2단계: 말 이동 ===
  move(seat: number, to: number): ActionResult {
    if (this.phase !== 'MOVE') return { ok: false, error: 'NOT_MOVE_PHASE' };
    if (seat !== this.current) return { ok: false, error: 'NOT_YOUR_TURN' };

    const p = this.players[seat];
    const canReach = reachable(this.board, p.pos);
    if (!canReach.has(to)) return { ok: false, error: 'UNREACHABLE' };

    p.pos = to;

    // 보물 수집 판정
    let collected: number | undefined;
    const target = this.currentTargetOf(seat);
    if (target !== null && this.board[to].treasure === target) {
      p.collected += 1;
      collected = target;
    }

    // 승리 판정: 모든 보물 수집 + 홈 귀환
    if (p.collected >= p.cards.length && to === CORNER_INDEX[p.home]) {
      this.winner = seat;
      this.phase = 'FINISHED';
      return { ok: true, collected, gameOver: true, winner: seat };
    }

    // 턴 종료 → 다음 플레이어(접속자 우선), INSERT로
    this.advanceTurn();
    return { ok: true, collected };
  }

  private advanceTurn(): void {
    this.turnCount += 1;
    let next = this.current;
    for (let i = 0; i < this.players.length; i++) {
      next = (next + 1) % this.players.length;
      // 모두 끊겨도 무한루프 방지: 한 바퀴 돌면 그냥 멈춤
      if (this.players[next].connected) break;
    }
    this.current = next;
    this.phase = 'INSERT';
  }

  // 타임아웃 등으로 현재 플레이어 턴을 강제 종료(기본 수: 가능한 첫 삽입 + 제자리)
  forceSkip(): void {
    if (this.phase === 'FINISHED') return;
    if (this.phase === 'INSERT') {
      // 금지되지 않은 첫 삽입 지점을 기본 회전으로 적용
      const forbidden = this.forbiddenInsertionId();
      const point = findInsertion(forbidden === 0 ? 1 : 0)!;
      this.insert(this.current, { insertionId: point.id, rotation: this.spare.rotation as Rotation });
    }
    // MOVE 단계: 제자리(이동 없이 턴 종료)
    if (this.phase === 'MOVE') {
      this.advanceTurn();
    }
  }
}
