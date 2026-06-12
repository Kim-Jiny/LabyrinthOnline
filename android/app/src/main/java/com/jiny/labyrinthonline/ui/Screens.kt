package com.jiny.labyrinthonline.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jiny.labyrinthonline.AuthViewModel
import com.jiny.labyrinthonline.GameViewModel
import com.jiny.labyrinthonline.Phase
import com.jiny.labyrinthonline.Screen

@Composable
fun RootScreen(vm: GameViewModel, auth: AuthViewModel) {
    if (!auth.isAuthenticated) {
        LoginScreen(auth)
        return
    }
    // 인증되면 소켓 연결(1회)
    LaunchedEffect(auth.isAuthenticated) {
        if (auth.isAuthenticated) vm.connect(auth.token, auth.user?.nickname)
    }

    vm.errorMessage?.let { code ->
        AlertDialog(
            onDismissRequest = { vm.errorMessage = null },
            confirmButton = { TextButton({ vm.errorMessage = null }) { Text("확인") } },
            title = { Text("오류") },
            text = { Text(errorText(code)) }
        )
    }
    when (vm.screen) {
        Screen.LOBBY -> LobbyScreen(vm, auth)
        Screen.ROOM -> RoomScreen(vm)
        Screen.GAME -> GameScreen(vm, auth)
        Screen.RESULT -> ResultScreen(vm)
    }
}

@Composable
private fun LobbyScreen(vm: GameViewModel, auth: AuthViewModel) {
    var code by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // 계정 헤더
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(auth.user?.nickname ?: "", fontWeight = FontWeight.Bold)
                Text(if (auth.canChat) "💬 채팅 사용 가능" else "🔒 소셜 연동 시 채팅 가능",
                    fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton({ auth.signOut() }) { Text("로그아웃") }
        }

        Text("라비린스", fontSize = 40.sp, fontWeight = FontWeight.Black)
        Text(if (vm.connected) "● 서버 연결됨" else "○ 연결 중…",
            color = if (vm.connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)

        Button({ vm.quickMatch() }, Modifier.fillMaxWidth()) { Text("빠른 대전 (2인)") }
        OutlinedButton({ vm.createRoom(4) }, Modifier.fillMaxWidth()) { Text("방 만들기") }

        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = code, onValueChange = { code = it.uppercase() },
                label = { Text("입장 코드") }, singleLine = true, modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            Button({ vm.joinRoom(code) }, enabled = code.length >= 4) { Text("입장") }
        }
    }
}

@Composable
private fun RoomScreen(vm: GameViewModel) {
    val room = vm.roomInfo ?: return
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("방 코드", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(room.code, fontSize = 34.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
        LazyColumn(Modifier.weight(1f, fill = false).fillMaxWidth()) {
            items(room.seats) { seat ->
                ListItem(
                    headlineContent = { Text(seat.nickname) },
                    leadingContent = { Text(if (seat.isBot) "🤖" else "🧑") },
                    trailingContent = { Text(if (seat.connected) "●" else "○") }
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton({ vm.addBot() }, enabled = room.seats.size < room.maxPlayers) { Text("봇 추가") }
            Button({ vm.start() }, enabled = room.seats.size >= 2) { Text("시작") }
        }
        TextButton({ vm.leave() }) { Text("나가기", color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun GameScreen(vm: GameViewModel, auth: AuthViewModel) {
    val snap = vm.snapshot ?: return
    var showChat by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(8.dp)) {
        // 헤더
        val cur = snap.players.firstOrNull { it.index == snap.currentPlayer }
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (vm.isMyTurn) "내 차례" else "${cur?.nickname ?: ""}의 차례",
                    fontWeight = FontWeight.Bold,
                    color = if (vm.isMyTurn) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                )
                Text(
                    if (snap.phase == Phase.INSERT) "① 타일을 밀어넣으세요" else "② 말을 이동하세요",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            vm.mySeat?.let { me ->
                val p = snap.players[me]
                Column(horizontalAlignment = Alignment.End) {
                    Text("보물 ${p.collected}/${p.totalCards}")
                    if (p.currentTarget != null) Text("목표 #${p.currentTarget}")
                    else Text("🏠 홈으로!", color = MaterialTheme.colorScheme.tertiary)
                }
            }
        }

        BoardScreen(vm, Modifier.fillMaxWidth())

        // 삽입 확정 컨트롤
        if (vm.isMyTurn && snap.phase == Phase.INSERT) {
            Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton({ vm.rotateSpare() }, enabled = vm.selectedInsertion != null) { Text("회전") }
                Button({ vm.confirmInsertion() }, enabled = vm.selectedInsertion != null, modifier = Modifier.weight(1f)) {
                    Text("밀어넣기 확정")
                }
            }
        }
    }

        // 채팅 토글 버튼
        FloatingActionButton(
            onClick = { showChat = !showChat },
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp)
        ) { Text(if (showChat) "✕" else "💬") }

        if (showChat) {
            ChatPanel(vm = vm, canChat = auth.canChat,
                modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
}

@Composable
private fun ChatPanel(vm: GameViewModel, canChat: Boolean, modifier: Modifier = Modifier) {
    var draft by remember { mutableStateOf("") }
    Surface(
        modifier = modifier.fillMaxWidth().fillMaxHeight(0.5f),
        tonalElevation = 6.dp,
        shadowElevation = 8.dp
    ) {
        Column(Modifier.fillMaxSize().padding(12.dp)) {
            Text("채팅", fontWeight = FontWeight.Bold)
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), reverseLayout = false) {
                items(vm.chatMessages) { msg ->
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Text(msg.nickname, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(msg.text)
                    }
                }
            }
            if (canChat) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(draft, { draft = it }, modifier = Modifier.weight(1f),
                        placeholder = { Text("메시지") }, singleLine = true)
                    Spacer(Modifier.width(8.dp))
                    Button({ vm.sendChat(draft); draft = "" }, enabled = draft.isNotBlank()) { Text("전송") }
                }
            } else {
                Text("🔒 소셜(카카오/구글/애플) 연동 계정만 채팅할 수 있어요.",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(8.dp))
            }
        }
    }
}

@Composable
private fun ResultScreen(vm: GameViewModel) {
    val go = vm.gameOver
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("게임 종료", fontSize = 32.sp, fontWeight = FontWeight.Bold)
        if (go != null) {
            Text("🏆 ${go.winnerNickname ?: "무승부"}", fontSize = 22.sp, color = MaterialTheme.colorScheme.tertiary)
            Text("${go.turnCount}턴", color = MaterialTheme.colorScheme.onSurfaceVariant)
            LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
                items(go.standings) { s ->
                    ListItem(
                        headlineContent = { Text("${s.placement}위  ${s.nickname}") },
                        trailingContent = { Text("보물 ${s.collected}") }
                    )
                }
            }
        }
        Button({ vm.leave() }) { Text("로비로") }
    }
}

private fun errorText(code: String): String = when (code) {
    "ROOM_NOT_FOUND" -> "방을 찾을 수 없습니다."
    "ROOM_FULL" -> "방이 가득 찼습니다."
    "ALREADY_STARTED" -> "이미 시작된 게임입니다."
    "FORBIDDEN_REVERSE" -> "직전 삽입을 되돌리는 수는 둘 수 없습니다."
    "UNREACHABLE" -> "그 칸으로는 갈 수 없습니다."
    "NEED_2_PLAYERS" -> "최소 2명이 필요합니다."
    else -> code
}
