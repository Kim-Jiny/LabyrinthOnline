//  TileView.swift
//  라비린스 — 단일 미로 타일 렌더링. 도형+회전에 따라 통로(열린 방향)를 그린다.

import SwiftUI

struct TileView: View {
    let tile: Tile
    var highlighted: Bool = false   // 이동 가능 칸 강조
    var insertable: Bool = false    // 삽입 미리보기(여분 타일)

    private let wall = Color(red: 0.10, green: 0.12, blue: 0.16)
    private let path = Color(red: 0.86, green: 0.78, blue: 0.58)

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            let arm = s * 0.34          // 통로 폭 절반
            let cx = s / 2, cy = s / 2

            ZStack {
                RoundedRectangle(cornerRadius: s * 0.06)
                    .fill(wall)

                // 통로: 중앙 허브 + 열린 방향 팔
                Path { p in
                    // 중앙 허브
                    p.addRect(CGRect(x: cx - arm, y: cy - arm, width: arm * 2, height: arm * 2))
                    for dir in tile.openings {
                        switch dir {
                        case 0: p.addRect(CGRect(x: cx - arm, y: 0, width: arm * 2, height: cy)) // N
                        case 1: p.addRect(CGRect(x: cx, y: cy - arm, width: cx, height: arm * 2)) // E
                        case 2: p.addRect(CGRect(x: cx - arm, y: cy, width: arm * 2, height: cy)) // S
                        default: p.addRect(CGRect(x: 0, y: cy - arm, width: cx, height: arm * 2))  // W
                        }
                    }
                }
                .fill(path)

                // 보물
                if tile.treasure > 0 {
                    TreasureGem(id: tile.treasure)
                        .frame(width: s * 0.32, height: s * 0.32)
                }

                if highlighted {
                    RoundedRectangle(cornerRadius: s * 0.06)
                        .stroke(Color.green, lineWidth: s * 0.06)
                }
                if insertable {
                    RoundedRectangle(cornerRadius: s * 0.06)
                        .stroke(Color.yellow, lineWidth: s * 0.05)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

/// 보물 표시(ID별 색/기호). 실제 아트는 추후 에셋으로 교체.
struct TreasureGem: View {
    let id: Int
    private let palette: [Color] = [.red, .orange, .yellow, .green, .mint, .teal,
                                    .cyan, .blue, .indigo, .purple, .pink, .brown]
    var body: some View {
        ZStack {
            Circle().fill(palette[id % palette.count]).opacity(0.9)
            Text("\(id)")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
        }
        .shadow(radius: 1)
    }
}
