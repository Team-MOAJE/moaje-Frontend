// 실제 Gateway 비파괴 스모크 테스트. 데이터 변경 API(회원가입·계좌 개설·송금 등)는 호출하지 않는다.
// 실행: npm run test:api:smoke -- [BASE_URL]   (기본값 http://localhost:8080 — PC에서 실행)
// 출력에는 토큰·PIN 등 민감정보를 남기지 않는다.
import { __store as secureStore } from './stubs/expoSecureStore.mjs';

const baseURL = process.argv[2] || 'http://localhost:8080';
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '5000';

const { default: apiClient, setSessionExpiredHandler } =
  await import('../../src/services/apiClient.js');
const tokenService = await import('../../src/services/tokenService.js');
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');

let sessionExpiredCalls = 0;
setSessionExpiredHandler(() => {
  sessionExpiredCalls += 1;
});

const results = [];

const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, result: 'PASS', detail });
  } catch (error) {
    results.push({ name, result: 'FAIL', detail: error.message });
  }
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const expectReject = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('실패 응답을 기대했으나 성공했습니다.');
};

const summarize = error =>
  `kind=${error.kind} status=${error.status} code=${error.code} traceId=${error.traceId ? 'present' : 'none'}`;

await check(
  'Gateway 도달 + Auth envelope 정상 응답 unwrap (GET /api/v1/auth/token/validate, 무토큰)',
  async () => {
    await tokenService.clearTokens();
    const data = await apiClient.get('/api/v1/auth/token/validate');
    expect(data && typeof data === 'object' && !('success' in data), 'envelope.data가 아님');
    expect(typeof data.is_valid === 'boolean', 'data.is_valid 없음');
    return `data.is_valid=${data.is_valid}`;
  }
);

await check(
  '토큰 없이 JWT 필요 API → AUTH_REQUIRED, refresh 미시도 (GET /api/v1/auth/me)',
  async () => {
    await tokenService.clearTokens();
    const error = await expectReject(apiClient.get('/api/v1/auth/me'));
    expect(error.kind === API_ERROR_KIND.AUTH_REQUIRED, summarize(error));
    return summarize(error);
  }
);

await check(
  'Work 경로도 Gateway 인증 오류를 정규화 (GET /api/v1/work/onboarding/questions, 무토큰)',
  async () => {
    await tokenService.clearTokens();
    const error = await expectReject(apiClient.get('/api/v1/work/onboarding/questions'));
    expect(error.kind === API_ERROR_KIND.AUTH_REQUIRED, summarize(error));
    return summarize(error);
  }
);

await check(
  '공개 Auth API 업무 오류 envelope 처리 (POST /api/v1/auth/login, 빈 본문 검증 실패)',
  async () => {
    await tokenService.setTokens('smoke-invalid-access-token', '0'.repeat(40));
    const error = await expectReject(apiClient.post('/api/v1/auth/login', {}));
    expect(error.kind === API_ERROR_KIND.BUSINESS && error.status === 400, summarize(error));
    expect(error.requiredAction === 'NONE', `requiredAction=${error.requiredAction}`);
    await tokenService.clearTokens();
    return `${summarize(error)} requiredAction=${error.requiredAction}`;
  }
);

await check(
  '무효 Access Token → INVALID_TOKEN → refresh 시도 → 서버 거부 → SESSION_EXPIRED·토큰 삭제',
  async () => {
    sessionExpiredCalls = 0;
    await tokenService.setTokens('smoke-invalid-access-token', '0'.repeat(40));
    const error = await expectReject(apiClient.get('/api/v1/auth/me'));
    expect(error.kind === API_ERROR_KIND.SESSION_EXPIRED, summarize(error));
    expect(error.requiredAction === 'RE_LOGIN', `requiredAction=${error.requiredAction}`);
    expect(secureStore.size === 0, '토큰이 삭제되지 않음');
    expect(sessionExpiredCalls === 1, `세션 만료 알림 ${sessionExpiredCalls}회`);
    return `${summarize(error)} requiredAction=RE_LOGIN tokensCleared=true`;
  }
);

await check('네트워크 미도달 구분 (닫힌 포트)', async () => {
  const error = await expectReject(
    apiClient.get('/api/v1/auth/me', { baseURL: 'http://127.0.0.1:1' })
  );
  expect(error.kind === API_ERROR_KIND.NETWORK, summarize(error));
  return summarize(error);
});

console.log(`\nGateway: ${baseURL}`);
for (const { name, result, detail } of results) {
  console.log(`[${result}] ${name}\n        ${detail}`);
}

process.exitCode = results.every(r => r.result === 'PASS') ? 0 : 1;
