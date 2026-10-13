// Work 미래 자금 시뮬레이션 API 통신 레이어(API-39~41) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/simulatorApi.test.mjs
// user_id·토큰은 모의 서버 전용 가짜 값이다. 기준값 개수는 서버가 정하므로 어떤 테스트도 개수를 단언하지 않는다.
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
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const { API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const readinessApi = await import('../../src/features/work/readinessApi.js');
const {
  ASSET_SOURCE,
  BASELINE_KIND,
  SIMULATOR_ERROR_TYPE,
  SIMULATOR_REQUEST_ERROR,
  buildAdjustmentRequestBody,
  buildSimulationRequestBody,
  fetchSimulatorBaselines,
  getSimulatorErrorType,
  mapAdjustmentResponse,
  mapBaselinesResponse,
  mapSimulationResponse,
  runAdjustment,
  runSimulation,
} = await import('../../src/features/work/simulatorApi.js');

// JS Number로는 정확히 표현할 수 없는 크기의 user_id (Number('123456789012345678') === 123456789012345680)
const BIG_UID = '123456789012345678';
const BASELINES_PATH = '/api/v1/work/simulator/baselines';
const simulatePath = uid => `/api/v1/work/simulator/${uid}/simulate`;
const adjustPath = uid => `/api/v1/work/simulator/${uid}/adjust`;

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const jsonRoute = body => () => ({ body });

// 서버 소스(cost_baseline.py to_dict) 형태. 개수를 가정하지 않기 위해 픽스처는 필요한 만큼만 만든다.
const baselineFixture = (overrides = {}) => ({
  key: 'living_base_monthly',
  label: '월 기본 생활비 (주거·여가 제외)',
  amount: '700000',
  kind: 'ASSUMPTION',
  source: '모아제 가정',
  as_of: '-',
  scope: '식비·통신·교통·생필품을 묶은 가정값이며 공표 통계가 아니다.',
  url: '',
  ...overrides,
});

const statisticFixture = () =>
  baselineFixture({
    key: 'rir_ratio',
    label: '월소득 대비 월임대료 비율(RIR)',
    amount: '0.158',
    kind: 'STATISTIC',
    source: '국토교통부 2023년도 주거실태조사 (2024-12 발표)',
    as_of: '2023년 조사',
    scope: '전체 임차가구 평균.',
    url: 'https://example.invalid/policy',
  });

// 서버 소스(schemas/simulator.py SimulateResponse) 형태. PDF p.43 예시값과 같은 숫자를 쓴다.
const simulationFixture = (overrides = {}) => ({
  user_id: 123,
  target: {
    deposit: '10000000',
    move_in_cost: '1000000',
    emergency_fund: '3600000',
    total: '14600000',
  },
  cashflow: {
    income: '2500000',
    housing: '500000',
    living: '500000',
    leisure: '200000',
    expense: '1200000',
    savable: '1300000',
  },
  current_asset: '1000000',
  gap: '13600000',
  months_to_goal: 11,
  progress_rate: '0.0685',
  asset_source: 'ASSET_SERVICE',
  assumed_keys: ['emergency_months'],
  baselines: [baselineFixture()],
  advice: ['지금 속도면 약 11개월 뒤에 목표에 도달해요.'],
  ...overrides,
});

// 서버 소스(schemas/simulator.py AdjustResponse) 형태. PDF p.44 예시값과 같은 숫자를 쓴다.
const adjustmentFixture = (overrides = {}) => ({
  user_id: 123,
  monthly_delta: '-100000',
  base_monthly_savable: '1300000',
  adjusted_monthly_savable: '1400000',
  base_months_to_goal: 11,
  adjusted_months_to_goal: 10,
  months_saved: 1,
  message: '달성 시점이 1개월 앞당겨져요.',
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

// ── 엔드포인트 ───────────────────────────────────────────────

test('엔드포인트 상수: 명세 경로(Gateway /api/v1/work/simulator/...)와 일치', () => {
  assert.equal(API_ENDPOINTS.WORK.SIMULATOR_BASELINES, BASELINES_PATH);
  assert.equal(API_ENDPOINTS.WORK.SIMULATE(BIG_UID), simulatePath(BIG_UID));
  assert.equal(API_ENDPOINTS.WORK.ADJUST(BIG_UID), adjustPath(BIG_UID));
});

test('기존 엔드포인트 상수는 변경되지 않음 (API-30~38)', () => {
  const work = API_ENDPOINTS.WORK;
  assert.equal(work.READINESS('1'), '/api/v1/work/readiness/1');
  assert.equal(work.RECAP_MONTHS('1'), '/api/v1/work/recap/1/months');
  assert.equal(work.RECAP('1', '2026-10'), '/api/v1/work/recap/1/2026-10');
  assert.equal(work.ONBOARDING.QUESTIONS, '/api/v1/work/onboarding/questions');
  assert.equal(work.ONBOARDING.PROFILE('1'), '/api/v1/work/onboarding/1/profile');
});

// ── API-39 기준값 목록 ───────────────────────────────────────

test('API-39: GET, user_id·본문·쿼리 없음, Bearer 첨부', async () => {
  gateway.route('GET', BASELINES_PATH, jsonRoute([baselineFixture()]));

  await fetchSimulatorBaselines();

  const requests = gateway.requestsTo(BASELINES_PATH);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined, 'GET 본문 없음');
  assert.equal(request.headers['idempotency-key'], undefined);
});

test('API-39: 배열을 camelCase로 변환하고 서버 순서·값을 그대로 유지 (개수 단언 없음)', async () => {
  const fixtures = [statisticFixture(), baselineFixture()];
  gateway.route('GET', BASELINES_PATH, jsonRoute(fixtures));

  const baselines = await fetchSimulatorBaselines();

  assert.deepEqual(baselines, [
    {
      key: 'rir_ratio',
      label: fixtures[0].label,
      amount: '0.158',
      kind: BASELINE_KIND.STATISTIC,
      source: fixtures[0].source,
      asOf: '2023년 조사',
      scope: fixtures[0].scope,
      url: 'https://example.invalid/policy',
    },
    {
      key: 'living_base_monthly',
      label: fixtures[1].label,
      amount: '700000',
      kind: BASELINE_KIND.ASSUMPTION,
      source: '모아제 가정',
      asOf: '-',
      scope: fixtures[1].scope,
      url: '',
    },
  ]);
});

test('API-39: 서버가 주는 기준값 개수(0개·1개·여러 개)에 의존하지 않음', async () => {
  for (const count of [0, 1, 13, 40]) {
    const list = Array.from({ length: count }, (_, index) =>
      baselineFixture({ key: `baseline_${index}` })
    );
    gateway.route('GET', BASELINES_PATH, jsonRoute(list));

    const baselines = await fetchSimulatorBaselines();

    assert.deepEqual(
      baselines.map(baseline => baseline.key),
      list.map(item => item.key),
      '개수와 순서를 서버가 준 대로 유지'
    );
  }
});

test('API-39: amount는 금액·개월 수·비율 모두 문자열 그대로 보존 (의미 해석 없음)', async () => {
  gateway.route(
    'GET',
    BASELINES_PATH,
    jsonRoute([
      baselineFixture({ key: 'a', amount: '27390000' }),
      baselineFixture({ key: 'b', amount: '3' }),
      baselineFixture({ key: 'c', amount: '0.158' }),
      baselineFixture({ key: 'd', amount: '0' }),
    ])
  );

  const baselines = await fetchSimulatorBaselines();

  assert.deepEqual(
    baselines.map(baseline => baseline.amount),
    ['27390000', '3', '0.158', '0']
  );
  assert.ok(baselines.every(baseline => typeof baseline.amount === 'string'));
});

test('API-39: kind 알려진 값 3개와 알 수 없는 문자열도 그대로 전달 (응답 거부 안 함)', async () => {
  const kinds = [...Object.values(BASELINE_KIND), 'SOMETHING_NEW'];
  gateway.route(
    'GET',
    BASELINES_PATH,
    jsonRoute(kinds.map((kind, index) => baselineFixture({ key: `k${index}`, kind })))
  );

  const baselines = await fetchSimulatorBaselines();

  assert.deepEqual(
    baselines.map(baseline => baseline.kind),
    kinds
  );
});

// ── API-40 시뮬레이션 ────────────────────────────────────────

test('API-40: POST, 경로에 user_id 문자열 그대로, Bearer 첨부, 입력이 없으면 본문은 {}', async () => {
  gateway.route('POST', simulatePath(BIG_UID), jsonRoute(simulationFixture()));

  await runSimulation(BIG_UID);

  const requests = gateway.requestsTo(simulatePath(BIG_UID));
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.deepEqual(request.body, {}, '본문은 {}이며 입력 필드를 보내지 않음');
  assert.equal(request.headers['idempotency-key'], undefined, '조회성 계산이므로 멱등 키 없음');
});

test('API-40: 입력한 항목만 문자열 그대로 전송 (null·빈 항목 미전송, user_id 본문 미포함)', async () => {
  gateway.route('POST', simulatePath(BIG_UID), jsonRoute(simulationFixture()));

  await runSimulation(BIG_UID, {
    monthlyIncome: '2500000',
    monthlyHousing: undefined,
    monthlyLiving: null,
    monthlyLeisure: '',
    deposit: '0',
    moveInCost: '1000000',
    // currentAsset은 호출부가 명시하지 않았으므로 보내지 않는다.
  });

  const [request] = gateway.requestsTo(simulatePath(BIG_UID));
  assert.deepEqual(request.body, {
    monthly_income: '2500000',
    deposit: '0',
    move_in_cost: '1000000',
  });
  for (const key of ['monthly_housing', 'monthly_living', 'monthly_leisure', 'current_asset']) {
    assert.equal(key in request.body, false, `${key} 미전송`);
  }
  assert.equal('user_id' in request.body, false);
  assert.equal(JSON.stringify(request.body).includes('null'), false, 'null을 보내지 않음');
});

test('API-40: 정상 응답을 camelCase 모델로 변환 (서버 값 그대로, 재계산·기본값 없음)', async () => {
  gateway.route('POST', simulatePath(BIG_UID), jsonRoute(simulationFixture()));

  const result = await runSimulation(BIG_UID);

  assert.deepEqual(result, {
    target: {
      deposit: '10000000',
      moveInCost: '1000000',
      emergencyFund: '3600000',
      total: '14600000',
    },
    cashflow: {
      income: '2500000',
      housing: '500000',
      living: '500000',
      leisure: '200000',
      expense: '1200000',
      savable: '1300000',
    },
    currentAsset: '1000000',
    gap: '13600000',
    monthsToGoal: 11,
    progressRate: '0.0685',
    assetSource: ASSET_SOURCE.ASSET_SERVICE,
    assumedKeys: ['emergency_months'],
    baselines: [
      {
        key: 'living_base_monthly',
        label: '월 기본 생활비 (주거·여가 제외)',
        amount: '700000',
        kind: 'ASSUMPTION',
        source: '모아제 가정',
        asOf: '-',
        scope: '식비·통신·교통·생필품을 묶은 가정값이며 공표 통계가 아니다.',
        url: '',
      },
    ],
    advice: ['지금 속도면 약 11개월 뒤에 목표에 도달해요.'],
  });
  assert.equal(result.cashflow.expense, '1200000', 'cashflow.expense는 명세 필드로 포함');
  assert.equal('userId' in result, false, '응답 user_id는 반환하지 않음');
});

test('API-40: 응답의 user_id가 정밀도 손실 값이어도 사용하지 않음', async () => {
  gateway.route('POST', simulatePath(BIG_UID), () => ({
    rawBody: JSON.stringify(simulationFixture()).replace('"user_id":123', `"user_id":${BIG_UID}`),
  }));

  const result = await runSimulation(BIG_UID);

  assert.equal(result.gap, '13600000');
  assert.equal(JSON.stringify(result).includes('user_id'), false);
  assert.equal(JSON.stringify(result).includes('12345678901234568'), false);
});

test('API-40: 소수 표기 금액 문자열, 음수 savable, 0 값은 문자열 그대로 보존', async () => {
  gateway.route(
    'POST',
    simulatePath(BIG_UID),
    jsonRoute(
      simulationFixture({
        gap: '13600000.0000',
        cashflow: { ...simulationFixture().cashflow, savable: '-250000', expense: '2750000' },
        current_asset: '0',
        progress_rate: '1.0',
      })
    )
  );

  const result = await runSimulation(BIG_UID);

  assert.equal(result.gap, '13600000.0000');
  assert.equal(result.cashflow.savable, '-250000');
  assert.equal(result.currentAsset, '0');
  assert.equal(result.progressRate, '1.0');
});

test('API-40: months_to_goal 정수 / 0(이미 달성) / null(계산 불가)는 모두 정상 응답 (오류·기본값 변환 없음)', async () => {
  for (const monthsToGoal of [11, 0, null]) {
    gateway.route(
      'POST',
      simulatePath(BIG_UID),
      jsonRoute(simulationFixture({ months_to_goal: monthsToGoal }))
    );
    const result = await runSimulation(BIG_UID);
    assert.equal(result.monthsToGoal, monthsToGoal);
  }
});

test('API-40: asset_source 4개 값과 알 수 없는 문자열도 그대로 전달 (응답 거부 안 함)', async () => {
  for (const source of [...Object.values(ASSET_SOURCE), 'SOMETHING_NEW']) {
    gateway.route(
      'POST',
      simulatePath(BIG_UID),
      jsonRoute(simulationFixture({ asset_source: source }))
    );
    assert.equal((await runSimulation(BIG_UID)).assetSource, source);
  }
});

test('API-40: assumed_keys·baselines·advice가 빈 배열이어도 정상', async () => {
  gateway.route(
    'POST',
    simulatePath(BIG_UID),
    jsonRoute(simulationFixture({ assumed_keys: [], baselines: [], advice: [] }))
  );

  const result = await runSimulation(BIG_UID);

  assert.deepEqual(result.assumedKeys, []);
  assert.deepEqual(result.baselines, []);
  assert.deepEqual(result.advice, []);
});

test('ASSET_SOURCE는 사회인 준비도(API-36)와 같은 상수를 재사용', () => {
  assert.equal(ASSET_SOURCE, readinessApi.ASSET_SOURCE);
});

// ── API-41 조건부 시뮬레이션 ─────────────────────────────────

test('API-41: POST, monthly_delta 필수 포함, 입력 항목과 함께 문자열 그대로 전송', async () => {
  gateway.route('POST', adjustPath(BIG_UID), jsonRoute(adjustmentFixture()));

  await runAdjustment(BIG_UID, { monthlyIncome: '2500000', currentAsset: '1000000' }, '-100000');

  const requests = gateway.requestsTo(adjustPath(BIG_UID));
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.deepEqual(request.body, {
    monthly_income: '2500000',
    current_asset: '1000000',
    monthly_delta: '-100000',
  });
  assert.equal('user_id' in request.body, false);
  assert.equal(request.headers['idempotency-key'], undefined);
});

test('API-41: 입력 항목이 없어도 monthly_delta만으로 요청 가능', async () => {
  gateway.route('POST', adjustPath(BIG_UID), jsonRoute(adjustmentFixture()));

  await runAdjustment(BIG_UID, undefined, '50000');

  const [request] = gateway.requestsTo(adjustPath(BIG_UID));
  assert.deepEqual(request.body, { monthly_delta: '50000' });
});

test('API-41: 정상 응답을 camelCase 모델로 변환 (서버 문구·수치 그대로)', async () => {
  gateway.route('POST', adjustPath(BIG_UID), jsonRoute(adjustmentFixture()));

  const result = await runAdjustment(BIG_UID, {}, '-100000');

  assert.deepEqual(result, {
    monthlyDelta: '-100000',
    baseMonthlySavable: '1300000',
    adjustedMonthlySavable: '1400000',
    baseMonthsToGoal: 11,
    adjustedMonthsToGoal: 10,
    monthsSaved: 1,
    message: '달성 시점이 1개월 앞당겨져요.',
  });
  assert.equal(JSON.stringify(result).includes('user_id'), false, '응답 user_id 미노출');
});

test('API-41: months_saved 양수/0/음수(늦어짐)/null, 개월 수 null은 모두 정상 응답', async () => {
  const cases = [
    { base: 11, adjusted: 10, saved: 1 },
    { base: 11, adjusted: 11, saved: 0 },
    { base: 10, adjusted: 12, saved: -2 },
    { base: 11, adjusted: null, saved: null },
    { base: null, adjusted: 9, saved: null },
    { base: null, adjusted: null, saved: null },
  ];
  for (const { base, adjusted, saved } of cases) {
    gateway.route(
      'POST',
      adjustPath(BIG_UID),
      jsonRoute(
        adjustmentFixture({
          base_months_to_goal: base,
          adjusted_months_to_goal: adjusted,
          months_saved: saved,
        })
      )
    );
    const result = await runAdjustment(BIG_UID, {}, '-100000');
    assert.equal(result.baseMonthsToGoal, base);
    assert.equal(result.adjustedMonthsToGoal, adjusted);
    assert.equal(result.monthsSaved, saved);
  }
});

// ── 요청 본문 검증 ───────────────────────────────────────────

const requestErrorOf = fn => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('요청 구성이 실패해야 하는데 성공했습니다.');
};

test('buildSimulationRequestBody: 입력 없음(undefined·null·{})은 {}', () => {
  assert.deepEqual(buildSimulationRequestBody(), {});
  assert.deepEqual(buildSimulationRequestBody(null), {});
  assert.deepEqual(buildSimulationRequestBody({}), {});
});

test('buildSimulationRequestBody: 7개 입력을 명세 키로 변환 (큰 정수 문자열 보존)', () => {
  const body = buildSimulationRequestBody({
    monthlyIncome: '2500000',
    monthlyHousing: '500000',
    monthlyLiving: '500000',
    monthlyLeisure: '200000',
    deposit: '123456789012345678901',
    moveInCost: '1000000',
    currentAsset: '0',
  });

  assert.deepEqual(body, {
    monthly_income: '2500000',
    monthly_housing: '500000',
    monthly_living: '500000',
    monthly_leisure: '200000',
    deposit: '123456789012345678901',
    move_in_cost: '1000000',
    current_asset: '0',
  });
});

test('buildSimulationRequestBody: 정수 문자열이 아닌 값은 요청 전에 거부 (값은 오류에 싣지 않음)', () => {
  const invalidValues = [
    '-1', // 음수
    '1.5', // 소수
    '1e6', // 지수 표기
    '1,000', // 쉼표
    ' 100', // 공백
    '100 ',
    '   ', // 공백만
    '01', // 선행 0
    '+100', // 부호
    '12abc',
    2500000, // number (문자열만 허용)
    0,
    true,
    {},
    [],
    NaN,
  ];
  for (const value of invalidValues) {
    const error = requestErrorOf(() => buildSimulationRequestBody({ monthlyIncome: value }));
    assert.ok(error instanceof OnboardingRequestError, `${String(value)} 거부`);
    assert.equal(error.code, SIMULATOR_REQUEST_ERROR.INVALID_INPUT_VALUE);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.INVALID_REQUEST);
    // 고정 안내문("0 이상" 등)과 겹치지 않는 3자 이상 문자열 입력만 오류 메시지 미포함을 확인한다.
    if (typeof value === 'string' && value.trim().length >= 3) {
      assert.equal(
        error.message.includes(value.trim()),
        false,
        '입력 값은 오류 메시지에 싣지 않음'
      );
    }
  }
});

test('buildSimulationRequestBody: 허용되지 않은 키와 객체가 아닌 입력은 거부 (조용히 무시하지 않음)', () => {
  for (const inputs of [
    { monthly_income: '100' }, // snake_case는 호출부 키가 아니다
    { monthlyIncome: '100', userId: '1' },
    { monthlyIncome: '100', targetMonths: '12' },
    { monthlyDelta: '-100' },
  ]) {
    const error = requestErrorOf(() => buildSimulationRequestBody(inputs));
    assert.equal(error.code, SIMULATOR_REQUEST_ERROR.UNKNOWN_INPUT_KEY);
  }
  for (const inputs of ['100', 100, [], ['100']]) {
    const error = requestErrorOf(() => buildSimulationRequestBody(inputs));
    assert.equal(error.code, SIMULATOR_REQUEST_ERROR.INVALID_INPUTS);
  }
});

test('buildAdjustmentRequestBody: monthly_delta 필수·부호 있는 정수 문자열만 허용', () => {
  assert.deepEqual(buildAdjustmentRequestBody({}, '-100000'), { monthly_delta: '-100000' });
  assert.deepEqual(buildAdjustmentRequestBody({}, '100000'), { monthly_delta: '100000' });
  assert.deepEqual(buildAdjustmentRequestBody({}, '0'), { monthly_delta: '0' });

  for (const delta of [
    undefined,
    null,
    '',
    ' ',
    '-0',
    '+100',
    '1.5',
    '-1.5',
    '1e3',
    '1,000',
    '--1',
    '01',
    '-01',
    ' -100',
    -100000, // number
    0,
    NaN,
  ]) {
    const error = requestErrorOf(() => buildAdjustmentRequestBody({}, delta));
    assert.ok(error instanceof OnboardingRequestError, `${String(delta)} 거부`);
    assert.equal(error.code, SIMULATOR_REQUEST_ERROR.INVALID_MONTHLY_DELTA);
  }
});

test('buildAdjustmentRequestBody: 입력 항목 검증은 시뮬레이션과 동일 (monthly_delta로 대체 불가)', () => {
  const error = requestErrorOf(() => buildAdjustmentRequestBody({ deposit: '-5' }, '-100'));
  assert.equal(error.code, SIMULATOR_REQUEST_ERROR.INVALID_INPUT_VALUE);
});

test('잘못된 user_id·잘못된 입력은 요청을 보내지 않고 INVALID_REQUEST (API-40/41)', async () => {
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
    for (const call of [() => runSimulation(userId), () => runAdjustment(userId, {}, '-100')]) {
      const error = await rejectionOf(call());
      assert.ok(error instanceof OnboardingRequestError);
      assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_USER_ID);
      assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.INVALID_REQUEST);
    }
  }

  const badInput = await rejectionOf(runSimulation(BIG_UID, { deposit: '-1' }));
  assert.equal(badInput.code, SIMULATOR_REQUEST_ERROR.INVALID_INPUT_VALUE);
  const badDelta = await rejectionOf(runAdjustment(BIG_UID, {}, 100));
  assert.equal(badDelta.code, SIMULATOR_REQUEST_ERROR.INVALID_MONTHLY_DELTA);

  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
});

// ── 응답 검증 ────────────────────────────────────────────────

const withoutKey = (body, key) => {
  const copy = { ...body };
  delete copy[key];
  return copy;
};

const withNested = (body, key, overrides) => ({ ...body, [key]: { ...body[key], ...overrides } });

const withoutNested = (body, key, nestedKey) => ({
  ...body,
  [key]: withoutKey(body[key], nestedKey),
});

const INVALID_BASELINE_BODIES = {
  '객체 본문': {},
  '배열 아닌 null': null,
  '문자열 본문': 'ok',
  '원소가 null': [null],
  '원소가 배열': [[]],
  'key 누락': [withoutKey(baselineFixture(), 'key')],
  'key 빈 문자열': [baselineFixture({ key: ' ' })],
  'label 누락': [withoutKey(baselineFixture(), 'label')],
  'amount 숫자형': [baselineFixture({ amount: 700000 })],
  'amount 누락': [withoutKey(baselineFixture(), 'amount')],
  'amount 쉼표': [baselineFixture({ amount: '700,000' })],
  'amount 지수 표기': [baselineFixture({ amount: '7E+5' })],
  'amount null': [baselineFixture({ amount: null })],
  'kind 누락': [withoutKey(baselineFixture(), 'kind')],
  'kind null': [baselineFixture({ kind: null })],
  'source 누락': [withoutKey(baselineFixture(), 'source')],
  'as_of 누락': [withoutKey(baselineFixture(), 'as_of')],
  'as_of 숫자형': [baselineFixture({ as_of: 2023 })],
  'scope 누락': [withoutKey(baselineFixture(), 'scope')],
  'url 누락': [withoutKey(baselineFixture(), 'url')],
  'url null': [baselineFixture({ url: null })],
  'key 중복': [baselineFixture(), baselineFixture()],
  '유효 항목 뒤에 잘못된 항목': [baselineFixture(), baselineFixture({ key: 'b', amount: 'x' })],
};

for (const [name, body] of Object.entries(INVALID_BASELINE_BODIES)) {
  test(`API-39: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('GET', BASELINES_PATH, () => ({ body }));

    const error = await rejectionOf(fetchSimulatorBaselines());

    assert.equal(error.invalidResponse, true);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(BASELINES_PATH).length, 1, '재시도 없음');
  });
}

const baseSimulation = simulationFixture();

const INVALID_SIMULATION_BODIES = {
  '배열 본문': [],
  null: null,
  '문자열 본문': 'ok',
  'target 누락': withoutKey(baseSimulation, 'target'),
  'target이 배열': { ...baseSimulation, target: [] },
  'target.total 누락': withoutNested(baseSimulation, 'target', 'total'),
  'target.deposit 숫자형': withNested(baseSimulation, 'target', { deposit: 10000000 }),
  'target.move_in_cost 쉼표': withNested(baseSimulation, 'target', { move_in_cost: '1,000,000' }),
  'target.emergency_fund null': withNested(baseSimulation, 'target', { emergency_fund: null }),
  'cashflow 누락': withoutKey(baseSimulation, 'cashflow'),
  'cashflow.expense 누락': withoutNested(baseSimulation, 'cashflow', 'expense'),
  'cashflow.expense 숫자형': withNested(baseSimulation, 'cashflow', { expense: 1200000 }),
  'cashflow.savable 누락': withoutNested(baseSimulation, 'cashflow', 'savable'),
  'cashflow.income null': withNested(baseSimulation, 'cashflow', { income: null }),
  'cashflow.housing 누락': withoutNested(baseSimulation, 'cashflow', 'housing'),
  'cashflow.living 누락': withoutNested(baseSimulation, 'cashflow', 'living'),
  'cashflow.leisure 누락': withoutNested(baseSimulation, 'cashflow', 'leisure'),
  'current_asset 누락': withoutKey(baseSimulation, 'current_asset'),
  'current_asset 숫자형': { ...baseSimulation, current_asset: 1000000 },
  'gap 누락': withoutKey(baseSimulation, 'gap'),
  'gap 숫자형': { ...baseSimulation, gap: 13600000 },
  'gap 공백': { ...baseSimulation, gap: ' 13600000' },
  'months_to_goal 키 누락': withoutKey(baseSimulation, 'months_to_goal'),
  'months_to_goal 소수': { ...baseSimulation, months_to_goal: 10.5 },
  'months_to_goal 음수': { ...baseSimulation, months_to_goal: -1 },
  'months_to_goal 문자열': { ...baseSimulation, months_to_goal: '11' },
  'progress_rate 누락': withoutKey(baseSimulation, 'progress_rate'),
  'progress_rate 숫자형': { ...baseSimulation, progress_rate: 0.0685 },
  'progress_rate 1 초과': { ...baseSimulation, progress_rate: '1.5' },
  'progress_rate 음수': { ...baseSimulation, progress_rate: '-0.1' },
  'asset_source 누락': withoutKey(baseSimulation, 'asset_source'),
  'asset_source null': { ...baseSimulation, asset_source: null },
  'asset_source 빈 문자열': { ...baseSimulation, asset_source: '' },
  'assumed_keys 누락': withoutKey(baseSimulation, 'assumed_keys'),
  'assumed_keys에 숫자': { ...baseSimulation, assumed_keys: [1] },
  'assumed_keys가 문자열': { ...baseSimulation, assumed_keys: 'emergency_months' },
  'baselines 누락': withoutKey(baseSimulation, 'baselines'),
  'baselines가 객체': { ...baseSimulation, baselines: {} },
  'baselines 원소가 잘못됨': { ...baseSimulation, baselines: [baselineFixture({ amount: 1 })] },
  'baselines key 중복': { ...baseSimulation, baselines: [baselineFixture(), baselineFixture()] },
  'advice 누락': withoutKey(baseSimulation, 'advice'),
  'advice에 null': { ...baseSimulation, advice: [null] },
  'advice가 문자열': { ...baseSimulation, advice: '조언' },
};

for (const [name, body] of Object.entries(INVALID_SIMULATION_BODIES)) {
  test(`API-40: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('POST', simulatePath(BIG_UID), () => ({ body }));

    const error = await rejectionOf(runSimulation(BIG_UID));

    assert.equal(error.invalidResponse, true);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(simulatePath(BIG_UID)).length, 1, '재시도 없음');
  });
}

const baseAdjustment = adjustmentFixture();

const INVALID_ADJUSTMENT_BODIES = {
  '배열 본문': [],
  null: null,
  '문자열 본문': 'ok',
  'monthly_delta 누락': withoutKey(baseAdjustment, 'monthly_delta'),
  'monthly_delta 숫자형': { ...baseAdjustment, monthly_delta: -100000 },
  'base_monthly_savable 누락': withoutKey(baseAdjustment, 'base_monthly_savable'),
  'base_monthly_savable 숫자형': { ...baseAdjustment, base_monthly_savable: 1300000 },
  'adjusted_monthly_savable 누락': withoutKey(baseAdjustment, 'adjusted_monthly_savable'),
  'adjusted_monthly_savable null': { ...baseAdjustment, adjusted_monthly_savable: null },
  'base_months_to_goal 키 누락': withoutKey(baseAdjustment, 'base_months_to_goal'),
  'base_months_to_goal 소수': { ...baseAdjustment, base_months_to_goal: 1.5 },
  'base_months_to_goal 음수': { ...baseAdjustment, base_months_to_goal: -1 },
  'adjusted_months_to_goal 키 누락': withoutKey(baseAdjustment, 'adjusted_months_to_goal'),
  'adjusted_months_to_goal 문자열': { ...baseAdjustment, adjusted_months_to_goal: '10' },
  'months_saved 키 누락': withoutKey(baseAdjustment, 'months_saved'),
  'months_saved 소수': { ...baseAdjustment, months_saved: 0.5 },
  'months_saved 문자열': { ...baseAdjustment, months_saved: '1' },
  'message 누락': withoutKey(baseAdjustment, 'message'),
  'message null': { ...baseAdjustment, message: null },
  'message 빈 문자열': { ...baseAdjustment, message: ' ' },
};

for (const [name, body] of Object.entries(INVALID_ADJUSTMENT_BODIES)) {
  test(`API-41: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('POST', adjustPath(BIG_UID), () => ({ body }));

    const error = await rejectionOf(runAdjustment(BIG_UID, {}, '-100000'));

    assert.equal(error.invalidResponse, true);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(adjustPath(BIG_UID)).length, 1, '재시도 없음');
  });
}

test('map*Response: 값이 없다는 이유로 기본값을 채우지 않음', () => {
  for (const mapper of [mapBaselinesResponse, mapSimulationResponse, mapAdjustmentResponse]) {
    assert.throws(
      () => mapper({}),
      error => error.invalidResponse === true,
      mapper.name
    );
    assert.throws(
      () => mapper(undefined),
      error => error.invalidResponse === true,
      mapper.name
    );
  }
});

// ── 오류 상태 구분 ───────────────────────────────────────────

const HTTP_ERROR_CASES = [
  { status: 401, body: { code: 'UNAUTHENTICATED' }, type: SIMULATOR_ERROR_TYPE.UNAUTHORIZED },
  {
    status: 403,
    body: { detail: '본인의 정보만 조회할 수 있습니다.' },
    type: SIMULATOR_ERROR_TYPE.FORBIDDEN,
  },
  { status: 404, body: { detail: 'not found' }, type: SIMULATOR_ERROR_TYPE.NOT_FOUND },
  {
    status: 422,
    body: { code: 'VALIDATION_ERROR', message: '요청 형식 오류' },
    type: SIMULATOR_ERROR_TYPE.VALIDATION,
  },
  { status: 429, body: {}, type: SIMULATOR_ERROR_TYPE.CLIENT_ERROR },
  { status: 500, body: { code: 'INTERNAL_ERROR' }, type: SIMULATOR_ERROR_TYPE.SERVER },
  { status: 503, body: { code: 'DB_CONNECTION_ERROR' }, type: SIMULATOR_ERROR_TYPE.SERVER },
];

const API_CALLS = [
  {
    name: 'API-39',
    method: 'GET',
    path: BASELINES_PATH,
    call: () => fetchSimulatorBaselines(),
    okBody: [baselineFixture()],
  },
  {
    name: 'API-40',
    method: 'POST',
    path: simulatePath(BIG_UID),
    call: () => runSimulation(BIG_UID, { monthlyIncome: '2500000' }),
    okBody: simulationFixture(),
  },
  {
    name: 'API-41',
    method: 'POST',
    path: adjustPath(BIG_UID),
    call: () => runAdjustment(BIG_UID, { monthlyIncome: '2500000' }, '-100000'),
    okBody: adjustmentFixture(),
  },
];

for (const api of API_CALLS) {
  for (const errorCase of HTTP_ERROR_CASES) {
    test(`${api.name}: HTTP ${errorCase.status} → ${errorCase.type}, 자동 재시도 없이 1회만 전송`, async () => {
      gateway.route(api.method, api.path, () => ({
        public: true,
        status: errorCase.status,
        body: errorCase.body,
      }));

      const error = await rejectionOf(api.call());

      assert.equal(error.status, errorCase.status);
      assert.equal(getSimulatorErrorType(error), errorCase.type);
      assert.notEqual(error.invalidResponse, true, '검증 실패와 구분');
      assert.equal(gateway.requestsTo(api.path).length, 1);
      assert.equal(gateway.requestsTo(api.path)[0].headers['idempotency-key'], undefined);
    });
  }

  test(`${api.name}: 토큰 없이 호출하면 AUTH_REQUIRED(401), refresh 시도 없음`, async () => {
    await tokenService.clearTokens();
    gateway.route(api.method, api.path, jsonRoute(api.okBody));

    const error = await rejectionOf(api.call());

    assert.equal(error.kind, API_ERROR_KIND.AUTH_REQUIRED);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.UNAUTHORIZED);
    assert.equal(gateway.refreshCount, 0);
  });

  test(`${api.name}: 네트워크 연결 끊김 → NETWORK, 1회만 전송`, async () => {
    gateway.route(api.method, api.path, () => ({ public: true, destroy: true }));

    const error = await rejectionOf(api.call());

    assert.equal(error.kind, API_ERROR_KIND.NETWORK);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.NETWORK);
    assert.equal(gateway.requestsTo(api.path).length, 1);
  });

  test(`${api.name}: 응답 지연 → TIMEOUT (네트워크 오류와 구분), 자동 재시도 없음`, async () => {
    gateway.route(api.method, api.path, () => ({ public: true, delay: 1200, body: {} }));

    const error = await rejectionOf(api.call());

    assert.equal(error.kind, API_ERROR_KIND.TIMEOUT);
    assert.equal(getSimulatorErrorType(error), SIMULATOR_ERROR_TYPE.TIMEOUT);
    assert.equal(gateway.requestsTo(api.path).length, 1);
  });
}

test('토큰 만료 시 refresh 후 1회 재전송으로 성공 (기존 apiClient 인증 처리 재사용)', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.route('POST', simulatePath(BIG_UID), jsonRoute(simulationFixture()));

  const result = await runSimulation(BIG_UID, { monthlyIncome: '2500000' });

  assert.equal(result.gap, '13600000');
  assert.equal(gateway.refreshCount, 1);
  const requests = gateway.requestsTo(simulatePath(BIG_UID));
  assert.equal(requests.length, 2, '만료 401 1회 + 새 토큰 재전송 1회');
  assert.deepEqual(requests[1].body, { monthly_income: '2500000' }, '재전송 본문도 동일');
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

test('1부 범위: simulatorApi는 화면·Redux·AsyncStorage·기존 Work slice를 import하지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/work/simulatorApi.js', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(imports.sort(), [
    '../../constants/apiEndpoints',
    '../../services/apiClient',
    '../../services/apiResponse',
    '../onboarding/onboardingApi',
    './readinessApi',
  ]);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/AsyncStorage|useSelector|dispatch|react-native|Math\.random/.test(code), false);
  assert.equal(/\/api\/v1\//.test(code), false, '경로를 직접 하드코딩하지 않음');
  assert.equal(/idempotent|Idempotency/i.test(code), false, '멱등 키/재시도 옵션 미사용');
});
