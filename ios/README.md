# 라비린스 (Labyrinth Online) — iOS (SwiftUI)

라벤스부르거식 미로 타일 밀기 보드게임의 온라인 멀티플레이어 iOS 클라이언트.

- **번들 ID**: `com.jiny.labyrinthonline`
- **표시명**: 라비린스 / 스토어명: Labyrinth Online
- **최소 버전**: iOS 16
- **규칙은 서버 권위**: 이 앱은 규칙을 계산하지 않는다. 서버(이 리포 `server/` 의
  `/labyrinth` Socket.IO 네임스페이스)가 보낸 상태를 렌더링하고 입력만 전송한다.

## 빌드 방법

Xcode 프로젝트는 [XcodeGen](https://github.com/yonaskolb/XcodeGen)으로 생성한다(손으로
쓴 `.xcodeproj`를 두지 않아 충돌을 막는다).

```bash
brew install xcodegen          # 최초 1회
cd ios
xcodegen generate              # LabyrinthOnline.xcodeproj 생성
open LabyrinthOnline.xcodeproj # Xcode 에서 실행
```

Socket.IO-Client-Swift 패키지는 `project.yml`에 명시돼 있어 Xcode가 자동으로 받는다.

## 서버 주소 설정

기본값은 `http://localhost:3000`. 실기기/운영에서는 `project.yml`의
`LAB_SERVER_URL`을 서버 주소로 바꾸고 `xcodegen generate`를 다시 실행한다.
운영에서는 HTTPS 도메인을 쓰고 `NSAllowsArbitraryLoads`를 제거할 것.

## 소스 구조 (`Sources/`)

| 파일 | 역할 |
|------|------|
| `LabyrinthApp.swift` | 앱 진입점 |
| `Models.swift` | 서버 `LabyrinthSnapshot`과 1:1 Codable 모델 + 보드 상수 |
| `SocketService.swift` | `/labyrinth` 네임스페이스 연결·이벤트 송수신 |
| `GameViewModel.swift` | 화면 상태(ObservableObject), 액션 |
| `BoardLogic.swift` | UI용 도달칸 BFS(서버가 최종 검증) |
| `TileView.swift` | 타일 1개 렌더링(도형+회전→통로) |
| `BoardView.swift` | 7×7 판 + 12개 삽입 화살표 + 말 |
| `ContentView.swift` | 로비 / 대기실 / 게임 / 결과 화면 |

## 턴 흐름 (UX)

1. **삽입 단계**: 보드 가장자리 화살표를 탭 → 선택. 같은 화살표 재탭 또는 "회전"
   버튼으로 여분 타일 회전. "밀어넣기 확정"으로 전송.
2. **이동 단계**: 초록 테두리(도달 가능) 칸을 탭해 말 이동. 목표 보물 칸에 닿으면
   자동 수집, 다음 보물로. 모든 보물 수집 후 홈 코너 도달 시 승리.

## TODO

- 듀오 로그인 토큰(Keychain) 연동 → 현재는 게스트 연결.
- 보물/타일 아트 에셋 교체(현재 도형+번호 임시 렌더).
- 재연결(`lab:reconnect`) UI(앱 복귀 시 자동 복귀).
