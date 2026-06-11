/**
 * [LAB] 라비린스 룰 엔진 검증 (의존성 없는 단독 실행 스크립트)
 *   실행:  npx ts-node src/games/labyrinth/engine.test.ts
 * 테스트 프레임워크가 없어 간단한 assert 헬퍼로 핵심 불변식만 검증한다.
 */
import {
  generateBoard,
  applyInsertion,
  reachable,
  shortestPath,
  makeRng,
  openings,
  connects,
  isFixedIndex,
  idx,
} from './board';
import {
  CELL_COUNT,
  INSERTION_POINTS,
  oppositeInsertionId,
  findInsertion,
  N,
  S,
} from './types';
import { LabyrinthGame } from './engine';

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

// 1) 보드 생성: 49칸 + spare, 고정칸 위치/보물 개수
{
  const rng = makeRng(12345);
  const { board, spare } = generateBoard(rng);
  ok(board.length === CELL_COUNT, 'board has 49 tiles');
  ok(!!spare, 'spare exists');
  // 고정칸 16개 모두 채워졌는지
  let fixed = 0;
  for (let i = 0; i < CELL_COUNT; i++) if (isFixedIndex(i)) fixed++;
  eq(fixed, 16, 'fixed cell count');
  // 보물 총합: 보드 + spare = 24
  let treasures = new Set<number>();
  for (const t of board) if (t.treasure) treasures.add(t.treasure);
  if (spare.treasure) treasures.add(spare.treasure);
  eq(treasures.size, 24, 'distinct treasures on board+spare = 24');
}

// 2) openings 회전 정확성: 직선 회전0 = N,S / 회전1 = E,W
{
  eq(openings({ shape: 'STRAIGHT', rotation: 0, treasure: 0 }).sort(), [N, S].sort(), 'straight rot0');
  const r1 = openings({ shape: 'STRAIGHT', rotation: 1, treasure: 0 }).sort();
  eq(r1, [1, 3].sort(), 'straight rot1 = E,W');
}

// 3) 삽입: 줄 시프트 + spare 교체 + 보드 크기 유지
{
  const rng = makeRng(999);
  const { board, spare } = generateBoard(rng);
  const point = INSERTION_POINTS.find((p) => p.side === N && p.line === 1)!;
  const before = board.map((t) => t.shape);
  const res = applyInsertion(board, { ...spare }, point);
  ok(res.board.length === CELL_COUNT, 'board size preserved after insert');
  ok(res.spare !== undefined, 'new spare ejected');
  // 진입구(0,1)에 spare가 들어갔는지 (도형 일치)
  eq(res.board[idx(0, 1)].shape, spare.shape, 'inserted tile at entry');
  // 원래 진입줄이 한 칸 밀렸는지: 새 (2,1) == 옛 (1,1)
  eq(res.board[idx(2, 1)].shape, before[idx(1, 1)], 'column shifted down by one');
}

// 4) 삽입 시 말 순환: 진출구의 말이 진입구로
{
  const rng = makeRng(7);
  const { board, spare } = generateBoard(rng);
  const point = INSERTION_POINTS.find((p) => p.side === N && p.line === 3)!;
  // 진출구는 (6,3)
  const res = applyInsertion(board, { ...spare }, point);
  eq(res.pawnMap.get(idx(6, 3)), idx(0, 3), 'pawn ejected wraps to entry');
  eq(res.pawnMap.get(idx(0, 3)), idx(1, 3), 'pawn at entry shifts one down');
}

// 5) reachable: 시작칸은 항상 자기 자신 포함, 인접 연결 일관성
{
  const rng = makeRng(42);
  const { board } = generateBoard(rng);
  const set = reachable(board, idx(0, 0));
  ok(set.has(idx(0, 0)), 'reachable includes self');
  // 도달 가능한 임의 칸은 실제로 경로가 존재해야 함
  for (const cell of set) {
    const path = shortestPath(board, idx(0, 0), cell);
    ok(path !== null, `path exists to reachable cell ${cell}`);
  }
}

// 6) oppositeInsertionId: N/line=1 ↔ S/line=1
{
  const top = INSERTION_POINTS.find((p) => p.side === N && p.line === 1)!;
  const opp = oppositeInsertionId(top.id);
  const oppPoint = findInsertion(opp)!;
  ok(oppPoint.side === S && oppPoint.line === 1, 'opposite of N/1 is S/1');
}

// 7) 엔진 전체 흐름: 2인 게임, 금지수 검증, 턴 진행
{
  const game = new LabyrinthGame({
    seed: 2024,
    players: [
      { userId: 1, nickname: 'A', isBot: false },
      { userId: 2, nickname: 'B', isBot: false },
    ],
  });
  eq(game.getPhase(), 'INSERT', 'starts in INSERT');
  eq(game.getCurrentPlayer(), 0, 'player 0 first');
  eq(game.getPlayerCount(), 2, '2 players');
  // 2인 카드 수 = 12
  eq(game.snapshot(0).players[0].totalCards, 12, '2-player gets 12 cards');

  // 잘못된 단계 호출
  ok(!game.move(0, 0).ok, 'cannot move before insert');
  // 잘못된 좌석
  ok(!game.insert(1, { insertionId: 0, rotation: 0 }).ok, 'wrong seat insert rejected');

  // 정상 삽입
  const ins = game.insert(0, { insertionId: 0, rotation: 0 });
  ok(ins.ok, 'valid insert ok');
  eq(game.getPhase(), 'MOVE', 'phase → MOVE after insert');

  // 제자리 이동(현재 위치는 항상 reachable)
  const pos = game.snapshot(0).players[0].pos;
  const mv = game.move(0, pos);
  ok(mv.ok, 'stay-in-place move ok');
  eq(game.getCurrentPlayer(), 1, 'turn passed to player 1');

  // 금지수: 플레이어1이 0의 반대편을 밀면 거부
  const forbidden = game.snapshot(1).forbiddenInsertionId;
  ok(forbidden !== null, 'forbidden insertion set after a push');
  const bad = game.insert(1, { insertionId: forbidden!, rotation: 0 });
  ok(!bad.ok && bad.error === 'FORBIDDEN_REVERSE', 'reverse insertion forbidden');
}

console.log(`\n[LAB] engine.test — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
