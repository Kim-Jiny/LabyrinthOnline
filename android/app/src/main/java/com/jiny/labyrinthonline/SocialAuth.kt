package com.jiny.labyrinthonline

import android.app.Activity

/*
 * 네이티브 소셜 로그인 → 토큰 획득. 토큰은 백엔드(/auth/social)가 검증한다.
 *
 * 각 제공자 SDK 연동 지점(TODO). 실제 구현 시 클라이언트 ID/네이티브 키가 필요하다:
 *  - 구글: Credential Manager(GoogleIdOption) 로 받은 idToken 반환
 *    https://developer.android.com/identity/sign-in/credential-manager-siwg
 *  - 카카오: Kakao SDK UserApiClient.loginWithKakaoTalk → accessToken 반환
 *  - 애플: 안드로이드는 네이티브 미지원 → 웹 OAuth(Custom Tabs) 로 identity token 획득
 *
 * 반환 토큰 의미: google=id_token, apple=identity token, kakao=access token.
 */
object SocialAuth {
    class NotConfigured(val provider: SocialProvider) : Exception("${provider.key} not configured")

    suspend fun token(activity: Activity, provider: SocialProvider): String {
        when (provider) {
            SocialProvider.GOOGLE -> throw NotConfigured(provider) // TODO: Credential Manager
            SocialProvider.KAKAO -> throw NotConfigured(provider)  // TODO: Kakao SDK
            SocialProvider.APPLE -> throw NotConfigured(provider)  // TODO: 웹 OAuth
        }
    }
}
