# 라비린스 (Labyrinth Online)

라벤스부르거 *The aMAZE ing Labyrinth* 식 **미로 타일 밀기 보드게임의 온라인
멀티플레이어(2~4인)** 버전.

| 항목 | 값 |
|------|-----|
| 앱 표시명 | 라비린스 |
| 패키지/번들 | `com.jiny.labyrinthonline` |
| 스토어명 | Labyrinth Online |

## 아키텍처

```
 iOS (SwiftUI)  ─┐
                 ├─ Socket.IO /labyrinth ─→  라비린스 서버 (독립 컨테이너, Express+TS)
 Android(Compose)┘                          ├ 룰 엔진(서버 권위, TS)
                                            └ AI 봇(TS)
                                              │
                          공유: 같은 PostgreSQL(lab_* 만) + JWT_SECRET
                                              ↑
                          듀오/CTR/사자툰 (Minigame, 별도 컨테이너)
```

- **서버는 독립 리포·독립 컨테이너로 배포**된다(이 리포 `server/`). 듀오(Minigame)와는
  **같은 Postgres 인스턴스(`lab_*` 테이블)만 공유**하고, 코드·런타임·배포·**인증**이 모두
  완전 분리다. 한쪽 배포가 다른 쪽 서비스에 영향을 주지 않는다(배포 격리).
- 남의 테이블(`dm_/ctr_/sj_`)은 **읽지도 쓰지도 않는다.** (NestJS·Redis 미채택.)
- **자체 인증**: 아이디/비번 가입·로그인 + 소셜(카카오/구글/애플). 라비린스가 직접 JWT 발급.
  **채팅은 소셜 연동 계정만** 가능(`chat_enabled`). 상세는 `server/README.md` 인증 섹션.
- **게임 규칙은 서버 권위(authoritative)**. `server/src/games/labyrinth/` 의 순수 TS 룰
  엔진 한 곳에만 있고, 두 네이티브 클라이언트와 AI 봇이 이를 공유한다. 클라이언트는 상태
  렌더링 + 입력 전송만 담당한다.

## 폴더 구성

| 폴더 | 내용 |
|------|------|
| `server/` | 라비린스 독립 서버(Express+TS, Socket.IO, Docker). `server/README.md` 참고 |
| `ios/` | SwiftUI 클라이언트 (XcodeGen, `ios/README.md` 참고) |
| `android/` | Jetpack Compose 클라이언트 (`android/README.md` 참고) |

서버 룰 엔진 검증:
```bash
cd server
npm install
npm test    # engine.test(불변식 29) + sim.test(봇 대 봇 풀게임 종료)
```

## 게임 규칙 요약

- 7×7 미로판(49칸) + 여분 타일 1칸. 16칸은 고정, 33칸 + 여분 1개는 가동.
- 한 턴 = ① 여분 타일을 12개 삽입 지점 중 하나로 밀어넣기(회전 가능, 직전 수 되돌리기
  금지) → ② 통로로 연결된 칸으로 말 이동.
- 각자 보물 카드를 순서대로 수집. 모두 모은 뒤 자기 홈 코너로 귀환하면 승리.

## 상태

서버(룰 엔진/봇/소켓/DB/문서)는 완성·검증됨. 클라이언트는 빌드 가능한 구조 + 서버
스냅샷과 일치하는 모델·렌더·턴 UX 완비. 남은 일은 각 `README.md`의 TODO(로그인 토큰
연동, 아트 에셋, 재연결 UX) 참고.
