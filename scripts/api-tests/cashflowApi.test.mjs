// Asset 현금흐름 API 통신 레이어(API-15~17) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/cashflowApi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { everRequested, gateway, jsonRoute, rejectionOf, tokenService } from './assetTestEnv.mjs';

const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const { ASSET_ERROR_TYPE, ASSET_REQUEST_ERROR, getAssetErrorType } =
  await import('../../src/features/asset/assetResponse.js');
const { OnboardingRequestError } = await import('../../src/features/onboarding/onboardingApi.js');
const {
  buildDailyLimitRequestBody,
  calculateDailyLimit,
  fetchCategoryCashflow,
  fetchMonthlyCashflow,
} = await import('../../src/features/asset/cashflowApi.js');

const DAILY_PATH = '/api/v1/assets/cashflow/daily-limit';
const MONTHLY_PATH = '/api/v1/assets/cashflow/monthly';
const CATEGORY_PATH = '/api/v1/assets/cashflow/category';

const dailyFixture = (overrides = {}) => ({
  userId: '123',
  currentBalance: 90000,
  expectedIncome: 200000,
  fixedExpenses: 50000,
  eventBuffer: 10000,
  daysUntilNextPayday: 10,
  dailyLimit: 23000,
  snapshotDate: '2026-10-11',
  ...overrides,
});

const monthlyFixture = (overrides = {}) => ({
  userId: '123',
  yearMonth: '2026-09',
  incomeAmount: 200000,
  expenseAmount: 100000,
  transferAmount: 10000,
  revision: 1,
  calculatedAt: '2026-10-01T00:00:00',
  ...overrides,
});

const categoryFixture = (overrides = {}) => ({
  userId: '123',
  yearMonth: '2026-09',
  revision: 1,
  categories: [
    { category: 'INCOME', amount: 0 },
    { category: 'FOOD', amount: 12000 },
  ],
  calculatedAt: '2026-10-01T00:00:00',
  ...overrides,
});

test('엔드포인트 상수: 명세 경로와 일치', () => {
  assert.equal(API_ENDPOINTS.ASSET.CASHFLOW.DAILY_LIMIT, DAILY_PATH);
  assert.equal(API_ENDPOINTS.ASSET.CASHFLOW.MONTHLY, MONTHLY_PATH);
  assert.equal(API_ENDPOINTS.ASSET.CASHFLOW.CATEGORY, CATEGORY_PATH);
});

// ── API-15 ───────────────────────────────────────────────────

test('API-15: POST, Bearer, 명세 키 이름 본문(userId 미전송), 응답 변환', async () => {
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyFixture()));

  const input = {
    expectedIncome: 200000,
    fixedExpenses: 50000,
    eventBuffer: 10000,
    daysUntilNextPayday: 10,
    snapshotDate: '2026-10-11',
    forceRefresh: false,
  };
  const result = await calculateDailyLimit(input);

  const [request] = gateway.requestsTo(DAILY_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.deepEqual(request.body, input);
  assert.equal('userId' in request.body, false);

  assert.deepEqual(result, {
    currentBalance: 90000,
    expectedIncome: 200000,
    fixedExpenses: 50000,
    eventBuffer: 10000,
    daysUntilNextPayday: 10,
    dailyLimit: 23000,
    snapshotDate: '2026-10-11',
  });
});

test('API-15: 선택 필드를 생략하면 본문에서 빠진다(null·기본값 채우지 않음)', async () => {
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyFixture({ dailyLimit: 0, currentBalance: 0 })));

  const result = await calculateDailyLimit({ daysUntilNextPayday: 7 });

  assert.deepEqual(gateway.requestsTo(DAILY_PATH)[0].body, { daysUntilNextPayday: 7 });
  assert.equal(result.dailyLimit, 0, '0은 정상 값');
  assert.equal(buildDailyLimitRequestBody({ daysUntilNextPayday: 7 }), '{"daysUntilNextPayday":7}');
});

test('API-15: 응답에 없는 값(spent/status/formulaItems)을 만들어 내지 않는다', async () => {
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyFixture()));
  const result = await calculateDailyLimit({ daysUntilNextPayday: 10 });
  for (const key of ['spent', 'status', 'formulaItems', 'recommendItems', 'daysLeft', 'amount']) {
    assert.equal(key in result, false, key);
  }
});

test('API-15: 요청 입력 검증 실패는 요청 없이 거부', async () => {
  for (const bad of [
    {},
    { daysUntilNextPayday: 0 },
    { daysUntilNextPayday: 1.5 },
    { daysUntilNextPayday: '10' },
    { daysUntilNextPayday: 10, expectedIncome: -1 },
    { daysUntilNextPayday: 10, fixedExpenses: '5000' },
    { daysUntilNextPayday: 10, eventBuffer: 0.5 },
    { daysUntilNextPayday: 10, snapshotDate: '2026-13-01' },
    { daysUntilNextPayday: 10, snapshotDate: '20261011' },
    { daysUntilNextPayday: 10, forceRefresh: 'true' },
  ]) {
    const error = await rejectionOf(calculateDailyLimit(bad));
    assert.ok(error instanceof OnboardingRequestError, JSON.stringify(bad));
  }
  assert.throws(() => buildDailyLimitRequestBody(null), OnboardingRequestError);
  assert.equal(gateway.requests.length, 0);
});

test('API-15: 응답 형식 위반 → invalidResponse', async () => {
  for (const body of [
    dailyFixture({ dailyLimit: '23000' }),
    dailyFixture({ currentBalance: null }),
    dailyFixture({ snapshotDate: '2026/10/11' }),
    dailyFixture({ daysUntilNextPayday: 0 }),
    { userId: '123' },
    [],
  ]) {
    gateway.route('POST', DAILY_PATH, jsonRoute(body));
    const error = await rejectionOf(calculateDailyLimit({ daysUntilNextPayday: 10 }));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
    assert.equal(getAssetErrorType(error), ASSET_ERROR_TYPE.INVALID_RESPONSE);
  }
});

test('API-15: 400 검증 오류·5xx는 분류만 하고 자동 재시도하지 않는다', async () => {
  gateway.route(
    'POST',
    DAILY_PATH,
    jsonRoute({ status: 400, error: 'Bad Request' }, { status: 400 })
  );
  assert.equal(
    getAssetErrorType(await rejectionOf(calculateDailyLimit({ daysUntilNextPayday: 10 }))),
    ASSET_ERROR_TYPE.BAD_REQUEST
  );
  gateway.route('POST', DAILY_PATH, jsonRoute({ code: 'X' }, { status: 503 }));
  assert.equal(
    getAssetErrorType(await rejectionOf(calculateDailyLimit({ daysUntilNextPayday: 10 }))),
    ASSET_ERROR_TYPE.SERVER
  );
  assert.equal(gateway.requestsTo(DAILY_PATH).length, 2);
});

// ── API-16 ───────────────────────────────────────────────────

test('API-16: GET yearMonth 쿼리, 본문 없음, 응답 변환(0원 정상)', async () => {
  gateway.route(
    'GET',
    MONTHLY_PATH,
    jsonRoute(monthlyFixture({ incomeAmount: 0, expenseAmount: 0, transferAmount: 0 }))
  );

  const result = await fetchMonthlyCashflow('2026-09');

  const [request] = gateway.requestsTo(MONTHLY_PATH);
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.query, 'yearMonth=2026-09');
  assert.equal(request.body, undefined);
  assert.deepEqual(result, {
    yearMonth: '2026-09',
    incomeAmount: 0,
    expenseAmount: 0,
    transferAmount: 0,
    revision: 1,
    calculatedAt: '2026-10-01T00:00:00',
  });
});

test('API-16/17: yearMonth 형식 검증(YYYY-MM)과 응답 위반', async () => {
  for (const bad of ['2026-9', '2026-13', '202609', '2026-09-01', '', null, undefined, 202609]) {
    for (const call of [() => fetchMonthlyCashflow(bad), () => fetchCategoryCashflow(bad)]) {
      const error = await rejectionOf(call());
      assert.ok(error instanceof OnboardingRequestError, String(bad));
      assert.equal(error.code, ASSET_REQUEST_ERROR.INVALID_YEAR_MONTH);
    }
  }
  assert.equal(gateway.requests.length, 0);

  for (const body of [
    monthlyFixture({ yearMonth: '2026-9' }),
    monthlyFixture({ incomeAmount: '1' }),
    monthlyFixture({ revision: -1 }),
    monthlyFixture({ calculatedAt: '' }),
  ]) {
    gateway.route('GET', MONTHLY_PATH, jsonRoute(body));
    assert.equal((await rejectionOf(fetchMonthlyCashflow('2026-09'))).invalidResponse, true);
  }
});

// ── API-17 ───────────────────────────────────────────────────

test('API-17: GET yearMonth 쿼리, 카테고리를 서버 순서대로 변환(0원 카테고리 포함)', async () => {
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryFixture()));

  const result = await fetchCategoryCashflow('2026-09');

  assert.equal(gateway.requestsTo(CATEGORY_PATH)[0].query, 'yearMonth=2026-09');
  assert.deepEqual(result, {
    yearMonth: '2026-09',
    revision: 1,
    categories: [
      { category: 'INCOME', amount: 0 },
      { category: 'FOOD', amount: 12000 },
    ],
    calculatedAt: '2026-10-01T00:00:00',
  });
});

test('API-17: 빈 categories는 정상, 알 수 없는 카테고리·금액 타입은 invalidResponse', async () => {
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryFixture({ categories: [] })));
  assert.deepEqual((await fetchCategoryCashflow('2026-09')).categories, []);

  for (const body of [
    categoryFixture({ categories: [{ category: 'GAME', amount: 1 }] }),
    categoryFixture({ categories: [{ category: 'FOOD', amount: '1' }] }),
    categoryFixture({ categories: {} }),
  ]) {
    gateway.route('GET', CATEGORY_PATH, jsonRoute(body));
    assert.equal((await rejectionOf(fetchCategoryCashflow('2026-09'))).invalidResponse, true);
  }
});

// ── 공통 ─────────────────────────────────────────────────────

test('오류 분류: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK, 토큰 없음 → UNAUTHORIZED', async () => {
  gateway.route('GET', MONTHLY_PATH, jsonRoute({}, { delay: 600 }));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchMonthlyCashflow('2026-09'))),
    ASSET_ERROR_TYPE.TIMEOUT
  );

  gateway.route('GET', MONTHLY_PATH, () => ({ destroy: true }));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchMonthlyCashflow('2026-09'))),
    ASSET_ERROR_TYPE.NETWORK
  );

  await tokenService.clearTokens();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyFixture()));
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyFixture()));
  for (const call of [
    () => fetchMonthlyCashflow('2026-09'),
    () => calculateDailyLimit({ daysUntilNextPayday: 10 }),
  ]) {
    assert.equal(getAssetErrorType(await rejectionOf(call())), ASSET_ERROR_TYPE.UNAUTHORIZED);
  }
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
