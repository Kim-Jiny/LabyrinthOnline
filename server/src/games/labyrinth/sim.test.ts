/**
 * [LAB] 봇 대 봇 풀게임 시뮬레이션 — 게임이 실제로 종료(승자 발생)하는지 검증.
 *   실행:  npx ts-node src/games/labyrinth/sim.test.ts
 * 데드락/무한루프(아무도 못 이김)를 잡는다. 여러 시드로 반복.
 */
import { LabyrinthGame } from './engine';
import { chooseInsertion, chooseMove } from './bot';
import { makeRng } from './board';

function playOut(seed: number, players: number): { winner: number | null; turns: number } {
  const game = new LabyrinthGame({
    seed,
    players: Array.from({ length: players }, (_, i) => ({
      userId: null,
      nickname: `bot${i}`,
      isBot: true,
    })),
  });
  const rng = makeRng(seed ^ 0xabcd);
  const MAX_TURNS = 4000;
  let turns = 0;

  while (!game.isGameOver() && turns < MAX_TURNS) {
    const seat = game.getCurrentPlayer();
    // INSERT
    const snap = game.snapshot(seat);
    const target = game.currentTargetOf(seat);
    const home = snap.players[seat].home;
    const ins = chooseInsertion(
      snap.board, snap.spare, snap.players[seat].pos, target, home,
      snap.forbiddenInsertionId, 'hard', rng
    );
    const ir = game.insert(seat, ins);
    if (!ir.ok) throw new Error(`insert failed seed=${seed}: ${ir.error}`);

    // MOVE
    const snap2 = game.snapshot(seat);
    const target2 = game.currentTargetOf(seat);
    const to = chooseMove(snap2.board, snap2.players[seat].pos, target2, snap2.players[seat].home, 'hard', rng);
    const mr = game.move(seat, to);
    if (!mr.ok) throw new Error(`move failed seed=${seed}: ${mr.error}`);
    turns++;
  }

  return { winner: game.getWinner(), turns };
}

let passed = 0;
let failed = 0;
const seeds = [1, 2, 7, 42, 100, 2024, 31337];
for (const players of [2, 3, 4]) {
  for (const seed of seeds) {
    const { winner, turns } = playOut(seed * 11 + players, players);
    if (winner !== null) {
      passed++;
    } else {
      failed++;
      console.error(`  ✗ no winner: players=${players} seed=${seed} after ${turns} turns`);
    }
  }
}

console.log(`\n[LAB] sim.test — ${passed} games finished, ${failed} stalled`);
if (failed > 0) process.exit(1);
