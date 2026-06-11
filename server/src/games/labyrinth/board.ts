/**
 * 라비린스 — 보드 생성 / 타일 연결 / 삽입(밀기) / 경로탐색
 *
 * 모두 순수 함수. RNG는 인자로 주입(시드 가능 → 테스트/재현 가능).
 */

import {
  BOARD_SIZE,
  CELL_COUNT,
  Dir,
  N,
  E,
  S,
  W,
  DELTA,
  opposite,
  Tile,
  TileShape,
  Rotation,
  BASE_OPENINGS,
  InsertionPoint,
} from './types';

export type RNG = () => number; // [0,1)

// 시드 가능한 PRNG (mulberry32). 같은 시드 → 같은 결과.
export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rc(index: number): [number, number] {
  return [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE];
}
export function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}
export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// 회전이 적용된 타일의 열린 방향 집합
export function openings(tile: Tile): Dir[] {
  return BASE_OPENINGS[tile.shape].map((d) => ((d + tile.rotation) % 4) as Dir);
}

export function isOpen(tile: Tile, dir: Dir): boolean {
  return openings(tile).includes(dir);
}

// 두 인접 칸이 서로 연결되는지(양쪽 다 마주보는 방향이 열려야 통행)
export function connects(a: Tile, b: Tile, dirAtoB: Dir): boolean {
  return isOpen(a, dirAtoB) && isOpen(b, opposite(dirAtoB));
}

// --- 고정 타일 배치 (even/even 16칸) ---
// 표준 라벤스부르거 고정 배치. 벽(닫힌 면)으로 정의하는 게 직관적이라
// 각 칸의 도형 + 회전을 직접 지정한다. 회전 0 기준 열림:
//   CORNER: N+E,  TJUNCTION: N+E+S(W가 벽)
// 회전 r은 시계방향 r*90도.
interface FixedSpec {
  index: number;
  shape: TileShape;
  rotation: Rotation;
}

// 모서리 홈 4개 + 고정 T 12개. 회전은 열림 방향이 아래 주석과 같도록 맞췄다.
export const FIXED_TILES: FixedSpec[] = [
  // 네 모서리(홈 코너)
  { index: idx(0, 0), shape: 'CORNER', rotation: 1 }, // 열림 E,S
  { index: idx(0, 6), shape: 'CORNER', rotation: 2 }, // 열림 S,W
  { index: idx(6, 0), shape: 'CORNER', rotation: 0 }, // 열림 N,E
  { index: idx(6, 6), shape: 'CORNER', rotation: 3 }, // 열림 N,W
  // 윗줄 고정 T (열림 E,S,W → 벽 N → 회전 2)
  { index: idx(0, 2), shape: 'TJUNCTION', rotation: 2 },
  { index: idx(0, 4), shape: 'TJUNCTION', rotation: 2 },
  // 둘째 고정줄(row 2)
  { index: idx(2, 0), shape: 'TJUNCTION', rotation: 1 }, // 열림 N,E,S (벽 W → 회전 1)
  { index: idx(2, 2), shape: 'TJUNCTION', rotation: 1 }, // 열림 N,E,S
  { index: idx(2, 4), shape: 'TJUNCTION', rotation: 2 }, // 열림 E,S,W
  { index: idx(2, 6), shape: 'TJUNCTION', rotation: 3 }, // 열림 N,S,W (벽 E → 회전 3)
  // 셋째 고정줄(row 4)
  { index: idx(4, 0), shape: 'TJUNCTION', rotation: 1 }, // 열림 N,E,S
  { index: idx(4, 2), shape: 'TJUNCTION', rotation: 0 }, // 열림 N,E,W (벽 S → 회전 0)
  { index: idx(4, 4), shape: 'TJUNCTION', rotation: 3 }, // 열림 N,S,W
  { index: idx(4, 6), shape: 'TJUNCTION', rotation: 3 }, // 열림 N,S,W
  // 아랫줄 고정 T (열림 N,E,W → 벽 S → 회전 0)
  { index: idx(6, 2), shape: 'TJUNCTION', rotation: 0 },
  { index: idx(6, 4), shape: 'TJUNCTION', rotation: 0 },
];

// 고정 타일이 가진 보물 ID(1~12). 12개 고정 T에 순서대로 부여.
// 모서리 홈(4개)에는 보물 없음.
const FIXED_TREASURE_ORDER = [
  idx(0, 2), idx(0, 4),
  idx(2, 0), idx(2, 2), idx(2, 4), idx(2, 6),
  idx(4, 0), idx(4, 2), idx(4, 4), idx(4, 6),
  idx(6, 2), idx(6, 4),
];

export function isFixedIndex(index: number): boolean {
  const [r, c] = rc(index);
  return r % 2 === 0 && c % 2 === 0;
}

// --- 가동 타일 더미(34개) 구성 ---
// 표준 분포: 직선 12, 코너 16(보물 6), T 6(보물 6). 보물 가동 = 12개(ID 13~24).
function buildMovableBag(rng: RNG): Tile[] {
  const tiles: Tile[] = [];
  // 직선 12 (보물 없음)
  for (let i = 0; i < 12; i++) {
    tiles.push({ shape: 'STRAIGHT', treasure: 0, rotation: 0 });
  }
  // 코너 16: 앞 6개에 보물
  for (let i = 0; i < 16; i++) {
    tiles.push({ shape: 'CORNER', treasure: 0, rotation: 0 });
  }
  // T 6: 모두 보물
  for (let i = 0; i < 6; i++) {
    tiles.push({ shape: 'TJUNCTION', treasure: 0, rotation: 0 });
  }

  // 보물 가동 타일에 ID 13~24 부여: 코너 6개 + T 6개
  const cornerStart = 12;
  const tStart = 12 + 16;
  let tid = 13;
  for (let i = 0; i < 6; i++) tiles[cornerStart + i].treasure = tid++;
  for (let i = 0; i < 6; i++) tiles[tStart + i].treasure = tid++;

  // 셔플(Fisher-Yates)
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  // 가동 타일은 랜덤 회전
  for (const t of tiles) {
    t.rotation = Math.floor(rng() * 4) as Rotation;
  }
  return tiles;
}

export interface GeneratedBoard {
  board: Tile[]; // length 49
  spare: Tile;
}

// 보드 생성: 고정 16 + 가동 33 배치, 1개는 여분(spare).
export function generateBoard(rng: RNG): GeneratedBoard {
  const board: Tile[] = new Array(CELL_COUNT);

  // 고정 타일 배치
  for (const f of FIXED_TILES) {
    board[f.index] = { shape: f.shape, rotation: f.rotation, treasure: 0 };
  }
  // 고정 보물 부여
  let fixedTid = 1;
  for (const i of FIXED_TREASURE_ORDER) {
    board[i].treasure = fixedTid++;
  }

  // 가동 타일 34개 → 빈 칸 33개 채우고 1개 spare
  const bag = buildMovableBag(rng);
  let bagPos = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i]) continue; // 고정 칸
    board[i] = bag[bagPos++];
  }
  const spare = bag[bagPos++];

  return { board, spare };
}

// 모든 보물 ID(1~24) 목록
export function allTreasures(): number[] {
  const out: number[] = [];
  for (let t = 1; t <= 24; t++) out.push(t);
  return out;
}

// --- 삽입(밀기) ---
// 한 줄(행 또는 열)을 spare 타일로 밀어 끝 타일을 새 spare로 밀어낸다.
// 말(pawnPositions: index 배열)이 밀려나면 반대편으로 순환 입장.
export interface InsertResult {
  board: Tile[];
  spare: Tile;              // 밀려나온 새 spare
  pawnMap: Map<number, number>; // 이전 index → 새 index (말 위치 갱신용)
}

export function applyInsertion(
  board: Tile[],
  spare: Tile,
  point: InsertionPoint
): InsertResult {
  const next = board.slice();
  const pawnMap = new Map<number, number>();

  // 밀어넣을 타일(spare)을 진입 가장자리에 놓고, 한 칸씩 밀어 반대편 타일을 뽑아낸다.
  const { side, line } = point;

  // 줄을 구성하는 칸 인덱스를 "진입 → 진출" 순서로 모은다.
  const cells: number[] = [];
  if (side === N) {
    // 위(row 0)에서 진입, 아래로 진행 → 진출은 row 6
    for (let r = 0; r < BOARD_SIZE; r++) cells.push(idx(r, line));
  } else if (side === S) {
    for (let r = BOARD_SIZE - 1; r >= 0; r--) cells.push(idx(r, line));
  } else if (side === W) {
    for (let c = 0; c < BOARD_SIZE; c++) cells.push(idx(line, c));
  } else {
    // E
    for (let c = BOARD_SIZE - 1; c >= 0; c--) cells.push(idx(line, c));
  }

  // 진출구(마지막 칸)의 타일이 새 spare가 된다.
  const ejectedIndex = cells[cells.length - 1];
  const newSpare = next[ejectedIndex];

  // 뒤에서부터 한 칸씩 당겨온다: cells[i] ← cells[i-1]
  for (let i = cells.length - 1; i > 0; i--) {
    next[cells[i]] = next[cells[i - 1]];
  }
  // 진입구에 spare 삽입(회전 유지)
  next[cells[0]] = spare;

  // 말 위치 매핑: 줄 위의 말은 한 칸 진행, 진출구의 말은 진입구로 순환
  for (let i = 0; i < cells.length; i++) {
    const from = cells[i];
    if (i === cells.length - 1) {
      // 밀려난 칸에 있던 말 → 반대편 진입구(cells[0])
      pawnMap.set(from, cells[0]);
    } else {
      pawnMap.set(from, cells[i + 1]);
    }
  }

  return { board: next, spare: newSpare, pawnMap };
}

// --- 경로탐색 ---
// from 칸에서 통로로 연결되어 도달 가능한 모든 칸 집합(BFS)
export function reachable(board: Tile[], from: number): Set<number> {
  const seen = new Set<number>([from]);
  const queue: number[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const [r, c] = rc(cur);
    for (const dir of [N, E, S, W] as Dir[]) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const nIdx = idx(nr, nc);
      if (seen.has(nIdx)) continue;
      if (connects(board[cur], board[nIdx], dir)) {
        seen.add(nIdx);
        queue.push(nIdx);
      }
    }
  }
  return seen;
}

// from → to 최단 경로(칸 index 배열). 도달 불가면 null. (봇/검증용)
export function shortestPath(
  board: Tile[],
  from: number,
  to: number
): number[] | null {
  if (from === to) return [from];
  const prev = new Map<number, number>();
  const seen = new Set<number>([from]);
  const queue: number[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const [r, c] = rc(cur);
    for (const dir of [N, E, S, W] as Dir[]) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const nIdx = idx(nr, nc);
      if (seen.has(nIdx)) continue;
      if (connects(board[cur], board[nIdx], dir)) {
        seen.add(nIdx);
        prev.set(nIdx, cur);
        if (nIdx === to) {
          const path = [to];
          let p = to;
          while (prev.has(p)) {
            p = prev.get(p)!;
            path.unshift(p);
          }
          return path;
        }
        queue.push(nIdx);
      }
    }
  }
  return null;
}
