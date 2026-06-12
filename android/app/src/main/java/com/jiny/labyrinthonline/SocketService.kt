package com.jiny.labyrinthonline

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.net.URI

/*
 * 서버 `/labyrinth` 네임스페이스 실시간 통신.
 * 의존성: io.socket:socket.io-client. 인증은 듀오 JWT(handshake auth) 재사용.
 */
class SocketService {

    private var socket: Socket? = null
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    // ViewModel 이 설정하는 콜백(메인 스레드 보장은 ViewModel 쪽에서)
    var onRoom: ((RoomInfo) -> Unit)? = null
    var onState: ((LabyrinthSnapshot) -> Unit)? = null
    var onTurn: ((TurnInfo) -> Unit)? = null
    var onGameOver: ((GameOver) -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var onConnected: (() -> Unit)? = null
    var onChatMessage: ((ChatMessage) -> Unit)? = null
    var onQueued: ((size: Int, waiting: Int, need: Int) -> Unit)? = null
    var onPaused: (() -> Unit)? = null
    var onResumed: (() -> Unit)? = null
    var onAborted: (() -> Unit)? = null

    fun connect(token: String?, nickname: String?) {
        val opts = IO.Options().apply {
            forceNew = true
            reconnection = true
            transports = arrayOf("websocket")
            auth = buildMap {
                if (token != null) put("token", token)
                if (nickname != null) put("nickname", nickname)
            }
        }
        // 네임스페이스는 URL 경로로 지정
        val uri = URI.create(BuildConfig.SERVER_URL + "/labyrinth")
        val s = IO.socket(uri, opts)
        socket = s

        s.on(Socket.EVENT_CONNECT) { onConnected?.invoke() }
        s.on("lab:room") { args -> obj(args)?.let { decode<RoomInfo>(it)?.let { v -> onRoom?.invoke(v) } } }
        s.on("lab:state") { args -> obj(args)?.let { decode<LabyrinthSnapshot>(it)?.let { v -> onState?.invoke(v) } } }
        s.on("lab:turn") { args -> obj(args)?.let { decode<TurnInfo>(it)?.let { v -> onTurn?.invoke(v) } } }
        s.on("lab:gameover") { args -> obj(args)?.let { decode<GameOver>(it)?.let { v -> onGameOver?.invoke(v) } } }
        s.on("lab:inserted") { args -> obj(args)?.let { decode<StatePayload>(it)?.let { v -> onState?.invoke(v.state) } } }
        s.on("lab:moved") { args -> obj(args)?.let { decode<StatePayload>(it)?.let { v -> onState?.invoke(v.state) } } }
        s.on("lab:chatMessage") { args -> obj(args)?.let { decode<ChatMessage>(it)?.let { v -> onChatMessage?.invoke(v) } } }
        val queueHandler = { args: Array<Any?> ->
            obj(args)?.let { onQueued?.invoke(it.optInt("size", 2), it.optInt("waiting", 1), it.optInt("need", 2)); Unit } ?: Unit
        }
        s.on("lab:queued", queueHandler)
        s.on("lab:queueUpdate", queueHandler)
        s.on("lab:paused") { _ -> onPaused?.invoke() }
        s.on("lab:resumed") { _ -> onResumed?.invoke() }
        s.on("lab:aborted") { _ -> onAborted?.invoke() }
        s.on("lab:error") { args ->
            obj(args)?.optString("code")?.takeIf { it.isNotEmpty() }?.let { onError?.invoke(it) }
        }
        s.connect()
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }

    // 전송
    fun createRoom(maxPlayers: Int) = socket?.emit("lab:create", JSONObject().put("maxPlayers", maxPlayers))
    fun joinRoom(code: String) = socket?.emit("lab:join", JSONObject().put("code", code))
    fun addBot(difficulty: String = "normal") = socket?.emit("lab:addBot", JSONObject().put("difficulty", difficulty))
    fun start() = socket?.emit("lab:start")
    fun quickMatch(size: Int) = socket?.emit("lab:quickmatch", JSONObject().put("size", size))
    fun cancelQuick() = socket?.emit("lab:cancelQuick")
    fun leave() = socket?.emit("lab:leave")
    fun reconnectRoom(code: String) = socket?.emit("lab:reconnect", JSONObject().put("code", code))
    fun insert(insertionId: Int, rotation: Int) =
        socket?.emit("lab:insert", JSONObject().put("insertionId", insertionId).put("rotation", rotation))
    fun move(to: Int) = socket?.emit("lab:move", JSONObject().put("to", to))
    fun sendChat(text: String) = socket?.emit("lab:chat", JSONObject().put("text", text))

    // 헬퍼
    private fun obj(args: Array<Any?>): JSONObject? = args.firstOrNull() as? JSONObject
    private inline fun <reified T> decode(o: JSONObject): T? =
        try { json.decodeFromString<T>(o.toString()) } catch (e: Exception) { null }
}
