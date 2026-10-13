// Work 사회인 준비도 API 통신 레이어(API-36) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/readinessApi.test.mjs
// user_id·토큰은 모의 서버 전용 가짜 값이다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { MockGateway } from './mockGateway.mjs';

// ── 실제 서버 미호출 검증용 감시 ─────────────────────────────
// http/https.request를 감싸 목적지를 기록한다(요청은 그대로 전달). apiClient import 전에 설치한다.
const everRequested = [];

const hostOf = target => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return target?.hostname ?? target?.host ?? null;
};

const installRequestSpy = (mod, protocol) => {
  const original = mod.request;
  mod.request = function spiedRequest(...args) {
    everRequested.push({ protocol, host: hostOf(args[0]) });
    return original.apply(this, args);
  };
};

installRequestSpy(http, 'http');
installRequestSpy(https, 'https');

// ── 환경 ─────────────────────────────────────────────────────
const gateway = new MockGateway();
const baseURL = await gateway.listen();

// apiClient/tokenService는 모듈 로드 시점에 env를 읽으므로 import 전에 설정한다.
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { default: apiClient } = await import('../../src/services/apiClient.js');
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const {
  ASSET_SOURCE,
  READINESS_ERROR_TYPE,
  fetchReadiness,
  getReadinessErrorType,
  mapReadinessResponse,
} = await import('../../src/features/work/readinessApi.js');

// JS Number로는 정확히 표현할 수 없는 크기의 user_id (Number('123456789012345678') === 123456789012345680)
const BIG_UID = '123456789012345678';
const readinessPath = uid => `/api/v1/work/readiness/${uid}`;

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const jsonRoute = body => () => ({ body });

const itemFixture = (overrides = {}) => ({
  key: 'goal',
  label: '목표 자금 충족률',
  weight: 50,
  score: 10,
  detail: '목표 금액의 20.0% 를 모았어요.',
  ...overrides,
});

// 서버 소스(readiness_service.py) 기준의 4개 항목. spending/safety는 기록이 없어 제외된 상태.
const readinessFixture = (overrides = {}) => ({
  user_id: 123,
  percent: 33,
  level: 2,
  level_label: '첫 걸음을 뗐어요',
  items: [
    itemFixture(),
    itemFixture({
      key: 'spending',
      label: '소비 관리 습관',
      weight: 25,
      score: null,
      detail: '아직 소비 기록이 없어 평가에서 제외했어요.',
    }),
    itemFixture({
      key: 'plan',
      label: '미래 계획 구체성',
      weight: 15,
      score: 15,
      detail: '온보딩 10/10 문항에 답했어요.',
    }),
    itemFixture({
      key: 'safety',
      label: '안전한 금융 습관',
      weight: 10,
      score: null,
      detail: '아직 거래 기록이 없어 평가에서 제외했어요.',
    }),
  ],
  evaluated: ['goal', 'plan'],
  excluded: ['spending', 'safety'],
  asset_source: 'ASSET_SERVICE',
  message: '시작이 가장 어려운데 이미 넘었어요. 목표 금액은 20% 모았어요.',
  disclaimer: '이 수치는 목표 대비 준비 상태를 보여주는 앱 내부 지표입니다.',
  ...overrides,
});

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  await tokenService.clearTokens();
  // 기본: 유효한 Access Token으로 로그인된 상태
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 정상 응답 / 요청 구성 ─────────────────────────────────────

test('API-36: 정상 응답을 camelCase 모델로 변환 (서버 값 그대로, 재계산·기본값 없음)', async () => {
  gateway.route('POST', readinessPath(BIG_UID), jsonRoute(readinessFixture()));

  const readiness = await fetchReadiness(BIG_UID);

  const fixture = readinessFixture();
  assert.deepEqual(readiness, {
    percent: 33,
    level: 2,
    levelLabel: '첫 걸음을 뗐어요',
    items: fixture.items,
    evaluated: ['goal', 'plan'],
    excluded: ['spending', 'safety'],
    assetSource: ASSET_SOURCE.ASSET_SERVICE,
    message: fixture.message,
    disclaimer: fixture.disclaimer,
  });
  assert.equal(readiness.items[1].score, null, '제외 항목의 null은 0점으로 바뀌지 않음');
  assert.equal('userId' in readiness, false, '응답 user_id는 반환하지 않음');
});

test('API-36: POST, 경로에 user_id 문자열 그대로, Bearer 첨부, 본문은 빈 객체 {}', async () => {
  gateway.route('POST', readinessPath(BIG_UID), jsonRoute(readinessFixture()));

  await fetchReadiness(BIG_UID);

  const requests = gateway.requestsTo(readinessPath(BIG_UID));
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.deepEqual(request.body, {}, '본문은 {}이며 입력 필드를 보내지 않음');
  for (const key of ['current_asset', 'monthly_income', 'deposit', 'user_id']) {
    assert.equal(key in request.body, false, `${key} 미전송`);
  }
});

test('API-36: 응답의 user_id가 정밀도 손실 값이어도 사용하지 않음', async () => {
  gateway.route('POST', readinessPath(BIG_UID), () => ({
    rawBody: JSON.stringify(readinessFixture()).replace('"user_id":123', `"user_id":${BIG_UID}`),
  }));

  const readiness = await fetchReadiness(BIG_UID);

  assert.equal(readiness.percent, 33);
  assert.equal(JSON.stringify(readiness).includes('user_id'), false);
  assert.equal(JSON.stringify(readiness).includes('12345678901234568'), false);
});

test('API-36: percent 0 / 100, level 1 / 5 경계와 모든 항목 제외(items score 전부 null)도 정상', async () => {
  gateway.route(
    'POST',
    readinessPath(BIG_UID),
    jsonRoute(
      readinessFixture({
        percent: 0,
        level: 1,
        level_label: '이제 시작이에요',
        items: [itemFixture({ score: 0 })],
        evaluated: ['goal'],
        excluded: [],
      })
    )
  );
  const zero = await fetchReadiness(BIG_UID);
  assert.equal(zero.percent, 0);
  assert.equal(zero.level, 1);
  assert.equal(zero.items[0].score, 0, '0점은 null(제외)과 구분');

  gateway.route(
    'POST',
    readinessPath(BIG_UID),
    jsonRoute(readinessFixture({ percent: 100, level: 5, evaluated: [], excluded: [] }))
  );
  const full = await fetchReadiness(BIG_UID);
  assert.equal(full.percent, 100);
  assert.equal(full.level, 5);
});

test('API-36: asset_source 4개 값과 알 수 없는 문자열도 그대로 전달 (응답 거부 안 함)', async () => {
  for (const source of [...Object.values(ASSET_SOURCE), 'SOMETHING_NEW']) {
    gateway.route(
      'POST',
      readinessPath(BIG_UID),
      jsonRoute(readinessFixture({ asset_source: source }))
    );
    assert.equal((await fetchReadiness(BIG_UID)).assetSource, source);
  }
});

// ── 응답 검증 ────────────────────────────────────────────────

const without = key => {
  const body = readinessFixture();
  delete body[key];
  return body;
};

const INVALID_BODIES = {
  '배열 본문': [],
  null: null,
  '문자열 본문': 'ok',
  'percent 누락': without('percent'),
  'percent 100 초과': readinessFixture({ percent: 101 }),
  'percent 음수': readinessFixture({ percent: -1 }),
  'percent 소수': readinessFixture({ percent: 33.5 }),
  'percent 문자열': readinessFixture({ percent: '33' }),
  'level 0': readinessFixture({ level: 0 }),
  'level 6': readinessFixture({ level: 6 }),
  'level_label 누락': without('level_label'),
  'level_label 빈 문자열': readinessFixture({ level_label: ' ' }),
  'items 누락': without('items'),
  'items가 객체': readinessFixture({ items: {} }),
  'items 원소가 null': readinessFixture({ items: [null] }),
  'item key 누락': readinessFixture({ items: [itemFixture({ key: undefined })] }),
  'item weight 문자열': readinessFixture({ items: [itemFixture({ weight: '50' })] }),
  'item score 음수': readinessFixture({ items: [itemFixture({ score: -1 })] }),
  'item score 키 누락': readinessFixture({
    items: [(({ score, ...rest }) => rest)(itemFixture())],
  }),
  'item detail null': readinessFixture({ items: [itemFixture({ detail: null })] }),
  'item key 중복': readinessFixture({ items: [itemFixture(), itemFixture()] }),
  'evaluated 누락': without('evaluated'),
  'excluded에 숫자': readinessFixture({ excluded: [1] }),
  'asset_source 누락': without('asset_source'),
  'asset_source null': readinessFixture({ asset_source: null }),
  'message 누락': without('message'),
  'disclaimer 누락': without('disclaimer'),
  'disclaimer 빈 문자열': readinessFixture({ disclaimer: '' }),
};

for (const [name, body] of Object.entries(INVALID_BODIES)) {
  test(`API-36: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('POST', readinessPath(BIG_UID), () => ({ body }));

    const error = await rejectionOf(fetchReadiness(BIG_UID));

    assert.equal(error.invalidResponse, true);
    assert.equal(getReadinessErrorType(error), READINESS_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(readinessPath(BIG_UID)).length, 1, '재시도 없음');
  });
}

test('mapReadinessResponse: 값이 없다는 이유로 기본값을 채우지 않음', () => {
  assert.throws(
    () => mapReadinessResponse({}),
    error => error.invalidResponse === true
  );
  assert.throws(
    () => mapReadinessResponse(undefined),
    error => error.invalidResponse === true
  );
});

// ── 요청 검증 ────────────────────────────────────────────────

test('잘못된 user_id는 요청을 보내지 않고 INVALID_REQUEST', async () => {
  for (const userId of [
    undefined,
    null,
    '',
    'abc',
    '0',
    '01',
    '-1',
    '1.5',
    123,
    '9223372036854775808',
  ]) {
    const error = await rejectionOf(fetchReadiness(userId));
    assert.ok(error instanceof OnboardingRequestError);
    assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_USER_ID);
    assert.equal(getReadinessErrorType(error), READINESS_ERROR_TYPE.INVALID_REQUEST);
    assert.equal(
      error.message.includes(String(userId)) && userId !== undefined && userId !== '',
      false
    );
  }
  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
});

// ── 오류 상태 구분 ───────────────────────────────────────────

const HTTP_ERROR_CASES = [
  { status: 401, body: { code: 'UNAUTHENTICATED' }, type: READINESS_ERROR_TYPE.UNAUTHORIZED },
  {
    status: 403,
    body: { detail: '본인의 정보만 조회할 수 있습니다.' },
    type: READINESS_ERROR_TYPE.FORBIDDEN,
  },
  { status: 404, body: { detail: 'not found' }, type: READINESS_ERROR_TYPE.NOT_FOUND },
  {
    status: 422,
    body: { code: 'VALIDATION_ERROR', message: '요청 형식 오류' },
    type: READINESS_ERROR_TYPE.VALIDATION,
  },
  { status: 429, body: {}, type: READINESS_ERROR_TYPE.CLIENT_ERROR },
  { status: 500, body: { code: 'INTERNAL_ERROR' }, type: READINESS_ERROR_TYPE.SERVER },
  { status: 503, body: { code: 'DB_CONNECTION_ERROR' }, type: READINESS_ERROR_TYPE.SERVER },
];

for (const errorCase of HTTP_ERROR_CASES) {
  test(`HTTP ${errorCase.status} → ${errorCase.type}, 자동 재시도 없이 1회만 전송`, async () => {
    gateway.route('POST', readinessPath(BIG_UID), () => ({
      public: true,
      status: errorCase.status,
      body: errorCase.body,
    }));

    const error = await rejectionOf(fetchReadiness(BIG_UID));

    assert.equal(error.status, errorCase.status);
    assert.equal(getReadinessErrorType(error), errorCase.type);
    assert.notEqual(error.invalidResponse, true, '검증 실패와 구분');
    assert.equal(gateway.requestsTo(readinessPath(BIG_UID)).length, 1);
  });
}

test('토큰 없이 호출하면 AUTH_REQUIRED(401), refresh 시도 없음', async () => {
  await tokenService.clearTokens();
  gateway.route('POST', readinessPath(BIG_UID), jsonRoute(readinessFixture()));

  const error = await rejectionOf(fetchReadiness(BIG_UID));

  assert.equal(error.kind, API_ERROR_KIND.AUTH_REQUIRED);
  assert.equal(getReadinessErrorType(error), READINESS_ERROR_TYPE.UNAUTHORIZED);
  assert.equal(gateway.refreshCount, 0);
});

test('토큰 만료 시 refresh 후 1회 재전송으로 성공 (기존 apiClient 인증 처리 재사용)', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.route('POST', readinessPath(BIG_UID), jsonRoute(readinessFixture()));

  const readiness = await fetchReadiness(BIG_UID);

  assert.equal(readiness.percent, 33);
  assert.equal(gateway.refreshCount, 1);
  const requests = gateway.requestsTo(readinessPath(BIG_UID));
  assert.equal(requests.length, 2, '만료 401 1회 + 새 토큰 재전송 1회');
  assert.deepEqual(requests[1].body, {}, '재전송 본문도 {}');
});

test('네트워크 연결 끊김 → NETWORK, 1회만 전송', async () => {
  gateway.route('POST', readinessPath(BIG_UID), () => ({ public: true, destroy: true }));

  const error = await rejectionOf(fetchReadiness(BIG_UID));

  assert.equal(error.kind, API_ERROR_KIND.NETWORK);
  assert.equal(getReadinessErrorType(error), READINESS_ERROR_TYPE.NETWORK);
  assert.equal(gateway.requestsTo(readinessPath(BIG_UID)).length, 1);
});

test('응답 지연 → TIMEOUT (네트워크 오류와 구분), 자동 재시도 없음', async () => {
  gateway.route('POST', readinessPath(BIG_UID), () => ({ public: true, delay: 1200, body: {} }));

  const error = await rejectionOf(fetchReadiness(BIG_UID));

  assert.equal(error.kind, API_ERROR_KIND.TIMEOUT);
  assert.equal(getReadinessErrorType(error), READINESS_ERROR_TYPE.TIMEOUT);
  assert.equal(gateway.requestsTo(readinessPath(BIG_UID)).length, 1);
});

// ── 실제 서버 미호출 / 기존 앱 흐름 비연결 ────────────────────

test('apiClient 대상은 로컬 모의 Gateway(127.0.0.1)뿐이며 모든 요청이 그곳으로만 전송됨', () => {
  assert.equal(apiClient.defaults.baseURL, baseURL);
  assert.equal(new URL(baseURL).hostname, '127.0.0.1');
  assert.ok(everRequested.length > 0, '감시 장치가 요청을 관찰했는지 확인');
  for (const record of everRequested) {
    assert.equal(record.protocol, 'http');
    assert.equal(record.host, '127.0.0.1');
  }
});

test('1단계 범위: readinessApi는 화면·Redux·AsyncStorage·기존 Work slice를 import하지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/work/readinessApi.js', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(imports.sort(), [
    '../../constants/apiEndpoints',
    '../../services/apiClient',
    '../../services/apiResponse',
    '../onboarding/onboardingApi',
  ]);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/AsyncStorage|useSelector|dispatch|react-native/.test(code), false);
});
