// Node 전용 테스트 로더 (추가 라이브러리 불필요, Node 20.6+)
// - src/의 확장자 없는 import를 .js로 해석하고 ESM으로 로드
// - expo-secure-store / react-native를 메모리 스텁으로 대체
// 사용: node --import ./scripts/api-tests/loader.mjs <test file>
import { register } from 'node:module';

globalThis.__DEV__ = false;

register('./hooks.mjs', import.meta.url);
