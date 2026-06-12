//  SocketService.swift
//  라비린스 — 서버 `/labyrinth` 네임스페이스와의 실시간 통신.
//
//  의존성: Socket.IO-Client-Swift (https://github.com/socketio/socket.io-client-swift)
//  Swift Package Manager 로 추가. project.yml 에 명시되어 있다.
//
//  서버 이벤트(lab:*)를 수신해 GameViewModel 로 전달하고, 사용자 액션을 전송한다.

import Foundation
import SocketIO

/// 서버 베이스 URL. 운영 시 Nginx 가 /labyrinth 업그레이드를 프록시한다.
/// 개발은 로컬 서버(기본 3000). Info.plist 의 LAB_SERVER_URL 로 덮어쓸 수 있다.
enum ServerConfig {
    static var baseURL: URL {
        if let s = Bundle.main.object(forInfoDictionaryKey: "LAB_SERVER_URL") as? String,
           let u = URL(string: s) { return u }
        return URL(string: "http://localhost:3000")!
    }
}

@MainActor
final class SocketService {
    static let shared = SocketService()

    private var manager: SocketManager?
    private var socket: SocketIOClient?

    /// 서버에서 오는 이벤트를 ViewModel 로 흘려보내는 콜백들.
    var onRoom: ((RoomInfo) -> Void)?
    var onState: ((LabyrinthSnapshot) -> Void)?
    var onTurn: ((TurnInfo) -> Void)?
    var onGameOver: ((GameOver) -> Void)?
    var onError: ((String) -> Void)?
    var onCreated: ((String) -> Void)?
    var onJoined: ((String) -> Void)?
    var onConnected: (() -> Void)?
    var onChatMessage: ((ChatMessage) -> Void)?
    var onQueued: ((Int, Int, Int) -> Void)?   // size, waiting, need
    var onPaused: (([Int]) -> Void)?           // disconnected seats
    var onResumed: (() -> Void)?
    var onAborted: (() -> Void)?

    private let decoder = JSONDecoder()

    /// JWT 토큰(듀오 로그인 재사용). 없으면 게스트(봇 연습).
    func connect(token: String?, nickname: String?) {
        let auth: [String: Any] = {
            var a: [String: Any] = [:]
            if let token { a["token"] = token }
            if let nickname { a["nickname"] = nickname }
            return a
        }()

        let manager = SocketManager(
            socketURL: ServerConfig.baseURL,
            config: [.log(false), .compress, .forceWebsockets(true), .connectParams([:])]
        )
        self.manager = manager
        // 네임스페이스 소켓 + 핸드셰이크 auth
        let socket = manager.socket(forNamespace: "/labyrinth")
        socket.setReconnecting(reconnects: true)
        self.socket = socket

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            self?.onConnected?()
        }
        bind("lab:room", onRoom)
        bind("lab:state") { [weak self] (snap: LabyrinthSnapshot) in self?.onState?(snap) }
        bind("lab:turn") { [weak self] (t: TurnInfo) in self?.onTurn?(t) }
        bind("lab:gameover") { [weak self] (g: GameOver) in self?.onGameOver?(g) }
        bind("lab:inserted") { [weak self] (p: InsertedPayload) in self?.onState?(p.state) }
        bind("lab:moved") { [weak self] (p: MovedPayload) in self?.onState?(p.state) }
        bind("lab:chatMessage") { [weak self] (m: ChatMessage) in self?.onChatMessage?(m) }

        socket.on("lab:queued") { [weak self] data, _ in
            let d = data.first as? [String: Any]
            self?.onQueued?(d?["size"] as? Int ?? 2, d?["waiting"] as? Int ?? 1, d?["need"] as? Int ?? 2)
        }
        socket.on("lab:queueUpdate") { [weak self] data, _ in
            let d = data.first as? [String: Any]
            self?.onQueued?(d?["size"] as? Int ?? 2, d?["waiting"] as? Int ?? 1, d?["need"] as? Int ?? 2)
        }
        socket.on("lab:paused") { [weak self] data, _ in
            let d = data.first as? [String: Any]
            self?.onPaused?(d?["disconnectedSeats"] as? [Int] ?? [])
        }
        socket.on("lab:resumed") { [weak self] _, _ in self?.onResumed?() }
        socket.on("lab:aborted") { [weak self] _, _ in self?.onAborted?() }

        socket.on("lab:error") { [weak self] data, _ in
            if let dict = data.first as? [String: Any], let code = dict["code"] as? String {
                self?.onError?(code)
            }
        }
        socket.on("lab:created") { [weak self] data, _ in
            if let d = data.first as? [String: Any], let c = d["code"] as? String { self?.onCreated?(c) }
        }
        socket.on("lab:joined") { [weak self] data, _ in
            if let d = data.first as? [String: Any], let c = d["code"] as? String { self?.onJoined?(c) }
        }
        socket.on("lab:started") { [weak self] data, _ in
            if let d = data.first as? [String: Any], let c = d["code"] as? String { self?.onJoined?(c) }
        }
        // auth 를 매니저 옵션으로 넘긴 후 connect
        manager.config.insert(.connectParams(auth))
        socket.connect(withPayload: auth)
    }

    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
    }

    // MARK: 전송

    func createRoom(maxPlayers: Int) { socket?.emit("lab:create", ["maxPlayers": maxPlayers]) }
    func joinRoom(code: String) { socket?.emit("lab:join", ["code": code]) }
    func addBot(difficulty: String = "normal") { socket?.emit("lab:addBot", ["difficulty": difficulty]) }
    func start() { socket?.emit("lab:start") }
    func quickMatch(size: Int) { socket?.emit("lab:quickmatch", ["size": size]) }
    func cancelQuick() { socket?.emit("lab:cancelQuick") }
    func leave() { socket?.emit("lab:leave") }
    func reconnectRoom(code: String) { socket?.emit("lab:reconnect", ["code": code]) }

    func insert(insertionId: Int, rotation: Int) {
        socket?.emit("lab:insert", ["insertionId": insertionId, "rotation": rotation])
    }
    func move(to: Int) { socket?.emit("lab:move", ["to": to]) }
    func sendChat(_ text: String) { socket?.emit("lab:chat", ["text": text]) }

    // MARK: 디코딩 헬퍼

    private func bind<T: Decodable>(_ event: String, _ handler: @escaping (T) -> Void) {
        socket?.on(event) { [weak self] data, _ in
            guard let self, let first = data.first,
                  let value: T = self.decode(first) else { return }
            handler(value)
        }
    }
    private func bind(_ event: String, _ handler: ((RoomInfo) -> Void)?) {
        socket?.on(event) { [weak self] data, _ in
            guard let self, let first = data.first,
                  let value: RoomInfo = self.decode(first) else { return }
            handler?(value)
        }
    }
    private func decode<T: Decodable>(_ any: Any) -> T? {
        guard let dict = any as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: dict) else { return nil }
        return try? decoder.decode(T.self, from: data)
    }
}

// 서버 lab:inserted / lab:moved 페이로드(상태만 추려 사용)
private struct InsertedPayload: Decodable { let state: LabyrinthSnapshot }
private struct MovedPayload: Decodable { let state: LabyrinthSnapshot }
