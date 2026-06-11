//  GameViewModel.swift
//  라비린스 — 화면 상태 관리. 서버 스냅샷을 받아 SwiftUI 뷰에 게시한다.
//
//  내 좌석(mySeat)은 서버 스냅샷의 players[*].currentTarget 가 채워진 좌석으로 추론한다
//  (서버가 본인 시점에서만 목표 보물을 노출하기 때문). 게스트/봇뷰어 대비.

import Foundation
import Combine

@MainActor
final class GameViewModel: ObservableObject {
    enum Screen { case lobby, room, game, result }

    @Published var screen: Screen = .lobby
    @Published var roomInfo: RoomInfo?
    @Published var snapshot: LabyrinthSnapshot?
    @Published var turn: TurnInfo?
    @Published var gameOver: GameOver?
    @Published var errorMessage: String?
    @Published var connected = false

    // 삽입 단계 임시 선택(회전 미리보기)
    @Published var pendingRotation: Int = 0
    @Published var selectedInsertion: Int?

    private let service = SocketService.shared

    /// 내 좌석 추론: currentTarget 가 non-nil 인 플레이어 = 나.
    var mySeat: Int? {
        snapshot?.players.first(where: { $0.currentTarget != nil })?.index
    }
    var isMyTurn: Bool {
        guard let s = snapshot, let me = mySeat else { return false }
        return s.currentPlayer == me && s.phase != .finished
    }
    var spareRotationPreview: Int {
        guard let spare = snapshot?.spare else { return 0 }
        return selectedInsertion != nil ? pendingRotation : spare.rotation
    }

    func bind() {
        service.onConnected = { [weak self] in self?.connected = true }
        service.onRoom = { [weak self] in self?.roomInfo = $0; self?.screen = .room }
        service.onState = { [weak self] snap in
            self?.snapshot = snap
            if snap.phase == .finished { return }
            if self?.screen != .game { self?.screen = .game }
        }
        service.onTurn = { [weak self] in
            self?.turn = $0
            // 새 턴이면 회전 선택 초기화
            self?.selectedInsertion = nil
            self?.pendingRotation = self?.snapshot?.spare.rotation ?? 0
        }
        service.onGameOver = { [weak self] in self?.gameOver = $0; self?.screen = .result }
        service.onError = { [weak self] in self?.errorMessage = $0 }
        service.onCreated = { _ in }
        service.onJoined = { _ in }
    }

    // MARK: 액션

    func connect(token: String?, nickname: String?) {
        bind()
        service.connect(token: token, nickname: nickname)
    }
    func createRoom(maxPlayers: Int) { service.createRoom(maxPlayers: maxPlayers) }
    func joinRoom(code: String) { service.joinRoom(code: code.uppercased()) }
    func addBot() { service.addBot() }
    func start() { service.start() }
    func quickMatch() { service.quickMatch() }
    func leave() { service.leave(); screen = .lobby; snapshot = nil; roomInfo = nil }

    /// 삽입 지점 탭: 처음 탭이면 선택, 같은 지점 재탭이면 회전.
    func tapInsertion(_ id: Int) {
        guard isMyTurn, snapshot?.phase == .insert else { return }
        if selectedInsertion == id {
            pendingRotation = (pendingRotation + 1) % 4
        } else {
            selectedInsertion = id
            pendingRotation = snapshot?.spare.rotation ?? 0
        }
    }
    /// 선택한 삽입 확정
    func confirmInsertion() {
        guard isMyTurn, let id = selectedInsertion else { return }
        service.insert(insertionId: id, rotation: pendingRotation)
        selectedInsertion = nil
    }
    func rotateSpare() {
        guard isMyTurn, snapshot?.phase == .insert else { return }
        pendingRotation = (pendingRotation + 1) % 4
    }
    func moveTo(_ index: Int) {
        guard isMyTurn, snapshot?.phase == .move else { return }
        service.move(to: index)
    }
}
