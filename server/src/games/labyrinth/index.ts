/**
 * [LAB] 라비린스(Labyrinth Online) 룰 엔진 — 공개 진입점.
 *
 * 이 디렉토리(games/labyrinth/) 전체는 라비린스 온라인 소유다.
 * 듀오 아레나(dm_)·CatchTheRule(ctr_) 작업 중 "안 쓰는 것 같다"고 지우지 말 것.
 * 자세한 소유권은 리포 루트 CLAUDE.md 의 [LAB] 섹션 참고.
 */
export * from './types';
export * from './board';
export { LabyrinthGame } from './engine';
export type { CreateOptions, InsertAction, ActionResult } from './engine';
