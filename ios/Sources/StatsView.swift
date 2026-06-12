//  StatsView.swift
//  라비린스 — 내 전적 + 리더보드. 서버 /api/lab/stats/* 조회.

import SwiftUI

struct LabStats: Codable {
    let gamesPlayed: Int
    let wins: Int
    let losses: Int
    let treasuresCollected: Int
    let bestTurns: Int?
    let elo: Int
}
struct LeaderboardEntry: Codable, Identifiable {
    let userId: Int
    let nickname: String
    let wins: Int
    let gamesPlayed: Int
    var id: Int { userId }
}

struct StatsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var stats: LabStats?
    @State private var leaderboard: [LeaderboardEntry] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            List {
                Section("내 전적") {
                    if let s = stats {
                        row("게임 수", "\(s.gamesPlayed)")
                        row("승 / 패", "\(s.wins) / \(s.losses)")
                        row("승률", s.gamesPlayed > 0 ? "\(Int(Double(s.wins) / Double(s.gamesPlayed) * 100))%" : "-")
                        row("모은 보물", "\(s.treasuresCollected)")
                        row("최소 턴 우승", s.bestTurns.map { "\($0)턴" } ?? "-")
                    } else if loading {
                        ProgressView()
                    } else {
                        Text("전적이 없습니다.").foregroundStyle(.secondary)
                    }
                }
                Section("랭킹 (승수)") {
                    ForEach(Array(leaderboard.enumerated()), id: \.element.id) { i, e in
                        HStack {
                            Text("\(i + 1)").bold().frame(width: 28)
                            Text(e.nickname)
                            Spacer()
                            Text("\(e.wins)승").foregroundStyle(.secondary)
                        }
                    }
                    if leaderboard.isEmpty && !loading {
                        Text("아직 랭킹이 없습니다.").foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("전적")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("닫기") { dismiss() } } }
            .task { await load() }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k); Spacer(); Text(v).foregroundStyle(.secondary) }
    }

    private func load() async {
        defer { loading = false }
        if let token = AuthService.shared.token,
           let s: StatsResponse = try? await get("/api/lab/stats/me", token: token) {
            stats = s.stats
        }
        if let l: LeaderboardResponse = try? await get("/api/lab/stats/leaderboard", token: nil) {
            leaderboard = l.leaderboard
        }
    }

    private struct StatsResponse: Codable { let stats: LabStats? }
    private struct LeaderboardResponse: Codable { let leaderboard: [LeaderboardEntry] }

    private func get<T: Decodable>(_ path: String, token: String?) async throws -> T {
        var req = URLRequest(url: ServerConfig.baseURL.appendingPathComponent(path))
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
