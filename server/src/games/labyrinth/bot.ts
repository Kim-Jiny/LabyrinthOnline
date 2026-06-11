/**
 * [LAB] 라비린스 AI 봇 — 같은 룰 엔진(board.ts) 위에서 동작하는 휴리스틱.
 *
 * 전략(난이도 무관 공통):
 *  1) 삽입 단계: 금지수를 제외한 모든 삽입 지점 × 4회전(최대 48수)을 시뮬레이션해,
 *     "목표 보물 칸에 가장 가까워지는 / 도달 가능해지는" 수를 고른다.
 *  2) 이동 단계: 목표 보물 칸에 닿을 수 있으면 그리 가고, 아니면 목표에 가장 가까운
 *     도달 가능 칸으로 이동한다. (모든 보물 수집 후에는 홈 코너를 목표로 삼는다.)
 *
 * 난이도(difficulty)로 탐색 품질을 낮춰 약하게 만들 수 있다:
 *  - 'hard'   : 항상 최적 점수 수 선택
 *  - 'normal' : 상위 후보 중 랜덤
 *  - 'easy'   : 절반 확률로 무작위 수
 */
import {
  Tile,
  Rotation,
  InsertionPoint,
  INSERTION_POINTS,
  CORNER_INDEX,
  Corner,
} from './types';
import {
  applyInsertion,
  reachable,
  rc,
  idx,
  RNG,
} from './board';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface BotInsertChoice {
  insertionId: number;
  rotation: Rotation;
}

// 목표 보물 칸 index 찾기(없으면 -1: 보드에 없고 spare에 있을 수 있음)
function findTreasureCell(board: Tile[], treasure: number): number {
  if (treasure <= 0) return -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i].treasure === treasure) return i;
  }
  return -1;
}

// 두 칸 사이 맨해튼 거리
function manhattan(a: number, b: number): number {
  const [ar, ac] = rc(a);
  const [br, bc] = rc(b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
}

// 도달 가능 칸 중 goal 에 가장 가까운 칸과 그 거리
function bestReach(board: Tile[], from: number, goal: number): { cell: number; dist: number; canReach: boolean } {
  const set = reachable(board, from);
  if (set.has(goal)) return { cell: goal, dist: 0, canReach: true };
  let best = from;
  let bestDist = Infinity;
  for (const cell of set) {
    const d = manhattan(cell, goal);
    if (d < bestDist) {
      bestDist = d;
      best = cell;
    }
  }
  return { cell: best, dist: bestDist, canReach: false };
}

// 현재 봇의 목표 칸(보물 또는 귀환 홈) index 후보를 결정.
// goal 이 보드에 없으면(보물이 spare에 있음) -1 → 거리 점수 대신 보물 회수 가중만.
function resolveGoal(board: Tile[], target: number | null, home: Corner): number {
  if (target === null) return CORNER_INDEX[home]; // 모두 수집 → 귀환
  return findTreasureCell(board, target);
}

/**
 * 삽입 수 선택. board/spare/pawnPos 는 삽입 "전" 상태.
 * target: 현재 노리는 보물 ID(없으면 null = 귀환 모드), home: 봇 홈 코너.
 */
export function chooseInsertion(
  board: Tile[],
  spare: Tile,
  pawnPos: number,
  target: number | null,
  home: Corner,
  forbiddenInsertionId: number | null,
  difficulty: BotDifficulty,
  rng: RNG
): BotInsertChoice {
  const candidates: Array<BotInsertChoice & { score: number }> = [];

  for (const point of INSERTION_POINTS) {
    if (point.id === forbiddenInsertionId) continue;
    for (let rot = 0 as Rotation; rot <= 3; rot = (rot + 1) as Rotation) {
      const spareRot: Tile = { ...spare, rotation: rot };
      const res = applyInsertion(board, spareRot, point as InsertionPoint);
      const newPawn = res.pawnMap.get(pawnPos) ?? pawnPos;

      // 삽입 후 목표 칸 위치 재계산(타일이 밀렸을 수 있음)
      const goal = resolveGoal(res.board, target, home);
      let score: number;
      if (goal < 0) {
        // 목표 보물이 보드에 없음(spare로 빠짐). 약한 패널티.
        score = -100;
      } else {
        const { canReach, dist } = bestReach(res.board, newPawn, goal);
        // 도달 가능하면 큰 보너스, 아니면 거리 역수
        score = canReach ? 1000 : -dist;
      }
      // 지터: 동점/근소차 수를 무작위로 흔들어 결정론적 사이클(영원히 못 끝남)을 깬다.
      // 미로 특성상 맨해튼 점수만으로는 봇이 같은 자리를 오갈 수 있어 필수.
      score += rng() * 0.9;
      candidates.push({ insertionId: point.id, rotation: rot, score });
    }
  }

  if (candidates.length === 0) {
    // 이론상 없음(금지수 1개 제외하면 항상 후보 존재). 안전망.
    return { insertionId: forbiddenInsertionId === 0 ? 1 : 0, rotation: spare.rotation as Rotation };
  }

  candidates.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy' && rng() < 0.5) {
    const r = candidates[Math.floor(rng() * candidates.length)];
    return { insertionId: r.insertionId, rotation: r.rotation };
  }
  if (difficulty === 'normal') {
    const top = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.25)));
    const r = top[Math.floor(rng() * top.length)];
    return { insertionId: r.insertionId, rotation: r.rotation };
  }
  // hard: 최적
  const best = candidates[0];
  return { insertionId: best.insertionId, rotation: best.rotation };
}

/**
 * 이동 칸 선택. board/pawnPos 는 삽입 "후" 상태.
 * target 보물 칸에 닿으면 그리로, 아니면 목표에 가장 가까운 도달칸으로.
 */
export function chooseMove(
  board: Tile[],
  pawnPos: number,
  target: number | null,
  home: Corner,
  difficulty: BotDifficulty,
  rng: RNG
): number {
  const goal = resolveGoal(board, target, home);

  if (difficulty === 'easy' && rng() < 0.3) {
    // 가끔 아무 도달칸으로
    const set = [...reachable(board, pawnPos)];
    return set[Math.floor(rng() * set.length)];
  }

  if (goal < 0) {
    // 목표 보물이 보드에 없음 → 제자리 유지(다음 턴 삽입으로 끌어옴)
    return pawnPos;
  }
  const { cell, canReach } = bestReach(board, pawnPos, goal);
  // 목표에 직접 닿을 수 있으면 무조건 간다.
  if (canReach) return cell;
  // 못 닿으면: 맨해튼 최근접만 고집하면 막다른 골목에서 진동한다.
  // 일정 확률로 다른 도달칸으로 탐험 이동해 사이클을 깬다.
  const reach = [...reachable(board, pawnPos)];
  if (reach.length > 1 && rng() < 0.35) {
    return reach[Math.floor(rng() * reach.length)];
  }
  return cell;
}
