//  BoardView.swift
//  라비린스 — 7x7 미로판 + 12개 삽입 화살표 + 말 + 여분 타일.

import SwiftUI

struct BoardView: View {
    @ObservedObject var vm: GameViewModel

    private let playerColors: [Color] = [.red, .blue, .green, .orange]

    var body: some View {
        guard let snap = vm.snapshot else {
            return AnyView(ProgressView("연결 중…"))
        }
        let reach: Set<Int> = (vm.isMyTurn && snap.phase == .move && vm.mySeat != nil)
            ? BoardLogic.reachable(board: snap.board, from: snap.players[vm.mySeat!].pos)
            : []

        return AnyView(
            GeometryReader { geo in
                // 바깥에 삽입 화살표 영역을 두기 위해 8칸 폭으로 배치
                let dim = min(geo.size.width, geo.size.height)
                let cell = dim / CGFloat(Board.size + 1)
                let boardOrigin = CGPoint(x: cell / 2, y: cell / 2)

                ZStack(alignment: .topLeading) {
                    // 타일들
                    ForEach(0..<Board.cellCount, id: \.self) { i in
                        let (r, c) = Board.rc(i)
                        TileView(
                            tile: snap.board[i],
                            highlighted: reach.contains(i)
                        )
                        .frame(width: cell, height: cell)
                        .overlay(pawnsOverlay(snap: snap, cellIndex: i, size: cell))
                        .position(
                            x: boardOrigin.x + (CGFloat(c) + 0.5) * cell,
                            y: boardOrigin.y + (CGFloat(r) + 0.5) * cell
                        )
                        .onTapGesture { vm.moveTo(i) }
                    }

                    // 삽입 화살표(12개)
                    ForEach(Board.insertions) { ins in
                        insertionButton(ins, cell: cell, origin: boardOrigin, snap: snap)
                    }
                }
                .frame(width: dim, height: dim)
            }
            .aspectRatio(1, contentMode: .fit)
        )
    }

    // 한 칸 위에 올라간 말들
    @ViewBuilder
    private func pawnsOverlay(snap: LabyrinthSnapshot, cellIndex: Int, size: CGFloat) -> some View {
        let here = snap.players.filter { $0.pos == cellIndex }
        if !here.isEmpty {
            HStack(spacing: 1) {
                ForEach(here) { p in
                    Circle()
                        .fill(playerColors[p.index % playerColors.count])
                        .frame(width: size * 0.26, height: size * 0.26)
                        .overlay(Circle().stroke(.white, lineWidth: 1.5))
                        .opacity(p.connected ? 1 : 0.4)
                }
            }
        }
    }

    // 삽입 지점 버튼(보드 가장자리 화살표)
    @ViewBuilder
    private func insertionButton(_ ins: Board.Insertion, cell: CGFloat, origin: CGPoint, snap: LabyrinthSnapshot) -> some View {
        let forbidden = snap.forbiddenInsertionId == ins.id
        let selected = vm.selectedInsertion == ins.id
        let active = vm.isMyTurn && snap.phase == .insert && !forbidden

        // 화살표 위치(보드 바깥 가장자리)
        let pos = arrowPosition(ins, cell: cell, origin: origin)
        let angle = arrowAngle(ins.side)

        Image(systemName: "arrowtriangle.down.fill")
            .resizable()
            .frame(width: cell * 0.4, height: cell * 0.4)
            .rotationEffect(.degrees(angle))
            .foregroundStyle(forbidden ? Color.gray.opacity(0.3)
                             : selected ? Color.yellow : Color.accentColor.opacity(active ? 0.9 : 0.3))
            .position(x: pos.x, y: pos.y)
            .onTapGesture { vm.tapInsertion(ins.id) }
            .allowsHitTesting(active)
            // 선택된 삽입 지점엔 회전 미리보기 타일 표시
            .overlay(alignment: .center) {
                if selected {
                    TileView(tile: rotatedSpare(snap), insertable: true)
                        .frame(width: cell, height: cell)
                        .position(entryCellCenter(ins, cell: cell, origin: origin))
                }
            }
    }

    private func rotatedSpare(_ snap: LabyrinthSnapshot) -> Tile {
        Tile(shape: snap.spare.shape, rotation: vm.pendingRotation, treasure: snap.spare.treasure)
    }

    // 화살표 픽셀 위치
    private func arrowPosition(_ ins: Board.Insertion, cell: CGFloat, origin: CGPoint) -> CGPoint {
        switch ins.side {
        case 0: return CGPoint(x: origin.x + (CGFloat(ins.line) + 0.5) * cell, y: origin.y) // N: 위
        case 2: return CGPoint(x: origin.x + (CGFloat(ins.line) + 0.5) * cell, y: origin.y + (CGFloat(Board.size) + 0.0) * cell) // S: 아래
        case 3: return CGPoint(x: origin.x, y: origin.y + (CGFloat(ins.line) + 0.5) * cell) // W: 왼쪽
        default: return CGPoint(x: origin.x + (CGFloat(Board.size) + 0.0) * cell, y: origin.y + (CGFloat(ins.line) + 0.5) * cell) // E: 오른쪽
        }
    }
    // 진입 칸 중심(미리보기 타일 위치)
    private func entryCellCenter(_ ins: Board.Insertion, cell: CGFloat, origin: CGPoint) -> CGPoint {
        switch ins.side {
        case 0: return CGPoint(x: origin.x + (CGFloat(ins.line) + 0.5) * cell, y: origin.y + 0.5 * cell)
        case 2: return CGPoint(x: origin.x + (CGFloat(ins.line) + 0.5) * cell, y: origin.y + (CGFloat(Board.size) - 0.5) * cell)
        case 3: return CGPoint(x: origin.x + 0.5 * cell, y: origin.y + (CGFloat(ins.line) + 0.5) * cell)
        default: return CGPoint(x: origin.x + (CGFloat(Board.size) - 0.5) * cell, y: origin.y + (CGFloat(ins.line) + 0.5) * cell)
        }
    }
    private func arrowAngle(_ side: Int) -> Double {
        switch side { case 0: return 0; case 2: return 180; case 3: return 270; default: return 90 }
    }
}
