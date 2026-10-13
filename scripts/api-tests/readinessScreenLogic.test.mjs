// 사회인 준비도 화면 로직(API-36) 단위 테스트. 서버 호출 없음(fetcher 주입), 순수 함수만 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/readinessScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const { OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const { ASSET_SOURCE, READINESS_ERROR_TYPE } =
  await import('../../src/features/work/readinessApi.js');
const logic = await import('../../src/features/work/readinessScreenLogic.js');
const {
  READINESS_SCREEN_STATE,
  buildReadinessViewModel,
  canRefresh,
  createRequestGate,
  describeAssetSource,
  describeReadinessError,
  loadReadiness,
} = logic;

const UID = '123456789012345678';

const readinessFixture = (overrides = {}) => ({
  percent: 33,
  level: 2,
  levelLabel: '첫 걸음을 뗐어요',
  items: [
    { key: 'goal', label: '목표 자금 충족률', weight: 50, score: 10, detail: '20.0% 를 모았어요.' },
    { key: 'spending', label: '소비 관리 습관', weight: 25, score: null, detail: '제외했어요.' },
    { key: 'plan', label: '미래 계획 구체성', weight: 15, score: 0, detail: '0/10 문항.' },
  ],
  evaluated: ['goal', 'plan'],
  excluded: ['spending'],
  assetSource: ASSET_SOURCE.ASSET_SERVICE,
  message: '시작이 가장 어려운데 이미 넘었어요.',
  disclaimer: '앱 내부 지표입니다.',
  ...overrides,
});

const apiError = (kind, status = null) => createApiError({ kind, status });

// ── loadReadiness ────────────────────────────────────────────

test('loadReadiness: 성공하면 서버 모델을 그대로 돌려주고 fetcher에는 user_id 문자열만 전달', async () => {
  const calls = [];
  const readiness = readinessFixture();
  const result = await loadReadiness(UID, {
    fetcher: async userId => {
      calls.push(userId);
      return readiness;
    },
  });

  assert.deepEqual(result, { ok: true, readiness });
  assert.deepEqual(calls, [UID]);
  assert.equal(typeof calls[0], 'string', 'user_id는 Number로 바뀌지 않음');
});

test('loadReadiness: 오류 종류별로 errorType만 돌려주고 값(가짜 0%)을 만들지 않음', async () => {
  const cases = [
    [apiError(API_ERROR_KIND.NETWORK), READINESS_ERROR_TYPE.NETWORK],
    [apiError(API_ERROR_KIND.TIMEOUT), READINESS_ERROR_TYPE.TIMEOUT],
    [apiError(API_ERROR_KIND.HTTP_5XX, 503), READINESS_ERROR_TYPE.SERVER],
    [apiError(API_ERROR_KIND.HTTP_4XX, 403), READINESS_ERROR_TYPE.FORBIDDEN],
    [apiError(API_ERROR_KIND.HTTP_4XX, 422), READINESS_ERROR_TYPE.VALIDATION],
    [apiError(API_ERROR_KIND.AUTH_REQUIRED, 401), READINESS_ERROR_TYPE.UNAUTHORIZED],
    [apiError(API_ERROR_KIND.SESSION_EXPIRED, 401), READINESS_ERROR_TYPE.UNAUTHORIZED],
    [
      new OnboardingRequestError(ONBOARDING_REQUEST_ERROR.INVALID_USER_ID, 'x'),
      READINESS_ERROR_TYPE.INVALID_REQUEST,
    ],
    [new Error('boom'), READINESS_ERROR_TYPE.UNKNOWN],
  ];

  for (const [error, errorType] of cases) {
    const result = await loadReadiness(UID, {
      fetcher: async () => {
        throw error;
      },
    });
    assert.deepEqual(result, { ok: false, errorType });
    assert.equal('readiness' in result, false);
  }
});

test('loadReadiness: 응답 형식 오류(invalidResponse)는 INVALID_RESPONSE', async () => {
  const error = apiError(API_ERROR_KIND.BUSINESS);
  error.invalidResponse = true;
  const result = await loadReadiness(UID, {
    fetcher: async () => {
      throw error;
    },
  });
  assert.deepEqual(result, { ok: false, errorType: READINESS_ERROR_TYPE.INVALID_RESPONSE });
});

test('loadReadiness: CANCELED는 오류가 아니라 canceled로 구분 (화면이 무시)', async () => {
  const result = await loadReadiness(UID, {
    fetcher: async () => {
      throw apiError(API_ERROR_KIND.CANCELED);
    },
  });
  assert.deepEqual(result, { ok: false, canceled: true });
});

test('loadReadiness: fetcher는 정확히 1회만 호출 (자동 재시도 없음)', async () => {
  let count = 0;
  await loadReadiness(UID, {
    fetcher: async () => {
      count += 1;
      throw apiError(API_ERROR_KIND.HTTP_5XX, 503);
    },
  });
  assert.equal(count, 1);
});

// ── 상태 / 중복 요청 ─────────────────────────────────────────

test('canRefresh: 로딩 중에만 다시 조회할 수 없음', () => {
  assert.equal(canRefresh(READINESS_SCREEN_STATE.LOADING), false);
  assert.equal(canRefresh(READINESS_SCREEN_STATE.READY), true);
  assert.equal(canRefresh(READINESS_SCREEN_STATE.ERROR), true);
});

test('requestGate: 새 요청이 시작되면 이전 응답은 버려지고, 무효화(언마운트) 후에는 모두 버려짐', () => {
  const gate = createRequestGate();
  const first = gate.begin(UID);
  const second = gate.begin(UID);

  assert.equal(gate.isCurrent(first), false, '이전 요청 응답 폐기');
  assert.equal(gate.isCurrent(second), true);

  gate.invalidate();
  assert.equal(gate.isCurrent(second), false, '언마운트 후 응답 폐기');
});

test('requestGate: 사용자(scope)가 바뀌면 이전 사용자의 응답은 반영되지 않음', () => {
  const gate = createRequestGate();
  const forUserA = gate.begin('111');
  gate.begin('222');
  assert.equal(gate.isCurrent(forUserA), false);
});

// ── 안내 문구 ────────────────────────────────────────────────

test('describeAssetSource: NOT_LINKED / UNAVAILABLE만 안내, 나머지(INPUT·ASSET_SERVICE·미지 값)는 null', () => {
  assert.match(describeAssetSource(ASSET_SOURCE.NOT_LINKED), /연결된 계좌가 없어/);
  assert.match(describeAssetSource(ASSET_SOURCE.UNAVAILABLE), /불러오지 못해/);
  assert.notEqual(
    describeAssetSource(ASSET_SOURCE.NOT_LINKED),
    describeAssetSource(ASSET_SOURCE.UNAVAILABLE),
    '미연동과 조회 실패는 안내가 다름'
  );
  assert.equal(describeAssetSource(ASSET_SOURCE.INPUT), null);
  assert.equal(describeAssetSource(ASSET_SOURCE.ASSET_SERVICE), null);
  assert.equal(describeAssetSource('SOMETHING_NEW'), null);
  assert.equal(describeAssetSource(undefined), null);
});

test('describeReadinessError: 모든 오류 타입에 사용자 문구가 있고 ID·토큰·서버 원문을 담지 않음', () => {
  for (const errorType of [...Object.values(READINESS_ERROR_TYPE), 'NOT_A_TYPE', undefined]) {
    const message = describeReadinessError(errorType);
    assert.equal(typeof message, 'string');
    assert.notEqual(message.trim(), '');
    assert.equal(/\d{6,}|Bearer|token|detail|traceId/i.test(message), false, String(errorType));
  }
  assert.notEqual(
    describeReadinessError(READINESS_ERROR_TYPE.NETWORK),
    describeReadinessError(READINESS_ERROR_TYPE.TIMEOUT)
  );
});

// ── 표시 데이터 ──────────────────────────────────────────────

test('buildReadinessViewModel: percent/level/문구는 서버 값 그대로 (재계산·보정 없음)', () => {
  // 서버 규칙과 어긋나 보이는 값(percent 90인데 level 1)이어도 프론트가 고치지 않는다.
  const readiness = readinessFixture({ percent: 90, level: 1, levelLabel: '서버가 준 라벨' });
  const view = buildReadinessViewModel(readiness);

  assert.equal(view.percent, 90);
  assert.equal(view.level, 1);
  assert.equal(view.levelLabel, '서버가 준 라벨');
  assert.equal(view.message, readiness.message);
  assert.equal(view.disclaimer, readiness.disclaimer);
});

test('buildReadinessViewModel: score null은 평가 제외, 0점은 제외가 아님', () => {
  const view = buildReadinessViewModel(readinessFixture());
  const byKey = Object.fromEntries(view.items.map(item => [item.key, item]));

  assert.equal(byKey.goal.isExcluded, false);
  assert.equal(byKey.goal.scoreText, '10 / 50');
  assert.equal(byKey.spending.isExcluded, true);
  assert.equal(byKey.spending.score, null);
  assert.equal(byKey.spending.scoreText, null);
  assert.equal(byKey.plan.isExcluded, false, '0점은 제외가 아님');
  assert.equal(byKey.plan.scoreText, '0 / 15');
});

test('buildReadinessViewModel: 항목 순서·label·detail 유지, 입력 객체를 변형하지 않음', () => {
  const readiness = readinessFixture();
  const snapshot = JSON.stringify(readiness);
  const view = buildReadinessViewModel(readiness);

  assert.deepEqual(
    view.items.map(item => item.key),
    ['goal', 'spending', 'plan']
  );
  assert.equal(view.items[0].label, '목표 자금 충족률');
  assert.equal(view.items[0].detail, '20.0% 를 모았어요.');
  assert.equal(JSON.stringify(readiness), snapshot);
});

test('buildReadinessViewModel: assetNotice는 asset_source에 따라서만 결정', () => {
  assert.equal(buildReadinessViewModel(readinessFixture()).assetNotice, null);
  assert.equal(
    buildReadinessViewModel(readinessFixture({ assetSource: ASSET_SOURCE.NOT_LINKED })).assetNotice,
    describeAssetSource(ASSET_SOURCE.NOT_LINKED)
  );
  assert.equal(
    buildReadinessViewModel(readinessFixture({ assetSource: ASSET_SOURCE.UNAVAILABLE }))
      .assetNotice,
    describeAssetSource(ASSET_SOURCE.UNAVAILABLE)
  );
});

// ── 정적 검사 ────────────────────────────────────────────────

test('2단계 범위: 화면 로직은 RN·Redux·AsyncStorage·네비게이션에 의존하지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/work/readinessScreenLogic.js', import.meta.url),
    'utf8'
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const imports = [...code.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(match => match[1]);

  assert.deepEqual(imports.sort(), ['../onboarding/workOnboardingScreenLogic', './readinessApi']);
  assert.equal(
    /AsyncStorage|useSelector|dispatch|react-native|navigation|require\(/.test(code),
    false
  );
});
