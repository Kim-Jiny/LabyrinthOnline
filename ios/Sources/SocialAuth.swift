//  SocialAuth.swift
//  라비린스 — 네이티브 소셜 로그인 → 토큰 획득. 토큰은 백엔드(/auth/social)가 검증.
//
//  애플: AuthenticationServices(시스템 프레임워크)로 실제 구현(추가 SDK 불필요,
//        단 Xcode 에서 "Sign in with Apple" Capability 추가 필요).
//  구글/카카오: 각 SDK 설치 후 연동 지점(TODO)을 채운다. 아래 주석 참고.

import Foundation
import UIKit
import AuthenticationServices

enum SocialAuthError: Error { case cancelled, notConfigured(String), failed(String) }

@MainActor
enum SocialAuth {
    /// provider 별 토큰을 반환. (google=id_token, apple=identity token, kakao=access token)
    static func token(for provider: SocialProvider) async throws -> String {
        switch provider {
        case .apple: return try await appleIdentityToken()
        case .google: throw SocialAuthError.notConfigured(
            "GoogleSignIn SDK 설치 후 GIDSignIn.sharedInstance.signIn(...) 의 idToken 을 반환하도록 구현하세요.")
        case .kakao: throw SocialAuthError.notConfigured(
            "Kakao SDK 설치 후 UserApi.shared.loginWithKakaoTalk(...) 의 accessToken 을 반환하도록 구현하세요.")
        }
    }

    // MARK: - Apple (시스템 프레임워크로 실제 구현)
    private static var appleDelegate: AppleDelegate?
    private static func appleIdentityToken() async throws -> String {
        try await withCheckedThrowingContinuation { cont in
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            let delegate = AppleDelegate(cont)
            appleDelegate = delegate // 보존(컨트롤러가 약참조)
            controller.delegate = delegate
            controller.presentationContextProvider = delegate
            controller.performRequests()
        }
    }
}

private final class AppleDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let cont: CheckedContinuation<String, Error>
    init(_ cont: CheckedContinuation<String, Error>) { self.cont = cont }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            cont.resume(throwing: SocialAuthError.failed("no identity token"))
            return
        }
        cont.resume(returning: token)
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled {
            cont.resume(throwing: SocialAuthError.cancelled)
        } else {
            cont.resume(throwing: SocialAuthError.failed(error.localizedDescription))
        }
    }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
}
