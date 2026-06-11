// .env 로딩은 반드시 가장 먼저. 다른 모듈이 top-level에서 process.env를 읽으므로
// 이 import 가 다른 import 보다 위에 있어야 한다(src/index.ts 최상단).
import dotenv from 'dotenv';
dotenv.config();
