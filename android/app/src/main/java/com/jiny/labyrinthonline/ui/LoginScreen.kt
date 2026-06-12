package com.jiny.labyrinthonline.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jiny.labyrinthonline.AuthViewModel
import com.jiny.labyrinthonline.SocialAuth
import com.jiny.labyrinthonline.SocialProvider
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(auth: AuthViewModel) {
    var signupMode by remember { mutableStateOf(false) }
    var loginId by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }
    val activity = LocalContext.current as? Activity
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("라비린스", fontSize = 44.sp, fontWeight = FontWeight.Black)
        Text("미로를 헤쳐 보물을 모으세요", color = MaterialTheme.colorScheme.onSurfaceVariant)

        TabRow(selectedTabIndex = if (signupMode) 1 else 0) {
            Tab(selected = !signupMode, onClick = { signupMode = false }, text = { Text("로그인") })
            Tab(selected = signupMode, onClick = { signupMode = true }, text = { Text("회원가입") })
        }

        OutlinedTextField(loginId, { loginId = it }, label = { Text("아이디") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("비밀번호") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(autoCorrectEnabled = false),
            modifier = Modifier.fillMaxWidth())
        if (signupMode) {
            OutlinedTextField(nickname, { nickname = it }, label = { Text("닉네임") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
        }

        auth.lastError?.let { Text(errorText(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        Button(
            onClick = {
                if (signupMode) auth.signup(loginId, password, nickname)
                else auth.login(loginId, password)
            },
            enabled = !auth.busy && loginId.isNotBlank() && password.isNotBlank() && (!signupMode || nickname.isNotBlank()),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (signupMode) "가입하기" else "로그인") }

        Text("또는", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)

        socialButton("카카오로 시작", Color(0xFFFEE500), Color.Black) { social(activity, scope, auth, SocialProvider.KAKAO) }
        socialButton("Google로 시작", Color.White, Color.Black) { social(activity, scope, auth, SocialProvider.GOOGLE) }
        socialButton("Apple로 시작", Color.Black, Color.White) { social(activity, scope, auth, SocialProvider.APPLE) }

        Text("소셜 계정을 연동하면 게임 중 채팅을 사용할 수 있어요.",
            fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun socialButton(label: String, bg: Color, fg: Color, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg),
        modifier = Modifier.fillMaxWidth()
    ) { Text(label) }
}

private fun social(activity: Activity?, scope: kotlinx.coroutines.CoroutineScope, auth: AuthViewModel, p: SocialProvider) {
    if (activity == null) return
    scope.launch {
        try {
            val token = SocialAuth.token(activity, p)
            auth.socialLogin(p, token)
        } catch (e: SocialAuth.NotConfigured) {
            auth.lastError = "NOT_CONFIGURED"
        } catch (e: Exception) {
            auth.lastError = "SOCIAL_FAILED"
        }
    }
}

private fun errorText(code: String): String = when (code) {
    "INVALID_LOGIN_ID" -> "아이디는 영문/숫자 4~30자여야 합니다."
    "INVALID_PASSWORD" -> "비밀번호는 6자 이상이어야 합니다."
    "INVALID_NICKNAME" -> "닉네임은 1~20자여야 합니다."
    "LOGIN_ID_TAKEN" -> "이미 사용 중인 아이디입니다."
    "INVALID_CREDENTIALS" -> "아이디 또는 비밀번호가 올바르지 않습니다."
    "NOT_CONFIGURED" -> "이 소셜 로그인은 아직 설정되지 않았습니다."
    "SOCIAL_FAILED" -> "소셜 로그인에 실패했습니다."
    "NETWORK" -> "서버에 연결할 수 없습니다."
    else -> code
}
