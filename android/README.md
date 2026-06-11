# 라비린스 (Labyrinth Online) — Android (Kotlin / Jetpack Compose)

라벤스부르거식 미로 타일 밀기 보드게임의 온라인 멀티플레이어 Android 클라이언트.

- **패키지/applicationId**: `com.jiny.labyrinthonline`
- **표시명**: 라비린스
- **minSdk 24 / targetSdk 34**, Kotlin 2.0, Compose
- **규칙은 서버 권위**: 앱은 규칙을 계산하지 않는다. 서버(이 리포 `server/` 의
  `/labyrinth` Socket.IO 네임스페이스) 상태를 렌더링하고 입력만 보낸다.

## 빌드 방법

Android Studio(Koala 이상)로 `android/` 폴더를 열면 Gradle sync 시 의존성을 받고
래퍼를 생성한다. CLI 로는:

```bash
cd android
gradle wrapper        # 최초 1회(또는 Android Studio가 자동 생성)
./gradlew assembleDebug
./gradlew installDebug # 연결된 기기/에뮬레이터에 설치
```

## 서버 주소 설정

`app/build.gradle.kts`의 `SERVER_URL`:
- 에뮬레이터에서 호스트 PC = `http://10.0.2.2:3000` (기본값)
- 실기기는 같은 네트워크의 PC IP(예: `http://192.168.0.x:3000`)
- 운영은 HTTPS 도메인으로 교체하고 `usesCleartextTraffic`/평문 허용 제거.

## 소스 구조 (`app/src/main/java/com/jiny/labyrinthonline/`)

| 파일 | 역할 |
|------|------|
| `MainActivity.kt` | 진입점, ViewModel 연결 |
| `Models.kt` | 서버 스냅샷과 1:1 @Serializable 모델 + 보드 상수 |
| `SocketService.kt` | `/labyrinth` 연결·이벤트 송수신(io.socket) |
| `GameViewModel.kt` | Compose state 상태관리, 액션 |
| `BoardLogic.kt` | UI용 도달칸 BFS(서버가 최종 검증) |
| `ui/BoardScreen.kt` | 7×7 보드 Canvas 렌더 + 삽입 화살표 + 말 + 탭 입력 |
| `ui/Screens.kt` | 로비 / 대기실 / 게임 / 결과 |

## 턴 흐름 (UX)

1. **삽입 단계**: 가장자리 화살표 탭 → 선택(노란 미리보기 타일). 화살표 재탭 또는
   "회전" 버튼으로 여분 타일 회전. "밀어넣기 확정"으로 전송.
2. **이동 단계**: 초록 테두리(도달 가능) 칸을 탭해 이동. 목표 보물 칸에 닿으면 자동
   수집, 다음 보물로. 모든 보물 수집 후 홈 코너 도달 시 승리.

## TODO

- 듀오 로그인 토큰 연동(현재 게스트 연결).
- 보물/타일 아트 에셋 교체.
- 재연결(`lab:reconnect`) 자동화.
