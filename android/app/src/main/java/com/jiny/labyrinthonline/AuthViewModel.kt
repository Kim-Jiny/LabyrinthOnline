package com.jiny.labyrinthonline

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/*
 * 라비린스 인증 — REST 호출 + 토큰 저장(SharedPreferences) + Compose 상태.
 * 서버: POST /api/lab/auth/{signup,login,social,link}, GET /me
 *
 * TODO(보안 강화): 토큰을 EncryptedSharedPreferences(androidx.security-crypto)로 저장.
 */
enum class SocialProvider(val key: String) { KAKAO("kakao"), GOOGLE("google"), APPLE("apple") }

class AuthViewModel(app: Application) : AndroidViewModel(app) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val prefs = app.getSharedPreferences("lab_auth", Context.MODE_PRIVATE)

    var user by mutableStateOf<LabUser?>(null); private set
    var token by mutableStateOf<String?>(prefs.getString("token", null)); private set
    var lastError by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false); private set

    val isAuthenticated: Boolean get() = token != null && user != null
    val canChat: Boolean get() = user?.chatEnabled == true

    fun restoreSession() {
        val t = token ?: return
        viewModelScope.launch {
            try {
                val res = api("/api/lab/auth/me", "GET", null, t)
                user = json.decodeFromString<MeResponse>(res).user
            } catch (e: Exception) {
                signOut()
            }
        }
    }

    fun signup(loginId: String, password: String, nickname: String) = run {
        val body = """{"loginId":${q(loginId)},"password":${q(password)},"nickname":${q(nickname)}}"""
        applyAuth(api("/api/lab/auth/signup", "POST", body, null))
    }

    fun login(loginId: String, password: String) = run {
        val body = """{"loginId":${q(loginId)},"password":${q(password)}}"""
        applyAuth(api("/api/lab/auth/login", "POST", body, null))
    }

    /** 소셜 로그인/가입. providerToken: google=id_token, apple=identity token, kakao=access token. */
    fun socialLogin(provider: SocialProvider, providerToken: String) = run {
        val body = """{"provider":"${provider.key}","token":${q(providerToken)}}"""
        applyAuth(api("/api/lab/auth/social", "POST", body, null))
    }

    /** 기존 계정에 소셜 연동 → 채팅 활성화. */
    fun linkSocial(provider: SocialProvider, providerToken: String) = run {
        val t = token ?: return@run
        val body = """{"provider":"${provider.key}","token":${q(providerToken)}}"""
        user = json.decodeFromString<MeResponse>(api("/api/lab/auth/link", "POST", body, t)).user
    }

    fun signOut() {
        prefs.edit().remove("token").apply()
        token = null
        user = null
    }

    // --- 내부 ---
    private fun applyAuth(raw: String) {
        val res = json.decodeFromString<AuthResponse>(raw)
        res.token?.let {
            token = it
            prefs.edit().putString("token", it).apply()
        }
        user = res.user
    }

    private fun run(op: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            lastError = null
            try {
                op()
            } catch (e: ApiException) {
                lastError = e.code
            } catch (e: Exception) {
                lastError = "NETWORK"
            } finally {
                busy = false
            }
        }
    }

    private suspend fun api(path: String, method: String, body: String?, bearer: String?): String =
        withContext(Dispatchers.IO) {
            val conn = (URL(BuildConfig.SERVER_URL + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                setRequestProperty("Content-Type", "application/json")
                bearer?.let { setRequestProperty("Authorization", "Bearer $it") }
                connectTimeout = 10000; readTimeout = 10000
                if (body != null) { doOutput = true; outputStream.use { it.write(body.toByteArray()) } }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
            if (code !in 200..299) {
                val errCode = runCatching { json.decodeFromString<ApiError>(text).error }.getOrNull() ?: "HTTP_$code"
                throw ApiException(errCode)
            }
            text
        }

    // JSON 문자열 escape(따옴표/역슬래시)
    private fun q(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private class ApiException(val code: String) : Exception(code)
}
