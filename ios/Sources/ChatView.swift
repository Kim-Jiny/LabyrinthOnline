//  ChatView.swift
//  라비린스 — 방 채팅. 소셜 연동 계정(canChat)만 입력 가능, 메시지는 모두 볼 수 있음.

import SwiftUI

struct ChatView: View {
    @ObservedObject var vm: GameViewModel
    let canChat: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(vm.chatMessages) { msg in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(msg.nickname).font(.caption2).foregroundStyle(.secondary)
                                    Text(msg.text)
                                        .padding(.horizontal, 10).padding(.vertical, 6)
                                        .background(.gray.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .id(msg.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: vm.chatMessages.count) { _ in
                        if let last = vm.chatMessages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }

                Divider()
                if canChat {
                    HStack {
                        TextField("메시지", text: $draft).textFieldStyle(.roundedBorder)
                        Button("전송") { send() }.disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .padding(10)
                } else {
                    Text("🔒 소셜(카카오/구글/애플) 연동 계정만 채팅할 수 있어요.")
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).padding(12)
                }
            }
            .navigationTitle("채팅")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("닫기") { dismiss() } } }
        }
    }

    private func send() {
        vm.sendChat(draft)
        draft = ""
    }
}
