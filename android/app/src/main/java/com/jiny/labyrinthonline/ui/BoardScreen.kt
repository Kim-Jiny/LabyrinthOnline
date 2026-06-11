package com.jiny.labyrinthonline.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.jiny.labyrinthonline.Board
import com.jiny.labyrinthonline.BoardLogic
import com.jiny.labyrinthonline.GameViewModel
import com.jiny.labyrinthonline.LabyrinthSnapshot
import com.jiny.labyrinthonline.Phase
import com.jiny.labyrinthonline.Tile

private val WALL = Color(0xFF1A1F29)
private val PATH = Color(0xFFDBC795)
private val PLAYER_COLORS = listOf(Color.Red, Color.Blue, Color(0xFF2E7D32), Color(0xFFEF6C00))
private val GEM_COLORS = listOf(
    Color.Red, Color(0xFFEF6C00), Color(0xFFFBC02D), Color(0xFF43A047), Color(0xFF00897B),
    Color(0xFF00ACC1), Color(0xFF1E88E5), Color(0xFF3949AB), Color(0xFF8E24AA),
    Color(0xFFD81B60), Color(0xFF6D4C41), Color(0xFF546E7A)
)

/**
 * 7×7 보드 + 12개 삽입 화살표 + 말. 한 변에 (size+1)칸을 두어 가장자리에 화살표 공간 확보.
 * 입력은 단일 Canvas 의 tap 좌표를 칸/화살표로 환산해 처리한다.
 */
@Composable
fun BoardScreen(vm: GameViewModel, modifier: Modifier = Modifier) {
    val snap = vm.snapshot ?: return

    BoxWithConstraints(modifier.fillMaxWidth().aspectRatio(1f).padding(4.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).pointerInput(snap) {
            detectTapGestures { offset -> handleTap(vm, snap, offset.x, offset.y, size.width.toFloat()) }
        }) {
            Canvas(Modifier.fillMaxWidth().aspectRatio(1f)) {
                val dim = size.minDimension
                val cell = dim / (Board.SIZE + 1)
                val ox = cell / 2f
                val oy = cell / 2f

                val reach: Set<Int> = if (vm.isMyTurn && snap.phase == Phase.MOVE && vm.mySeat != null)
                    BoardLogic.reachable(snap.board, snap.players[vm.mySeat!!].pos) else emptySet()

                // 타일
                for (i in 0 until Board.CELL_COUNT) {
                    val r = Board.row(i); val c = Board.col(i)
                    val left = ox + c * cell; val top = oy + r * cell
                    drawTile(snap.board[i], left, top, cell, highlighted = reach.contains(i))
                }

                // 말
                for (p in snap.players) {
                    val r = Board.row(p.pos); val c = Board.col(p.pos)
                    val cx = ox + c * cell + cell / 2f
                    val cy = oy + r * cell + cell / 2f
                    drawCircle(
                        color = PLAYER_COLORS[p.index % PLAYER_COLORS.size].copy(alpha = if (p.connected) 1f else 0.4f),
                        radius = cell * 0.16f,
                        center = Offset(cx, cy)
                    )
                    drawCircle(Color.White, radius = cell * 0.16f, center = Offset(cx, cy), style = androidx.compose.ui.graphics.drawscope.Stroke(width = cell * 0.03f))
                }

                // 삽입 화살표
                for (ins in Board.insertions) {
                    val forbidden = snap.forbiddenInsertionId == ins.id
                    val selected = vm.selectedInsertion == ins.id
                    val active = vm.isMyTurn && snap.phase == Phase.INSERT && !forbidden
                    val pos = arrowPos(ins, cell, ox, oy)
                    val color = when {
                        forbidden -> Color.Gray.copy(alpha = 0.3f)
                        selected -> Color(0xFFFFD600)
                        active -> Color(0xFF42A5F5)
                        else -> Color(0xFF42A5F5).copy(alpha = 0.3f)
                    }
                    drawArrow(pos.first, pos.second, ins.side, cell * 0.22f, color)

                    if (selected) {
                        val entry = entryCellTopLeft(ins, cell, ox, oy)
                        drawTile(
                            snap.spare.copy(rotation = vm.pendingRotation),
                            entry.first, entry.second, cell, insertable = true
                        )
                    }
                }
            }
        }
    }
}

// === Canvas 그리기 ===

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTile(
    tile: Tile, left: Float, top: Float, cell: Float,
    highlighted: Boolean = false, insertable: Boolean = false
) {
    val pad = cell * 0.04f
    drawRoundRect(
        color = WALL,
        topLeft = Offset(left + pad, top + pad),
        size = Size(cell - pad * 2, cell - pad * 2),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(cell * 0.08f)
    )
    val arm = cell * 0.17f
    val cx = left + cell / 2f; val cy = top + cell / 2f
    val path = Path().apply {
        addRect(Rect(cx - arm, cy - arm, cx + arm, cy + arm))
        for (dir in tile.openings) {
            when (dir) {
                0 -> addRect(Rect(cx - arm, top, cx + arm, cy))           // N
                1 -> addRect(Rect(cx, cy - arm, left + cell, cy + arm))   // E
                2 -> addRect(Rect(cx - arm, cy, cx + arm, top + cell))    // S
                else -> addRect(Rect(left, cy - arm, cx, cy + arm))       // W
            }
        }
    }
    drawPath(path, PATH)

    if (tile.treasure > 0) {
        drawCircle(
            GEM_COLORS[tile.treasure % GEM_COLORS.size],
            radius = cell * 0.15f, center = Offset(cx, cy)
        )
    }
    if (highlighted) {
        drawRoundRect(
            Color.Green, topLeft = Offset(left + pad, top + pad),
            size = Size(cell - pad * 2, cell - pad * 2),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(cell * 0.08f),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = cell * 0.06f)
        )
    }
    if (insertable) {
        drawRoundRect(
            Color(0xFFFFD600), topLeft = Offset(left + pad, top + pad),
            size = Size(cell - pad * 2, cell - pad * 2),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(cell * 0.08f),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = cell * 0.05f)
        )
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawArrow(
    x: Float, y: Float, side: Int, r: Float, color: Color
) {
    // side 방향을 가리키는 삼각형
    val path = Path()
    when (side) {
        0 -> { path.moveTo(x, y + r); path.lineTo(x - r, y - r); path.lineTo(x + r, y - r) } // N: 위 가리킴? 진입은 아래로
        2 -> { path.moveTo(x, y - r); path.lineTo(x - r, y + r); path.lineTo(x + r, y + r) } // S
        3 -> { path.moveTo(x + r, y); path.lineTo(x - r, y - r); path.lineTo(x - r, y + r) } // W
        else -> { path.moveTo(x - r, y); path.lineTo(x + r, y - r); path.lineTo(x + r, y + r) } // E
    }
    path.close()
    drawPath(path, color)
}

// 화살표 중심 좌표
private fun arrowPos(ins: Board.Insertion, cell: Float, ox: Float, oy: Float): Pair<Float, Float> = when (ins.side) {
    0 -> (ox + (ins.line + 0.5f) * cell) to (oy * 0.5f)
    2 -> (ox + (ins.line + 0.5f) * cell) to (oy + Board.SIZE * cell + cell * 0.0f)
    3 -> (ox * 0.5f) to (oy + (ins.line + 0.5f) * cell)
    else -> (ox + Board.SIZE * cell) to (oy + (ins.line + 0.5f) * cell)
}
private fun entryCellTopLeft(ins: Board.Insertion, cell: Float, ox: Float, oy: Float): Pair<Float, Float> = when (ins.side) {
    0 -> (ox + ins.line * cell) to oy
    2 -> (ox + ins.line * cell) to (oy + (Board.SIZE - 1) * cell)
    3 -> ox to (oy + ins.line * cell)
    else -> (ox + (Board.SIZE - 1) * cell) to (oy + ins.line * cell)
}

// === 탭 → 칸/화살표 환산 ===
private fun handleTap(vm: GameViewModel, snap: LabyrinthSnapshot, x: Float, y: Float, fullWidth: Float) {
    val dim = fullWidth
    val cell = dim / (Board.SIZE + 1)
    val ox = cell / 2f; val oy = cell / 2f

    // 삽입 단계: 가장자리 화살표 히트 테스트 우선
    if (vm.isMyTurn && snap.phase == Phase.INSERT) {
        for (ins in Board.insertions) {
            val pos = arrowPos(ins, cell, ox, oy)
            if (kotlin.math.hypot((x - pos.first).toDouble(), (y - pos.second).toDouble()) < cell * 0.5) {
                vm.tapInsertion(ins.id); return
            }
        }
    }
    // 보드 칸 히트 테스트(이동)
    val c = ((x - ox) / cell).toInt()
    val r = ((y - oy) / cell).toInt()
    if (r in 0 until Board.SIZE && c in 0 until Board.SIZE) {
        vm.moveTo(Board.idx(r, c))
    }
}
