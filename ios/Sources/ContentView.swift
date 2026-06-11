//  ContentView.swift
//  라비린스 — 화면 라우팅 + 로비/대기실/게임/결과.

import SwiftUI

struct ContentView: View {
    @StateObject private var vm = GameViewModel()

    var body: some View {
        ZStack {
            switch vm.screen {
            case .lobby:  LobbyView(vm: vm)
            case .room:   RoomView(vm: vm)
            case .game:   GameScreen(vm: vm)
            case .result: ResultView(vm: vm)
            }
        }
        .onAppear {
            // TODO: 듀오 로그인 토큰을 Keychain 에서 읽어 전달. 우선 게스트로 연결.
            vm.connect(token: nil, nickname: UIDevice.current.name)
        }
        .alert("오류", isPresented: .constant(vm.errorMessage != nil)) {
            Button("확인") { vm.errorMessage = nil }
        } message: {
            Text(errorText(vm.errorMessage ?? ""))
        }
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
    @State private var joinCode = ""

    var body: some View {
        VStack(spacing: 24) {
            Text("라비린스").font(.system(size: 40, weight: .heavy, design: .rounded))
            Text(vm.connected ? "● 서버 연결됨" : "○ 연결 중…")
                .font(.caption).foregroundStyle(vm.connected ? .green : .secondary)

            Button { vm.quickMatch() } label: {
                Label("빠른 대전 (2인)", systemImage: "bolt.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

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

    var body: some View {
        VStack(spacing: 12) {
            header
            BoardView(vm: vm)
                .padding(.horizontal, 8)
            controls
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
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
