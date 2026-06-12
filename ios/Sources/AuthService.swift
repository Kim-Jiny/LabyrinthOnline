//  AuthService.swift
//  라비린스 — 인증 상태 + REST 클라이언트 + Keychain 토큰 저장.
//
//  서버: POST /api/lab/auth/{signup,login,social,link}, GET /me
//  토큰은 Keychain 에 저장하고, 소켓/요청 시 Authorization 으로 사용한다.

import Foundation
import Combine

struct LabUser: Codable, Equatable {
    let id: Int
    let loginId: String?
    let nickname: String
    let chatEnabled: Bool
    let hasPassword: Bool
    let socials: [String]
}

private struct AuthResponse: Codable { let token: String?; let user: LabUser }
private struct ErrorResponse: Codable { let error: String }

enum SocialProvider: String { case kakao, google, apple }

@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published private(set) var user: LabUser?
    @Published private(set) var token: String?
    @Published var lastError: String?

    var isAuthenticated: Bool { token != nil && user != nil }
    var canChat: Bool { user?.chatEnabled ?? false }

    private let keychainKey = "com.jiny.labyrinthonline.token"

    init() {
        token = Keychain.read(keychainKey)
    }

    // 앱 시작 시 저장된 토큰으로 세션 복구
    func restoreSession() async {
        guard let token else { return }
        do {
            let u = try await request("/api/lab/auth/me", method: "GET", body: nil, token: token, decode: MeResponse.self)
            self.user = u.user
        } catch {
            // 토큰 만료/무효 → 로그아웃
            signOut()
        }
    }

    func signup(loginId: String, password: String, nickname: String) async {
        await run {
            let res = try await self.request("/api/lab/auth/signup", method: "POST",
                body: ["loginId": loginId, "password": password, "nickname": nickname],
                token: nil, decode: AuthResponse.self)
            self.apply(res)
        }
    }

    func login(loginId: String, password: String) async {
        await run {
            let res = try await self.request("/api/lab/auth/login", method: "POST",
                body: ["loginId": loginId, "password": password],
                token: nil, decode: AuthResponse.self)
            self.apply(res)
        }
    }

    /// 소셜 로그인/가입. token 은 네이티브 SDK 가 받은 값
    /// (google=id_token, apple=identity token, kakao=access token).
    func socialLogin(provider: SocialProvider, providerToken: String, nickname: String? = nil) async {
        await run {
            var body: [String: Any] = ["provider": provider.rawValue, "token": providerToken]
            if let nickname { body["nickname"] = nickname }
            let res = try await self.request("/api/lab/auth/social", method: "POST",
                body: body, token: nil, decode: AuthResponse.self)
            self.apply(res)
        }
    }

    /// 기존 계정에 소셜 연동(→ 채팅 활성화). 로그인 상태에서 호출.
    func linkSocial(provider: SocialProvider, providerToken: String) async {
        guard let token else { return }
        await run {
            let res = try await self.request("/api/lab/auth/link", method: "POST",
                body: ["provider": provider.rawValue, "token": providerToken],
                token: token, decode: MeResponse.self)
            self.user = res.user
        }
    }

    func signOut() {
        Keychain.delete(keychainKey)
        token = nil
        user = nil
    }

    // MARK: - 내부

    private struct MeResponse: Codable { let user: LabUser }

    private func apply(_ res: AuthResponse) {
        if let t = res.token {
            token = t
            Keychain.save(keychainKey, value: t)
        }
        user = res.user
    }

    private func run(_ op: @escaping () async throws -> Void) async {
        do { try await op(); lastError = nil }
        catch let AuthClientError.server(code) { lastError = code }
        catch { lastError = "NETWORK" }
    }

    private func request<T: Decodable>(
        _ path: String, method: String, body: [String: Any]?, token: String?, decode: T.Type
    ) async throws -> T {
        var req = URLRequest(url: ServerConfig.baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw AuthClientError.server("NETWORK") }
        if !(200..<300).contains(http.statusCode) {
            let code = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error ?? "HTTP_\(http.statusCode)"
            throw AuthClientError.server(code)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum AuthClientError: Error { case server(String) }

// MARK: - 간단 Keychain 래퍼

enum Keychain {
    static func save(_ key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }
    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
