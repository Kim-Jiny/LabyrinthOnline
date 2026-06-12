//  ContentView.swift
//  라비린스 — 화면 라우팅 + 로비/대기실/게임/결과.

import SwiftUI

struct ContentView: View {
    @StateObject private var vm = GameViewModel()
    @ObservedObject private var auth = AuthService.shared
    @State private var didConnect = false

    var body: some View {
        Group {
            if auth.isAuthenticated {
                ZStack {
                    switch vm.screen {
                    case .lobby:  LobbyView(vm: vm, auth: auth)
                    case .room:   RoomView(vm: vm)
                    case .game:   GameScreen(vm: vm)
                    case .result: ResultView(vm: vm)
                    }
                }
                .onAppear { connectIfNeeded() }
            } else {
                LoginView(auth: auth)
            }
        }
        .task { await auth.restoreSession() }
        .onChange(of: auth.isAuthenticated) { authed in
            if authed { connectIfNeeded() }
        }
        .alert("오류", isPresented: .constant(vm.errorMessage != nil)) {
            Button("확인") { vm.errorMessage = nil }
        } message: {
            Text(errorText(vm.errorMessage ?? ""))
        }
    }

    private func connectIfNeeded() {
        guard auth.isAuthenticated, !didConnect else { return }
        didConnect = true
        vm.connect(token: auth.token, nickname: auth.user?.nickname)
    }

    private func errorText(_ code: String) -> String {
        switch code {
        case "ROOM_NOT_FOUND": return "방을 찾을 수 없습니다."
        case "ROOM_FULL": return "방이 가득 찼습니다."
        case "ALREADY_STARTED": return "이미 시작된 게임입니다."
        case "FORBIDDEN_REVERSE": return "직전 삽입을 되돌리는 수는 둘 수 없습니다."
        case "UNREACHABLE": return "그 칸으로는 갈 수 없습니다."
        case "NEED_2_PLAYERS": return "최소 2명이 필요합니다."
        default: return code
        }
    }
}

// MARK: - 로비

struct LobbyView: View {
    @ObservedObject var vm: GameViewModel
    @ObservedObject var auth: AuthService
    @State private var joinCode = ""
    @State private var quickSize = 2
    @State private var showStats = false

    var body: some View {
        VStack(spacing: 24) {
            // 계정 헤더
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.user?.nickname ?? "").font(.headline)
                    Text(auth.canChat ? "💬 채팅 사용 가능" : "🔒 소셜 연동 시 채팅 가능")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Button { showStats = true } label: { Image(systemName: "chart.bar.fill") }
                Button("로그아웃") { auth.signOut() }.font(.caption)
            }
            .sheet(isPresented: $showStats) { StatsView() }

            Text("라비린스").font(.system(size: 40, weight: .heavy, design: .rounded))
            Text(vm.connected ? "● 서버 연결됨" : "○ 연결 중…")
                .font(.caption).foregroundStyle(vm.connected ? .green : .secondary)

            if vm.queuing {
                VStack(spacing: 8) {
                    ProgressView()
                    Text("상대를 찾는 중… (\(vm.queueWaiting)/\(vm.queueNeed))")
                        .font(.subheadline)
                    Button("취소") { vm.cancelQuick() }.font(.caption)
                }
                .padding(.vertical, 8)
            } else {
                Picker("인원", selection: $quickSize) {
                    Text("2인").tag(2); Text("3인").tag(3); Text("4인").tag(4)
                }
                .pickerStyle(.segmented)
                Button { vm.quickMatch(size: quickSize) } label: {
                    Label("빠른 대전 시작", systemImage: "bolt.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }

            Button { vm.createRoom(maxPlayers: 4) } label: {
                Label("방 만들기", systemImage: "plus.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            HStack {
                TextField("입장 코드", text: $joinCode)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.characters)
                Button("입장") { vm.joinRoom(code: joinCode) }
                    .disabled(joinCode.count < 4)
            }
        }
        .padding(32)
    }
}

// MARK: - 대기실

struct RoomView: View {
    @ObservedObject var vm: GameViewModel

    var body: some View {
        VStack(spacing: 16) {
            if let room = vm.roomInfo {
                Text("방 코드").font(.caption).foregroundStyle(.secondary)
                Text(room.code).font(.system(size: 34, weight: .bold, design: .monospaced))

                List(room.seats) { seat in
                    HStack {
                        Image(systemName: seat.isBot ? "cpu" : "person.fill")
                        Text(seat.nickname)
                        Spacer()
                        Circle().fill(seat.connected ? .green : .gray).frame(width: 8, height: 8)
                    }
                }
                .frame(maxHeight: 240)

                HStack {
                    Button("봇 추가") { vm.addBot() }
                        .buttonStyle(.bordered)
                        .disabled(room.seats.count >= room.maxPlayers)
                    Button("시작") { vm.start() }
                        .buttonStyle(.borderedProminent)
                        .disabled(room.seats.count < 2)
                }
                Button("나가기", role: .destructive) { vm.leave() }
            } else {
                ProgressView()
            }
        }
        .padding(24)
    }
}

// MARK: - 게임

struct GameScreen: View {
    @ObservedObject var vm: GameViewModel
    @ObservedObject private var auth = AuthService.shared
    @State private var showChat = false

    var body: some View {
        VStack(spacing: 12) {
            header
            if let deadline = vm.turn?.deadline { TurnTimerBar(deadlineMs: deadline) }
            BoardView(vm: vm)
                .padding(.horizontal, 8)
            controls
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .overlay {
            if vm.paused {
                ZStack {
                    Color.black.opacity(0.5).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView().tint(.white)
                        Text("상대방 재연결을 기다리는 중…").foregroundStyle(.white)
                    }
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            Button { showChat = true } label: {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .padding(14)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(alignment: .topTrailing) {
                        if !vm.chatMessages.isEmpty {
                            Circle().fill(.red).frame(width: 8, height: 8)
                        }
                    }
            }
            .padding(20)
        }
        .sheet(isPresented: $showChat) {
            ChatView(vm: vm, canChat: auth.canChat)
        }
    }

    private var header: some View {
        HStack {
            if let snap = vm.snapshot {
                let cur = snap.players.first(where: { $0.index == snap.currentPlayer })
                VStack(alignment: .leading) {
                    Text(vm.isMyTurn ? "내 차례" : "\(cur?.nickname ?? "")의 차례")
                        .font(.headline)
                        .foregroundStyle(vm.isMyTurn ? .green : .primary)
                    Text(snap.phase == .insert ? "① 타일을 밀어넣으세요" : "② 말을 이동하세요")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if let me = vm.mySeat {
                    let p = snap.players[me]
                    VStack(alignment: .trailing) {
                        Text("보물 \(p.collected)/\(p.totalCards)").font(.subheadline)
                        if let t = p.currentTarget {
                            HStack(spacing: 4) {
                                Text("목표").font(.caption2)
                                TreasureGem(id: t).frame(width: 20, height: 20)
                            }
                        } else {
                            Text("🏠 홈으로 귀환!").font(.caption).foregroundStyle(.orange)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var controls: some View {
        if vm.isMyTurn, vm.snapshot?.phase == .insert {
            HStack {
                Button { vm.rotateSpare() } label: {
                    Label("회전", systemImage: "rotate.right")
                }
                .buttonStyle(.bordered)
                .disabled(vm.selectedInsertion == nil)

                Button { vm.confirmInsertion() } label: {
                    Label("밀어넣기 확정", systemImage: "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.selectedInsertion == nil)
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - 턴 타이머 바

struct TurnTimerBar: View {
    let deadlineMs: Double   // 서버 epoch ms

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let remaining = max(0, deadlineMs / 1000 - context.date.timeIntervalSince1970)
            let total = 60.0
            VStack(spacing: 2) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.gray.opacity(0.2))
                        Capsule()
                            .fill(remaining < 10 ? Color.red : Color.accentColor)
                            .frame(width: geo.size.width * min(1, remaining / total))
                    }
                }
                .frame(height: 6)
                Text("\(Int(remaining))초").font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - 결과

struct ResultView: View {
    @ObservedObject var vm: GameViewModel

    var body: some View {
        VStack(spacing: 20) {
            Text("게임 종료").font(.largeTitle.bold())
            if let go = vm.gameOver {
                Text("🏆 \(go.winnerNickname ?? "무승부")")
                    .font(.title2).foregroundStyle(.orange)
                Text("\(go.turnCount)턴").foregroundStyle(.secondary)
                List(go.standings, id: \.seat) { s in
                    HStack {
                        Text("\(s.placement)위").bold()
                        Text(s.nickname)
                        Spacer()
                        Text("보물 \(s.collected)")
                    }
                }
                .frame(maxHeight: 260)
            }
            Button("로비로") { vm.leave() }
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
    }
}
