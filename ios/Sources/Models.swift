//  Models.swift
//  라비린스 (Labyrinth Online) — 서버 스냅샷과 1:1 대응하는 Codable 모델.
//
//  서버 권위(authoritative). 클라이언트는 규칙을 계산하지 않고 서버 상태를 그대로
//  렌더링한다. 필드명은 server `LabyrinthSnapshot`(games/labyrinth/types.ts)과 동일.

import Foundation

enum TileShape: String, Codable {
    case straight = "STRAIGHT"
    case corner = "CORNER"
    case tjunction = "TJUNCTION"
}

struct Tile: Codable, Equatable {
    let shape: TileShape
    let rotation: Int      // 0,1,2,3 (시계방향 90도)
    let treasure: Int      // 0 = 없음, 1~24 = 보물 ID

    /// 회전 적용된 열린 방향(N=0,E=1,S=2,W=3). 서버 BASE_OPENINGS와 동일.
    var openings: [Int] {
        let base: [Int]
        switch shape {
        case .straight: base = [0, 2]      // N,S
        case .corner: base = [0, 1]        // N,E
        case .tjunction: base = [0, 1, 2]  // N,E,S
        }
        return base.map { ($0 + rotation) % 4 }
    }
    func isOpen(_ dir: Int) -> Bool { openings.contains(dir) }
}

enum Phase: String, Codable {
    case insert = "INSERT"
    case move = "MOVE"
    case finished = "FINISHED"
}

struct PublicPlayer: Codable, Identifiable, Equatable {
    let index: Int
    let nickname: String
    let isBot: Bool
    let home: String        // TL|TR|BL|BR
    let pos: Int
    let totalCards: Int
    let collected: Int
    let currentTarget: Int? // 본인 시점에서만 채워짐
    let connected: Bool

    var id: Int { index }
}

struct LabyrinthSnapshot: Codable, Equatable {
    let board: [Tile]       // 49
    let spare: Tile
    let phase: Phase
    let currentPlayer: Int
    let players: [PublicPlayer]
    let lastInsertionId: Int?
    let forbiddenInsertionId: Int?
    let winner: Int?
    let turn: Int
}

// MARK: - 보드 상수 (서버와 동일)

enum Board {
    static let size = 7
    static let cellCount = 49

    static func rc(_ index: Int) -> (row: Int, col: Int) {
        (index / size, index % size)
    }
    static func idx(_ row: Int, _ col: Int) -> Int { row * size + col }

    /// 12개 삽입 지점 (서버 INSERTION_POINTS와 id/side/line 동일)
    struct Insertion: Identifiable {
        let id: Int
        let side: Int   // N=0 위→아래, E=1 우→좌, S=2 아래→위, W=3 좌→우
        let line: Int   // 영향 행/열 (1,3,5)
    }
    static let insertions: [Insertion] = [
        .init(id: 0, side: 0, line: 1), .init(id: 1, side: 0, line: 3), .init(id: 2, side: 0, line: 5),
        .init(id: 3, side: 2, line: 1), .init(id: 4, side: 2, line: 3), .init(id: 5, side: 2, line: 5),
        .init(id: 6, side: 3, line: 1), .init(id: 7, side: 3, line: 3), .init(id: 8, side: 3, line: 5),
        .init(id: 9, side: 1, line: 1), .init(id: 10, side: 1, line: 3), .init(id: 11, side: 1, line: 5),
    ]
}

// MARK: - 로비/대기실

struct RoomSeat: Codable, Identifiable, Equatable {
    let seat: Int
    let nickname: String
    let isBot: Bool
    let connected: Bool
    let userId: Int?
    var id: Int { seat }
}

struct RoomInfo: Codable, Equatable {
    let code: String
    let status: String
    let maxPlayers: Int
    let seats: [RoomSeat]
}

struct TurnInfo: Codable, Equatable {
    let currentPlayer: Int
    let phase: Phase
    let deadline: Double?
}

struct ChatMessage: Codable, Equatable, Identifiable {
    let nickname: String
    let seat: Int?
    let text: String
    let ts: Double
    var id: String { "\(ts)-\(nickname)-\(text.hashValue)" }
}

struct GameOver: Codable, Equatable {
    struct Standing: Codable, Equatable { let seat: Int; let placement: Int; let nickname: String; let collected: Int }
    let winner: Int?
    let winnerNickname: String?
    let standings: [Standing]
    let turnCount: Int
}
