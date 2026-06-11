# 라비린스 온라인 — 서버 (독립 배포)

라비린스 전용 실시간 멀티플레이어 서버. **독립 컨테이너로 배포**되어 듀오·CTR·사자툰
서비스와 배포가 분리된다(한쪽 배포가 다른 쪽에 영향 없음).

## 듀오(Minigame)와 공유하는 것 — 딱 2가지

| 공유 | 이유 |
|------|------|
| **PostgreSQL 인스턴스** (`duo-db`) | 라비린스는 그 안의 `lab_` 테이블만 읽고 쓴다. `dm_/ctr_/sj_` 등 남의 테이블은 **읽지도 쓰지도 않는다.** |
| **JWT_SECRET** | 듀오가 발급한 로그인 토큰을 검증해 전적을 올바른 계정(`userId`)에 귀속. 닉네임은 클라이언트가 보낸 값을 표시용으로 사용. |

코드·런타임·배포는 완전 독립이다.

## 로컬 실행

```bash
cd server
npm install
cp .env.example .env      # DATABASE_URL, JWT_SECRET 채우기 (JWT_SECRET 은 듀오와 동일값)
npm run dev               # ts-node + nodemon, 기본 포트 3000
```

DB 없이도 메모리 모드로 동작(매치 기록만 생략).

## 테스트 (룰 엔진 / 봇)

```bash
npm test
# = engine.test.ts (불변식 29개) + sim.test.ts (봇 대 봇 풀게임 종료 검증)
```

## 배포 (Docker)

전제: 듀오 compose 가 먼저 떠서 `app-network`(external)와 `duo-db` 가 존재.

```bash
# DATABASE_URL, JWT_SECRET 을 환경/.env 로 주입
docker compose up -d --build
# labyrinth-server 가 3002:3000 으로 뜨고 app-network 의 duo-db 를 공유
```

운영 시 Nginx 에서 `/labyrinth` 경로(또는 별도 서브도메인)로 프록시하고 WebSocket
업그레이드 헤더(`Upgrade`/`Connection`)를 전달할 것.

## 구조 (`src/`)

| 경로 | 역할 |
|------|------|
| `index.ts` | 엔트리포인트(Express 헬스 + Socket.IO + DB) |
| `config/env.ts` `config/database.ts` | env 로딩 / 공유 Postgres 풀 + `lab_` 테이블 생성 |
| `utils/jwt.ts` | 토큰 검증(듀오와 동일 시크릿) |
| `games/labyrinth/` | 룰 엔진·봇·테스트(서버 권위) |
| `socket/labyrinth.ts` | `/labyrinth` 네임스페이스 핸들러 |
| `services/labService.ts` | `lab_` 매치/전적 영속화 |
