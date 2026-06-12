package com.jiny.labyrinthonline

import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

/*
 * 화면 상태 관리. 서버 스냅샷을 받아 Compose state 로 노출한다.
 * 내 좌석(mySeat)은 currentTarget 가 채워진 좌석으로 추론(서버가 본인 시점에만 노출).
 */
enum class Screen { LOBBY, ROOM, GAME, RESULT }

class GameViewModel : ViewModel() {
    private val service = SocketService()
    private val main = Handler(Looper.getMainLooper())

    var screen by mutableStateOf(Screen.LOBBY); private set
    var roomInfo by mutableStateOf<RoomInfo?>(null); private set
    var snapshot by mutableStateOf<LabyrinthSnapshot?>(null); private set
    var turn by mutableStateOf<TurnInfo?>(null); private set
    var gameOver by mutableStateOf<GameOver?>(null); private set
    var errorMessage by mutableStateOf<String?>(null)
    var connected by mutableStateOf(false); private set
    val chatMessages = mutableStateListOf<ChatMessage>()
    var queuing by mutableStateOf(false); private set
    var queueWaiting by mutableStateOf(0); private set
    var queueNeed by mutableStateOf(0); private set
    var paused by mutableStateOf(false); private set

    // 삽입 단계 임시 선택
    var selectedInsertion by mutableStateOf<Int?>(null); private set
    var pendingRotation by mutableStateOf(0); private set

    val mySeat: Int?
        get() = snapshot?.players?.firstOrNull { it.currentTarget != null }?.index

    val isMyTurn: Boolean
        get() {
            val s = snapshot ?: return false
            val me = mySeat ?: return false
            return s.currentPlayer == me && s.phase != Phase.FINISHED
        }

    fun connect(token: String?, nickname: String?) {
        service.onConnected = { main.post { connected = true } }
        service.onRoom = { r -> main.post { roomInfo = r; screen = Screen.ROOM } }
        service.onState = { snap ->
            main.post {
                snapshot = snap
                queuing = false
                if (snap.phase != Phase.FINISHED && screen != Screen.GAME) screen = Screen.GAME
            }
        }
        service.onQueued = { _, waiting, need -> main.post { queuing = true; queueWaiting = waiting; queueNeed = need } }
        service.onPaused = { main.post { paused = true } }
        service.onResumed = { main.post { paused = false } }
        service.onAborted = { main.post { errorMessage = "GAME_ABORTED"; leave() } }
        service.onTurn = { t ->
            main.post {
                turn = t
                selectedInsertion = null
                pendingRotation = snapshot?.spare?.rotation ?: 0
            }
        }
        service.onGameOver = { g -> main.post { gameOver = g; screen = Screen.RESULT } }
        service.onChatMessage = { m -> main.post {
            chatMessages.add(m)
            if (chatMessages.size > 100) chatMessages.removeAt(0)
        } }
        service.onError = { code -> main.post { errorMessage = code } }
        service.connect(token, nickname ?: ("Android-" + Build.MODEL))
    }

    // 액션
    fun createRoom(maxPlayers: Int) { service.createRoom(maxPlayers) }
    fun joinRoom(code: String) { service.joinRoom(code.uppercase()) }
    fun addBot() { service.addBot() }
    fun start() { service.start() }
    fun quickMatch(size: Int) { queuing = true; service.quickMatch(size) }
    fun cancelQuick() { queuing = false; service.cancelQuick() }
    fun leave() { service.leave(); screen = Screen.LOBBY; snapshot = null; roomInfo = null; queuing = false; paused = false }

    fun tapInsertion(id: Int) {
        if (!isMyTurn || snapshot?.phase != Phase.INSERT) return
        if (selectedInsertion == id) {
            pendingRotation = (pendingRotation + 1) % 4
        } else {
            selectedInsertion = id
            pendingRotation = snapshot?.spare?.rotation ?: 0
        }
    }
    fun rotateSpare() {
        if (!isMyTurn || snapshot?.phase != Phase.INSERT) return
        pendingRotation = (pendingRotation + 1) % 4
    }
    fun confirmInsertion() {
        val id = selectedInsertion ?: return
        if (!isMyTurn) return
        service.insert(id, pendingRotation)
        selectedInsertion = null
    }
    fun moveTo(index: Int) {
        if (!isMyTurn || snapshot?.phase != Phase.MOVE) return
        service.move(index)
    }
    fun sendChat(text: String) {
        val t = text.trim()
        if (t.isNotEmpty()) service.sendChat(t)
    }

    override fun onCleared() { service.disconnect() }
}
