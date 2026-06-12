//  LoginView.swift
//  라비린스 — 로그인 / 회원가입 / 소셜 로그인 화면.

import SwiftUI

struct LoginView: View {
    @ObservedObject var auth: AuthService
    @State private var mode: Mode = .login
    @State private var loginId = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var busy = false

    enum Mode { case login, signup }

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("라비린스").font(.system(size: 44, weight: .heavy, design: .rounded))
            Text("미로를 헤쳐 보물을 모으세요").font(.subheadline).foregroundStyle(.secondary)

            Picker("", selection: $mode) {
                Text("로그인").tag(Mode.login)
                Text("회원가입").tag(Mode.signup)
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)

            VStack(spacing: 10) {
                TextField("아이디", text: $loginId)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("비밀번호", text: $password)
                if mode == .signup {
                    TextField("닉네임", text: $nickname)
                }
            }
            .textFieldStyle(.roundedBorder)

            if let err = auth.lastError {
                Text(errorText(err)).font(.caption).foregroundStyle(.red)
            }

            Button {
                Task { await submit() }
            } label: {
                Text(mode == .login ? "로그인" : "가입하기")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || loginId.isEmpty || password.isEmpty || (mode == .signup && nickname.isEmpty))

            // 소셜 로그인(연동 계정만 채팅 가능)
            HStack { Rectangle().frame(height: 1).opacity(0.2); Text("또는").font(.caption).foregroundStyle(.secondary); Rectangle().frame(height: 1).opacity(0.2) }
                .padding(.vertical, 4)

            VStack(spacing: 8) {
                socialButton(.kakao, "카카오로 시작", Color(red: 0.99, green: 0.85, blue: 0.0), .black)
                socialButton(.google, "Google로 시작", .white, .black)
                socialButton(.apple, "Apple로 시작", .black, .white)
            }
            Text("소셜 계정을 연동하면 게임 중 채팅을 사용할 수 있어요.")
                .font(.caption2).foregroundStyle(.secondary)

            Spacer()
        }
        .padding(28)
    }

    private func socialButton(_ p: SocialProvider, _ label: String, _ bg: Color, _ fg: Color) -> some View {
        Button {
            Task { await social(p) }
        } label: {
            Text(label).frame(maxWidth: .infinity).foregroundStyle(fg)
        }
        .padding(.vertical, 10)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.gray.opacity(0.3)))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .disabled(busy)
    }

    private func submit() async {
        busy = true; defer { busy = false }
        if mode == .login {
            await auth.login(loginId: loginId, password: password)
        } else {
            await auth.signup(loginId: loginId, password: password, nickname: nickname)
        }
    }

    private func social(_ p: SocialProvider) async {
        busy = true; defer { busy = false }
        do {
            let token = try await SocialAuth.token(for: p)
            await auth.socialLogin(provider: p, providerToken: token)
        } catch SocialAuthError.cancelled {
            // 사용자가 취소 — 무시
        } catch SocialAuthError.notConfigured(let msg) {
            auth.lastError = "NOT_CONFIGURED"
            print("[social] \(p): \(msg)")
        } catch {
            auth.lastError = "SOCIAL_FAILED"
        }
    }

    private func errorText(_ code: String) -> String {
        switch code {
        case "INVALID_LOGIN_ID": return "아이디는 영문/숫자 4~30자여야 합니다."
        case "INVALID_PASSWORD": return "비밀번호는 6자 이상이어야 합니다."
        case "INVALID_NICKNAME": return "닉네임은 1~20자여야 합니다."
        case "LOGIN_ID_TAKEN": return "이미 사용 중인 아이디입니다."
        case "INVALID_CREDENTIALS": return "아이디 또는 비밀번호가 올바르지 않습니다."
        case "NOT_CONFIGURED": return "이 소셜 로그인은 아직 설정되지 않았습니다."
        case "SOCIAL_FAILED": return "소셜 로그인에 실패했습니다."
        case "NETWORK": return "서버에 연결할 수 없습니다."
        default: return code
        }
    }
}
