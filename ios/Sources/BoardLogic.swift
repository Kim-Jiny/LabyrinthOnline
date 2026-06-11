//  BoardLogic.swift
//  라비린스 — 클라이언트 측 보조 계산(렌더링/하이라이트 전용).
//
//  ⚠️ 게임 규칙은 서버 권위다. 여기 BFS 는 "이동 가능 칸을 미리 표시"하는 UI 편의일 뿐,
//  서버가 모든 수를 최종 검증한다. 서버 board.ts 의 connects/reachable 와 동일 로직.

import Foundation

enum BoardLogic {
    static let delta: [(Int, Int)] = [(-1, 0), (0, 1), (1, 0), (0, -1)] // N,E,S,W

    static func opposite(_ dir: Int) -> Int { (dir + 2) % 4 }

    static func connects(_ a: Tile, _ b: Tile, dir: Int) -> Bool {
        a.isOpen(dir) && b.isOpen(opposite(dir))
    }

    /// from 칸에서 통로로 도달 가능한 모든 칸.
    static func reachable(board: [Tile], from: Int) -> Set<Int> {
        guard board.count == Board.cellCount else { return [from] }
        var seen: Set<Int> = [from]
        var queue = [from]
        while !queue.isEmpty {
            let cur = queue.removeFirst()
            let (r, c) = Board.rc(cur)
            for dir in 0..<4 {
                let nr = r + delta[dir].0, nc = c + delta[dir].1
                guard nr >= 0, nr < Board.size, nc >= 0, nc < Board.size else { continue }
                let n = Board.idx(nr, nc)
                if seen.contains(n) { continue }
                if connects(board[cur], board[n], dir: dir) {
                    seen.insert(n)
                    queue.append(n)
                }
            }
        }
        return seen
    }
}
