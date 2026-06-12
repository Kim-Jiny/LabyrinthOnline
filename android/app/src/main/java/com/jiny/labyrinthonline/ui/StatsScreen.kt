package com.jiny.labyrinthonline.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jiny.labyrinthonline.AuthViewModel
import com.jiny.labyrinthonline.BuildConfig
import com.jiny.labyrinthonline.LabStats
import com.jiny.labyrinthonline.LeaderboardEntry
import com.jiny.labyrinthonline.LeaderboardResponse
import com.jiny.labyrinthonline.StatsResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

@Composable
fun StatsScreen(auth: AuthViewModel, onClose: () -> Unit) {
    val json = remember { Json { ignoreUnknownKeys = true } }
    var stats by remember { mutableStateOf<LabStats?>(null) }
    var leaderboard by remember { mutableStateOf<List<LeaderboardEntry>>(emptyList()) }

    LaunchedEffect(Unit) {
        stats = runCatching {
            json.decodeFromString<StatsResponse>(get("/api/lab/stats/me", auth.token)).stats
        }.getOrNull()
        leaderboard = runCatching {
            json.decodeFromString<LeaderboardResponse>(get("/api/lab/stats/leaderboard", null)).leaderboard
        }.getOrNull() ?: emptyList()
    }

    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("전적", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onClose) { Text("닫기") }
        }
        val s = stats
        if (s != null) {
            statRow("게임 수", "${s.gamesPlayed}")
            statRow("승 / 패", "${s.wins} / ${s.losses}")
            statRow("승률", if (s.gamesPlayed > 0) "${s.wins * 100 / s.gamesPlayed}%" else "-")
            statRow("모은 보물", "${s.treasuresCollected}")
            statRow("최소 턴 우승", s.bestTurns?.let { "${it}턴" } ?: "-")
        }
        Divider(Modifier.padding(vertical = 8.dp))
        Text("랭킹 (승수)", fontWeight = FontWeight.Bold)
        LazyColumn {
            itemsIndexed(leaderboard) { i, e ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${i + 1}", fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                    Text(e.nickname, Modifier.weight(1f))
                    Text("${e.wins}승", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun statRow(k: String, v: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(k, Modifier.weight(1f))
        Text(v, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private suspend fun get(path: String, token: String?): String = withContext(Dispatchers.IO) {
    val conn = (URL(BuildConfig.SERVER_URL + path).openConnection() as HttpURLConnection).apply {
        token?.let { setRequestProperty("Authorization", "Bearer $it") }
        connectTimeout = 10000; readTimeout = 10000
    }
    conn.inputStream.bufferedReader().use { it.readText() }
}
