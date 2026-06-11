/**
 * 라비린스(Labyrinth) — 타입 및 상수
 *
 * 라벤스부르거 "The aMAZE ing Labyrinth" 규칙 기반.
 * 7x7 미로판(49칸) + 여분 타일 1개 = 총 50개 타일.
 *
 * 좌표계: row(0~6, 위→아래), col(0~6, 왼쪽→오른쪽). index = row*7 + col.
 * 방향:   N=0(위), E=1(오른쪽), S=2(아래), W=3(왼쪽).
 *
 * 이 모듈은 순수 로직만 담는다(서버 권위). 소켓/DB/타이머는 알지 못한다.
 */

export const BOARD_SIZE = 7;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE; // 49

// 방향 상수
export const N = 0;
export const E = 1;
export const S = 2;
export const W = 3;
export type Dir = 0 | 1 | 2 | 3;

// 각 방향의 (drow, dcol)
export const DELTA: Record<Dir, [number, number]> = {
  [N]: [-1, 0],
  [E]: [0, 1],
  [S]: [1, 0],
  [W]: [0, -1],
};

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

// 타일 도형
//  STRAIGHT(직선 I): 마주보는 두 방향이 열림 (기본 N+S)
//  CORNER(코너 L):   인접한 두 방향이 열림 (기본 N+E)
//  TJUNCTION(T):     세 방향이 열림 (기본 N+E+S, 즉 W가 벽)
export type TileShape = 'STRAIGHT' | 'CORNER' | 'TJUNCTION';

// 회전: 시계방향 90도 단위. 0,1,2,3 = 0/90/180/270도.
export type Rotation = 0 | 1 | 2 | 3;

// 각 도형의 기본(회전 0) 열린 방향
export const BASE_OPENINGS: Record<TileShape, Dir[]> = {
  STRAIGHT: [N, S],
  CORNER: [N, E],
  TJUNCTION: [N, E, S],
};

export interface Tile {
  shape: TileShape;
  rotation: Rotation;
  // 보물 ID(1~24). 보물이 없으면 0.
  treasure: number;
}

// 말(플레이어 토큰)이 시작/귀환하는 네 모서리(홈)
export type Corner = 'TL' | 'TR' | 'BL' | 'BR';
export const CORNER_INDEX: Record<Corner, number> = {
  TL: 0,                       // (0,0)
  TR: BOARD_SIZE - 1,          // (0,6)
  BL: CELL_COUNT - BOARD_SIZE, // (6,0)
  BR: CELL_COUNT - 1,          // (6,6)
};

// 타일 삽입 지점: 가동 행/열(1,3,5)의 네 모서리에서 밀어넣는다.
// 12개. side는 타일이 "들어가는" 변(즉 미는 방향의 반대 가장자리).
export interface InsertionPoint {
  id: number;          // 0~11 안정적 식별자
  side: Dir;           // N=위에서 아래로 밀기, S=아래에서 위로, W=왼쪽→오른쪽, E=오른쪽→왼쪽
  line: number;        // 영향을 받는 열(N/S일 때) 또는 행(E/W일 때): 1,3,5
}

export const MOVABLE_LINES = [1, 3, 5];

// 12개 삽입 지점 (id 고정)
export const INSERTION_POINTS: InsertionPoint[] = [
  // 위에서 아래로 (열 1,3,5)
  { id: 0, side: N, line: 1 },
  { id: 1, side: N, line: 3 },
  { id: 2, side: N, line: 5 },
  // 아래에서 위로 (열 1,3,5)
  { id: 3, side: S, line: 1 },
  { id: 4, side: S, line: 3 },
  { id: 5, side: S, line: 5 },
  // 왼쪽에서 오른쪽 (행 1,3,5)
  { id: 6, side: W, line: 1 },
  { id: 7, side: W, line: 3 },
  { id: 8, side: W, line: 5 },
  // 오른쪽에서 왼쪽 (행 1,3,5)
  { id: 9, side: E, line: 1 },
  { id: 10, side: E, line: 3 },
  { id: 11, side: E, line: 5 },
];

export function findInsertion(id: number): InsertionPoint | undefined {
  return INSERTION_POINTS.find((p) => p.id === id);
}

// 한 삽입 지점의 "반대편"(직전 삽입을 그대로 되돌리는 금지 수) 매핑
export function oppositeInsertionId(id: number): number {
  const p = findInsertion(id);
  if (!p) return -1;
  const opp = INSERTION_POINTS.find(
    (q) => q.line === p.line && q.side === opposite(p.side)
  );
  return opp ? opp.id : -1;
}

// 게임 진행 단계
export type Phase = 'INSERT' | 'MOVE' | 'FINISHED';

export interface PlayerState {
  index: number;          // 0~3
  userId: number | null;  // 로그인 유저면 id, 봇이면 null
  nickname: string;
  isBot: boolean;
  home: Corner;
  pos: number;            // 현재 칸 index
  // 모아야 할 보물 카드(순서대로). 앞에서부터 수집.
  cards: number[];
  collected: number;      // 수집한 보물 개수(cards 앞에서부터)
  connected: boolean;     // 접속 상태(재연결용)
}

// 외부(클라이언트)로 내보내는 직렬화 상태
export interface LabyrinthSnapshot {
  board: Tile[];          // length 49
  spare: Tile;            // 여분 타일
  phase: Phase;
  currentPlayer: number;
  players: PublicPlayer[];
  lastInsertionId: number | null;     // 직전 삽입 지점(금지 수 표시용)
  forbiddenInsertionId: number | null; // 이번 턴에 막힌 삽입 지점
  winner: number | null;  // 승자 player index
  turn: number;           // 누적 턴 수
}

// 카드 내용은 본인에게만 보여주되, 공개 정보(목표 개수/수집 수)는 모두에게.
export interface PublicPlayer {
  index: number;
  nickname: string;
  isBot: boolean;
  home: Corner;
  pos: number;
  totalCards: number;
  collected: number;
  currentTarget: number | null; // 본인 시점에서만 채워 보냄(타인은 null)
  connected: boolean;
}
