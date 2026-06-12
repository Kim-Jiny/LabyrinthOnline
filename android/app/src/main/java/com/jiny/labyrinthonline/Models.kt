package com.jiny.labyrinthonline

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * 서버 `LabyrinthSnapshot`(games/labyrinth/types.ts)과 1:1 대응하는 모델.
 * 게임 규칙은 서버 권위. 클라이언트는 상태를 렌더링하고 입력만 보낸다.
 */

@Serializable
enum class TileShape {
    @SerialName("STRAIGHT") STRAIGHT,
    @SerialName("CORNER") CORNER,
    @SerialName("TJUNCTION") TJUNCTION,
}

@Serializable
data class Tile(
    val shape: TileShape,
    val rotation: Int,   // 0..3 시계방향 90도
    val treasure: Int,   // 0=없음, 1..24
) {
    /** 회전 적용된 열린 방향(N=0,E=1,S=2,W=3). 서버 BASE_OPENINGS와 동일. */
    val openings: List<Int>
        get() {
            val base = when (shape) {
                TileShape.STRAIGHT -> listOf(0, 2)
                TileShape.CORNER -> listOf(0, 1)
                TileShape.TJUNCTION -> listOf(0, 1, 2)
            }
            return base.map { (it + rotation) % 4 }
        }

    fun isOpen(dir: Int): Boolean = openings.contains(dir)
}

@Serializable
enum class Phase {
    @SerialName("INSERT") INSERT,
    @SerialName("MOVE") MOVE,
    @SerialName("FINISHED") FINISHED,
}

@Serializable
data class PublicPlayer(
    val index: Int,
    val nickname: String,
    val isBot: Boolean,
    val home: String,
    val pos: Int,
    val totalCards: Int,
    val collected: Int,
    val currentTarget: Int? = null, // 본인 시점에서만 채워짐
    val connected: Boolean,
)

@Serializable
data class LabyrinthSnapshot(
    val board: List<Tile>,
    val spare: Tile,
    val phase: Phase,
    val currentPlayer: Int,
    val players: List<PublicPlayer>,
    val lastInsertionId: Int? = null,
    val forbiddenInsertionId: Int? = null,
    val winner: Int? = null,
    val turn: Int,
)

@Serializable
data class RoomSeat(
    val seat: Int,
    val nickname: String,
    val isBot: Boolean,
    val connected: Boolean,
    val userId: Int? = null,
)

@Serializable
data class RoomInfo(
    val code: String,
    val status: String,
    val maxPlayers: Int,
    val seats: List<RoomSeat>,
)

@Serializable
data class TurnInfo(
    val currentPlayer: Int,
    val phase: Phase,
    val deadline: Double? = null,
)

@Serializable
data class Standing(val seat: Int, val placement: Int, val nickname: String, val collected: Int)

@Serializable
data class GameOver(
    val winner: Int? = null,
    val winnerNickname: String? = null,
    val standings: List<Standing>,
    val turnCount: Int,
)

// 서버 lab:inserted / lab:moved 페이로드에서 상태만 추출
@Serializable
data class StatePayload(val state: LabyrinthSnapshot)

@Serializable
data class ChatMessage(
    val nickname: String,
    val seat: Int? = null,
    val text: String,
    val ts: Double,
)

// 인증 ---------------------------------------------------------------
@Serializable
data class LabUser(
    val id: Int,
    val loginId: String? = null,
    val nickname: String,
    val chatEnabled: Boolean,
    val hasPassword: Boolean,
    val socials: List<String> = emptyList(),
)

@Serializable
data class AuthResponse(val token: String? = null, val user: LabUser)

@Serializable
data class MeResponse(val user: LabUser)

@Serializable
data class ApiError(val error: String)

// 전적
@Serializable
data class LabStats(
    val gamesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val treasuresCollected: Int,
    val bestTurns: Int? = null,
    val elo: Int,
)
@Serializable
data class StatsResponse(val stats: LabStats? = null)
@Serializable
data class LeaderboardEntry(val userId: Int, val nickname: String, val wins: Int, val gamesPlayed: Int)
@Serializable
data class LeaderboardResponse(val leaderboard: List<LeaderboardEntry> = emptyList())

/** 보드 상수 (서버와 동일) */
object Board {
    const val SIZE = 7
    const val CELL_COUNT = 49

    fun row(index: Int) = index / SIZE
    fun col(index: Int) = index % SIZE
    fun idx(r: Int, c: Int) = r * SIZE + c

    data class Insertion(val id: Int, val side: Int, val line: Int) // side: N0 E1 S2 W3
    val insertions = listOf(
        Insertion(0, 0, 1), Insertion(1, 0, 3), Insertion(2, 0, 5),
        Insertion(3, 2, 1), Insertion(4, 2, 3), Insertion(5, 2, 5),
        Insertion(6, 3, 1), Insertion(7, 3, 3), Insertion(8, 3, 5),
        Insertion(9, 1, 1), Insertion(10, 1, 3), Insertion(11, 1, 5),
    )
}
