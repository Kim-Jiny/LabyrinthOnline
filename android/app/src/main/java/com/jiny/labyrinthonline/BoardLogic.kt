package com.jiny.labyrinthonline

/*
 * 클라이언트 측 보조 계산(이동 가능 칸 하이라이트 전용).
 * ⚠️ 규칙은 서버 권위. 이 BFS 는 UI 편의일 뿐 서버가 모든 수를 최종 검증한다.
 * 서버 board.ts 의 connects/reachable 와 동일 로직.
 */
object BoardLogic {
    private val delta = listOf(-1 to 0, 0 to 1, 1 to 0, 0 to -1) // N,E,S,W

    private fun opposite(dir: Int) = (dir + 2) % 4

    private fun connects(a: Tile, b: Tile, dir: Int): Boolean =
        a.isOpen(dir) && b.isOpen(opposite(dir))

    fun reachable(board: List<Tile>, from: Int): Set<Int> {
        if (board.size != Board.CELL_COUNT) return setOf(from)
        val seen = hashSetOf(from)
        val queue = ArrayDeque<Int>()
        queue.add(from)
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            val r = Board.row(cur); val c = Board.col(cur)
            for (dir in 0 until 4) {
                val nr = r + delta[dir].first
                val nc = c + delta[dir].second
                if (nr < 0 || nr >= Board.SIZE || nc < 0 || nc >= Board.SIZE) continue
                val n = Board.idx(nr, nc)
                if (n in seen) continue
                if (connects(board[cur], board[n], dir)) {
                    seen.add(n)
                    queue.add(n)
                }
            }
        }
        return seen
    }
}
