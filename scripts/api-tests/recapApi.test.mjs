// Work Money Recap API 통신 레이어(API-37/38) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/recapApi.test.mjs
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
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const {
  RECAP_ERROR_TYPE,
  RECAP_REQUEST_ERROR,
  fetchRecap,
  fetchRecapMonths,
  getRecapErrorType,
  isValidRecapYearMonth,
  mapRecapMonthsResponse,
  mapRecapResponse,
} = await import('../../src/features/moneyRecap/recapApi.js');

// JS Number로는 정확히 표현할 수 없는 크기의 user_id (Number('123456789012345678') === 123456789012345680)
const BIG_UID = '123456789012345678';
const YM = '2026-09';
const monthsPath = uid => `/api/v1/work/recap/${uid}/months`;
const recapPath = (uid, ym) => `/api/v1/work/recap/${uid}/${ym}`;

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const jsonRoute = body => () => ({ body });

const categoryFixture = (overrides = {}) => ({
  code: 'FOOD',
  label: '식비',
  amount: '420000.0000',
  share: '0.6000',
  ...overrides,
});

// 서버 소스(schemas/recap.py, endpoints/recap.py) 기준. 금액은 str(Decimal) 형태(스케일 4).
const recapFixture = (overrides = {}) => ({
  user_id: 123,
  year_month: YM,
  revision: 2,
  total_income: '1250000.0000',
  total_expense: '700000.0000',
  total_transfer: '50000.0000',
  net_saving: '550000.0000',
  categories: [
    categoryFixture(),
    categoryFixture({ code: 'CAFE', label: '카페/디저트', amount: '280000.0000', share: '0.4000' }),
  ],
  top_category: categoryFixture(),
  nickname: '식도락 탐험가',
  nickname_reason: '식비 비중이 가장 높아요.',
  coverage: {
    total_tx: 24,
    classified_tx: 22,
    unclassified_share: '0.08',
    is_reliable: true,
    note: '분석 데이터가 충분해요.',
  },
  insights: ['수입의 44% 가 남았어요.'],
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

test('엔드포인트: 명세 경로(API-37/38)를 /api/v1 전체 경로로 구성', () => {
  assert.equal(API_ENDPOINTS.WORK.RECAP_MONTHS('123'), '/api/v1/work/recap/123/months');
  assert.equal(API_ENDPOINTS.WORK.RECAP('123', YM), '/api/v1/work/recap/123/2026-09');
});

// ── API-37 ───────────────────────────────────────────────────

test('API-37: 정상 응답은 months 배열(서버 순서 그대로)만 반환, 응답 user_id는 사용하지 않음', async () => {
  gateway.route(
    'GET',
    monthsPath(BIG_UID),
    jsonRoute({ user_id: 123, months: ['2026-09', '2026-08', '2025-12'] })
  );

  const months = await fetchRecapMonths(BIG_UID);

  assert.deepEqual(months, ['2026-09', '2026-08', '2025-12']);
});

test('API-37: GET, 경로에 user_id 문자열 그대로, Bearer 첨부, 본문·쿼리 없음', async () => {
  gateway.route('GET', monthsPath(BIG_UID), jsonRoute({ user_id: 123, months: ['2026-09'] }));

  await fetchRecapMonths(BIG_UID);

  const requests = gateway.requestsTo(monthsPath(BIG_UID));
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.ok(request.body == null || Object.keys(request.body).length === 0, '요청 본문 없음');
});

test('API-37: Recap이 없으면 200 + months [] 는 정상(빈 배열을 오류로 바꾸지 않음)', async () => {
  gateway.route('GET', monthsPath(BIG_UID), jsonRoute({ user_id: 123, months: [] }));

  assert.deepEqual(await fetchRecapMonths(BIG_UID), []);
});

test('API-37: 응답 user_id가 정밀도 손실 값이어도 사용하지 않음', async () => {
  gateway.route('GET', monthsPath(BIG_UID), () => ({
    rawBody: `{"user_id":${BIG_UID},"months":["2026-09"]}`,
  }));

  const months = await fetchRecapMonths(BIG_UID);

  assert.deepEqual(months, ['2026-09']);
  assert.equal(JSON.stringify(months).includes('12345678901234568'), false);
});

const MONTHS_INVALID_BODIES = {
  '배열 본문': [],
  null: null,
  '문자열 본문': 'ok',
  'months 누락': { user_id: 123 },
  'months가 null': { user_id: 123, months: null },
  'months가 객체': { user_id: 123, months: {} },
  'months 원소가 숫자': { user_id: 123, months: [202609] },
  'months 원소 형식 오류(YYYY/MM)': { user_id: 123, months: ['2026/09'] },
  'months 원소 월 범위 초과': { user_id: 123, months: ['2026-13'] },
  'months 원소 월 00': { user_id: 123, months: ['2026-00'] },
  'months 원소에 공백': { user_id: 123, months: ['2026-09 '] },
  'months 중복': { user_id: 123, months: ['2026-09', '2026-09'] },
};

for (const [name, body] of Object.entries(MONTHS_INVALID_BODIES)) {
  test(`API-37: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('GET', monthsPath(BIG_UID), () => ({ body }));

    const error = await rejectionOf(fetchRecapMonths(BIG_UID));

    assert.equal(error.invalidResponse, true);
    assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(monthsPath(BIG_UID)).length, 1, '재시도 없음');
  });
}

// ── API-38 정상 응답 / 요청 구성 ──────────────────────────────

test('API-38: 정상 응답을 camelCase 모델로 변환 (금액·share는 문자열 그대로, user_id 미반환)', async () => {
  gateway.route('GET', recapPath(BIG_UID, YM), jsonRoute(recapFixture()));

  const recap = await fetchRecap(BIG_UID, YM);

  assert.deepEqual(recap, {
    yearMonth: YM,
    revision: 2,
    totalIncome: '1250000.0000',
    totalExpense: '700000.0000',
    totalTransfer: '50000.0000',
    netSaving: '550000.0000',
    categories: [
      { code: 'FOOD', label: '식비', amount: '420000.0000', share: '0.6000' },
      { code: 'CAFE', label: '카페/디저트', amount: '280000.0000', share: '0.4000' },
    ],
    topCategory: { code: 'FOOD', label: '식비', amount: '420000.0000', share: '0.6000' },
    nickname: '식도락 탐험가',
    nicknameReason: '식비 비중이 가장 높아요.',
    coverage: {
      totalTx: 24,
      classifiedTx: 22,
      unclassifiedShare: '0.08',
      isReliable: true,
      note: '분석 데이터가 충분해요.',
    },
    insights: ['수입의 44% 가 남았어요.'],
  });
  assert.equal('userId' in recap, false);
  assert.equal(typeof recap.totalIncome, 'string', 'Number로 변환하지 않음');
});

test('API-38: GET, 경로에 user_id·year_month 그대로, Bearer 첨부, 본문·쿼리 없음', async () => {
  gateway.route('GET', recapPath(BIG_UID, YM), jsonRoute(recapFixture()));

  await fetchRecap(BIG_UID, YM);

  const requests = gateway.requestsTo(recapPath(BIG_UID, YM));
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.ok(request.body == null || Object.keys(request.body).length === 0, '요청 본문 없음');
});

test('API-38: 응답 user_id가 정밀도 손실 값이어도 사용하지 않음', async () => {
  gateway.route('GET', recapPath(BIG_UID, YM), () => ({
    rawBody: JSON.stringify(recapFixture()).replace('"user_id":123', `"user_id":${BIG_UID}`),
  }));

  const recap = await fetchRecap(BIG_UID, YM);

  assert.equal(recap.yearMonth, YM);
  assert.equal(JSON.stringify(recap).includes('user_id'), false);
  assert.equal(JSON.stringify(recap).includes('12345678901234568'), false);
});

test('API-38: 서버가 null로 준 top_category/nickname/nickname_reason은 null 그대로(가공 없음)', async () => {
  gateway.route(
    'GET',
    recapPath(BIG_UID, YM),
    jsonRoute(recapFixture({ top_category: null, nickname: null, nickname_reason: null }))
  );

  const recap = await fetchRecap(BIG_UID, YM);

  assert.equal(recap.topCategory, null);
  assert.equal(recap.nickname, null);
  assert.equal(recap.nicknameReason, null);
});

test('API-38: categories/insights 빈 배열, is_reliable=false, 지출 0의 share "0"도 정상', async () => {
  gateway.route(
    'GET',
    recapPath(BIG_UID, YM),
    jsonRoute(
      recapFixture({
        total_expense: '0',
        net_saving: '1250000.0000',
        categories: [],
        top_category: null,
        nickname: null,
        nickname_reason: null,
        coverage: {
          total_tx: 0,
          classified_tx: 0,
          unclassified_share: '0',
          is_reliable: false,
          note: '분석에 필요한 데이터가 부족합니다.',
        },
        insights: [],
      })
    )
  );

  const recap = await fetchRecap(BIG_UID, YM);

  assert.deepEqual(recap.categories, []);
  assert.deepEqual(recap.insights, []);
  assert.equal(recap.totalExpense, '0');
  assert.equal(recap.coverage.isReliable, false);
  assert.equal(recap.coverage.note, '분석에 필요한 데이터가 부족합니다.');
});

test('API-38: 명세에 없는 tx_count 등 추가 필드가 와도 읽지 않고 정상 처리', async () => {
  gateway.route(
    'GET',
    recapPath(BIG_UID, YM),
    jsonRoute(
      recapFixture({
        categories: [{ ...categoryFixture(), tx_count: 3 }],
        top_category: { ...categoryFixture(), tx_count: 3 },
        extra_field: 'x',
      })
    )
  );

  const recap = await fetchRecap(BIG_UID, YM);

  assert.deepEqual(Object.keys(recap.categories[0]), ['code', 'label', 'amount', 'share']);
  assert.equal('extraField' in recap, false);
});

// ── 금액 문자열 검증 ─────────────────────────────────────────

const VALID_AMOUNTS = [
  '0',
  '200000',
  '200000.0000',
  '1000.00',
  '1234.5678',
  '0.0001',
  '-12000.5000',
  '-1',
  // 부호가 붙은 0은 전달 계층에서는 거부하지 않는다(표시 정규화 '0원'은 화면 로직의 책임, 2부).
  '-0',
  '-0.0000',
  '9007199254740993',
  '9007199254740993.0000',
  '123456789012345678901.5000',
];

for (const amount of VALID_AMOUNTS) {
  test(`API-38: 금액 "${amount}"는 정상, 문자열 그대로 보존(Number 변환·반올림 없음)`, () => {
    const recap = mapRecapResponse(
      recapFixture({
        total_income: amount,
        net_saving: amount,
        categories: [categoryFixture({ amount })],
        top_category: categoryFixture({ amount }),
      })
    );

    assert.equal(recap.totalIncome, amount);
    assert.equal(recap.netSaving, amount);
    assert.equal(recap.categories[0].amount, amount);
    assert.equal(recap.topCategory.amount, amount);
  });
}

const INVALID_AMOUNTS = {
  '선행 0': '007',
  '소수점으로 끝남': '1.',
  '정수부 없음': '.5',
  '지수 표기(소문자)': '1e3',
  '지수 표기(대문자)': '1E+3',
  NaN: 'NaN',
  Infinity: 'Infinity',
  '앞 공백': ' 100',
  '뒤 공백': '100 ',
  쉼표: '1,000',
  '+ 부호': '+100',
  '빈 문자열': '',
  문자: 'abc',
  null: null,
  '숫자 타입': 100,
  '숫자 타입(소수)': 1000.5,
  undefined: undefined,
};

for (const [name, amount] of Object.entries(INVALID_AMOUNTS)) {
  for (const key of ['total_income', 'total_expense', 'total_transfer', 'net_saving']) {
    test(`API-38: 잘못된 금액(${name}) in ${key} → INVALID_RESPONSE`, () => {
      assert.throws(
        () => mapRecapResponse(recapFixture({ [key]: amount })),
        error => error.invalidResponse === true && error.invalidField === `recap.${key}`
      );
    });
  }

  test(`API-38: 잘못된 금액(${name}) in categories[].amount / top_category.amount → INVALID_RESPONSE`, () => {
    assert.throws(
      () => mapRecapResponse(recapFixture({ categories: [categoryFixture({ amount })] })),
      error => error.invalidResponse === true && error.invalidField === 'categories[0].amount'
    );
    assert.throws(
      () => mapRecapResponse(recapFixture({ top_category: categoryFixture({ amount }) })),
      error => error.invalidResponse === true && error.invalidField === 'top_category.amount'
    );
  });
}

// ── share 검증 (NaN→0% 대체 금지) ────────────────────────────

for (const share of ['0', '0.0', '0.5', '0.5000', '0.3333', '0.0001', '1', '1.0', '1.0000']) {
  test(`API-38: share "${share}"는 정상, 문자열 그대로 보존`, () => {
    const recap = mapRecapResponse(
      recapFixture({
        categories: [categoryFixture({ share })],
        top_category: categoryFixture({ share }),
      })
    );

    assert.equal(recap.categories[0].share, share);
    assert.equal(recap.topCategory.share, share);
  });
}

const INVALID_SHARES = {
  '1 초과': '1.0001',
  2: '2',
  음수: '-0.1',
  NaN: 'NaN',
  '지수 표기': '1e-1',
  '정수부 없음': '.5',
  '소수점으로 끝남': '1.',
  '선행 0': '00.5',
  '앞 공백': ' 0.5',
  쉼표: '0,5',
  퍼센트: '50%',
  '빈 문자열': '',
  null: null,
  '숫자 타입': 0.5,
  undefined: undefined,
};

for (const [name, share] of Object.entries(INVALID_SHARES)) {
  test(`API-38: 잘못된 share(${name}) → 0%로 대체하지 않고 응답 전체 INVALID_RESPONSE`, () => {
    assert.throws(
      () =>
        mapRecapResponse(
          recapFixture({ categories: [categoryFixture(), categoryFixture({ code: 'X', share })] })
        ),
      error => error.invalidResponse === true && error.invalidField === 'categories[1].share'
    );
    assert.throws(
      () => mapRecapResponse(recapFixture({ top_category: categoryFixture({ share }) })),
      error => error.invalidResponse === true && error.invalidField === 'top_category.share'
    );
  });
}

test('API-38: 잘못된 share가 섞인 HTTP 응답은 정상 데이터 없이 reject, 재시도 없음', async () => {
  gateway.route(
    'GET',
    recapPath(BIG_UID, YM),
    jsonRoute(recapFixture({ categories: [categoryFixture({ share: 'NaN' })] }))
  );

  const error = await rejectionOf(fetchRecap(BIG_UID, YM));

  assert.equal(error.invalidResponse, true);
  assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.INVALID_RESPONSE);
  assert.equal(gateway.requestsTo(recapPath(BIG_UID, YM)).length, 1);
});

// ── 응답 구조 검증 ───────────────────────────────────────────

const without = key => {
  const body = recapFixture();
  delete body[key];
  return body;
};

const withoutCoverageKey = key => {
  const body = recapFixture();
  delete body.coverage[key];
  return body;
};

const INVALID_BODIES = {
  '배열 본문': [],
  null: null,
  '문자열 본문': 'ok',
  'year_month 누락': without('year_month'),
  'year_month 형식 오류': recapFixture({ year_month: '2026-9' }),
  'year_month가 요청한 월과 다름': recapFixture({ year_month: '2026-08' }),
  'revision 누락': without('revision'),
  'revision 문자열': recapFixture({ revision: '1' }),
  'revision 음수': recapFixture({ revision: -1 }),
  'revision 소수': recapFixture({ revision: 1.5 }),
  'total_income 누락': without('total_income'),
  'net_saving 누락': without('net_saving'),
  'categories 누락': without('categories'),
  'categories가 객체': recapFixture({ categories: {} }),
  'categories 원소가 null': recapFixture({ categories: [null] }),
  'category code 누락': recapFixture({ categories: [{ ...categoryFixture(), code: undefined }] }),
  'category label 빈 문자열': recapFixture({ categories: [categoryFixture({ label: ' ' })] }),
  'category code 중복': recapFixture({ categories: [categoryFixture(), categoryFixture()] }),
  'top_category 누락': without('top_category'),
  'top_category가 문자열': recapFixture({ top_category: 'FOOD' }),
  'top_category 항목 불완전': recapFixture({ top_category: { code: 'FOOD' } }),
  'nickname 누락': without('nickname'),
  'nickname 빈 문자열': recapFixture({ nickname: '' }),
  'nickname 숫자': recapFixture({ nickname: 1 }),
  'nickname_reason 누락': without('nickname_reason'),
  'nickname_reason 숫자': recapFixture({ nickname_reason: 1 }),
  'coverage 누락': without('coverage'),
  'coverage가 null': recapFixture({ coverage: null }),
  'coverage.total_tx 누락': withoutCoverageKey('total_tx'),
  'coverage.total_tx 문자열': recapFixture({
    coverage: { ...recapFixture().coverage, total_tx: '24' },
  }),
  'coverage.classified_tx 음수': recapFixture({
    coverage: { ...recapFixture().coverage, classified_tx: -1 },
  }),
  'coverage.unclassified_share 형식 오류': recapFixture({
    coverage: { ...recapFixture().coverage, unclassified_share: '1.5' },
  }),
  'coverage.is_reliable 문자열': recapFixture({
    coverage: { ...recapFixture().coverage, is_reliable: 'true' },
  }),
  'coverage.is_reliable 누락': withoutCoverageKey('is_reliable'),
  'coverage.note 누락': withoutCoverageKey('note'),
  'coverage.note null': recapFixture({ coverage: { ...recapFixture().coverage, note: null } }),
  'insights 누락': without('insights'),
  'insights 원소가 숫자': recapFixture({ insights: [1] }),
  'insights가 문자열': recapFixture({ insights: '문구' }),
};

for (const [name, body] of Object.entries(INVALID_BODIES)) {
  test(`API-38: 잘못된 응답(${name})은 정상 데이터로 처리하지 않음 → INVALID_RESPONSE`, async () => {
    gateway.route('GET', recapPath(BIG_UID, YM), () => ({ body }));

    const error = await rejectionOf(fetchRecap(BIG_UID, YM));

    assert.equal(error.invalidResponse, true);
    assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.INVALID_RESPONSE);
    assert.equal(typeof error.invalidField, 'string');
    assert.equal(gateway.requestsTo(recapPath(BIG_UID, YM)).length, 1, '재시도 없음');
  });
}

test('mapRecapResponse / mapRecapMonthsResponse: 값이 없다는 이유로 기본값을 채우지 않음', () => {
  for (const mapper of [mapRecapResponse, mapRecapMonthsResponse]) {
    assert.throws(
      () => mapper({}),
      error => error.invalidResponse === true
    );
    assert.throws(
      () => mapper(undefined),
      error => error.invalidResponse === true
    );
  }
});

// ── 요청 검증 ────────────────────────────────────────────────

const INVALID_USER_IDS = [
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
];

test('잘못된 user_id는 두 API 모두 요청을 보내지 않고 INVALID_REQUEST', async () => {
  for (const userId of INVALID_USER_IDS) {
    for (const call of [() => fetchRecapMonths(userId), () => fetchRecap(userId, YM)]) {
      const error = await rejectionOf(call());
      assert.ok(error instanceof OnboardingRequestError);
      assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_USER_ID);
      assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.INVALID_REQUEST);
      assert.equal(
        error.message.includes(String(userId)) && userId !== undefined && userId !== '',
        false
      );
    }
  }
  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
});

test('잘못된 year_month는 요청을 보내지 않고 INVALID_REQUEST', async () => {
  for (const yearMonth of [
    undefined,
    null,
    '',
    '2026-9',
    '2026-13',
    '2026-00',
    '202609',
    '2026/09',
    '2026-09-01',
    ' 2026-09',
    'months',
    '../2026-09',
    202609,
  ]) {
    const error = await rejectionOf(fetchRecap(BIG_UID, yearMonth));
    assert.ok(error instanceof OnboardingRequestError);
    assert.equal(error.code, RECAP_REQUEST_ERROR.INVALID_YEAR_MONTH);
    assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.INVALID_REQUEST);
  }
  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
});

test('isValidRecapYearMonth: YYYY-MM(월 01~12) 문자열만 허용', () => {
  for (const ok of ['2026-09', '2025-12', '1999-01']) assert.equal(isValidRecapYearMonth(ok), true);
  for (const bad of ['2026-9', '2026-13', '2026-00', '2026-09\n', 202609, null, undefined]) {
    assert.equal(isValidRecapYearMonth(bad), false);
  }
});

// ── 오류 상태 구분 ───────────────────────────────────────────

const HTTP_ERROR_CASES = [
  { status: 400, body: { detail: 'year_month 형식' }, type: RECAP_ERROR_TYPE.BAD_REQUEST },
  { status: 401, body: { code: 'UNAUTHENTICATED' }, type: RECAP_ERROR_TYPE.UNAUTHORIZED },
  {
    status: 403,
    body: { detail: '본인의 정보만 조회할 수 있습니다.' },
    type: RECAP_ERROR_TYPE.FORBIDDEN,
  },
  {
    status: 404,
    body: { detail: '2026-09 의 집계 데이터가 아직 없습니다.' },
    type: RECAP_ERROR_TYPE.NOT_FOUND,
  },
  {
    status: 422,
    body: { code: 'VALIDATION_ERROR', message: '요청 형식 오류' },
    type: RECAP_ERROR_TYPE.VALIDATION,
  },
  { status: 429, body: {}, type: RECAP_ERROR_TYPE.CLIENT_ERROR },
  { status: 500, body: { code: 'INTERNAL_ERROR' }, type: RECAP_ERROR_TYPE.SERVER },
  { status: 503, body: { code: 'DB_CONNECTION_ERROR' }, type: RECAP_ERROR_TYPE.SERVER },
];

for (const errorCase of HTTP_ERROR_CASES) {
  test(`API-38: HTTP ${errorCase.status} → ${errorCase.type}, 정상값으로 바꾸지 않고 1회만 전송`, async () => {
    gateway.route('GET', recapPath(BIG_UID, YM), () => ({
      public: true,
      status: errorCase.status,
      body: errorCase.body,
    }));

    const error = await rejectionOf(fetchRecap(BIG_UID, YM));

    assert.equal(error.status, errorCase.status);
    assert.equal(getRecapErrorType(error), errorCase.type);
    assert.notEqual(error.invalidResponse, true, '검증 실패와 구분');
    assert.equal(gateway.requestsTo(recapPath(BIG_UID, YM)).length, 1);
  });

  test(`API-37: HTTP ${errorCase.status} → ${errorCase.type}, 자동 재시도 없이 1회만 전송`, async () => {
    gateway.route('GET', monthsPath(BIG_UID), () => ({
      public: true,
      status: errorCase.status,
      body: errorCase.body,
    }));

    const error = await rejectionOf(fetchRecapMonths(BIG_UID));

    assert.equal(error.status, errorCase.status);
    assert.equal(getRecapErrorType(error), errorCase.type);
    assert.equal(gateway.requestsTo(monthsPath(BIG_UID)).length, 1);
  });
}

test('토큰 없이 호출하면 AUTH_REQUIRED(401), refresh 시도 없음', async () => {
  await tokenService.clearTokens();
  gateway.route('GET', monthsPath(BIG_UID), jsonRoute({ user_id: 123, months: [] }));

  const error = await rejectionOf(fetchRecapMonths(BIG_UID));

  assert.equal(error.kind, API_ERROR_KIND.AUTH_REQUIRED);
  assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.UNAUTHORIZED);
  assert.equal(gateway.refreshCount, 0);
});

test('토큰 만료 시 refresh 후 1회 재전송으로 성공 (기존 apiClient 인증 처리 재사용)', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.route('GET', recapPath(BIG_UID, YM), jsonRoute(recapFixture()));

  const recap = await fetchRecap(BIG_UID, YM);

  assert.equal(recap.yearMonth, YM);
  assert.equal(gateway.refreshCount, 1);
  const requests = gateway.requestsTo(recapPath(BIG_UID, YM));
  assert.equal(requests.length, 2, '만료 401 1회 + 새 토큰 재전송 1회');
});

test('네트워크 연결 끊김 → NETWORK, 1회만 전송', async () => {
  gateway.route('GET', recapPath(BIG_UID, YM), () => ({ public: true, destroy: true }));

  const error = await rejectionOf(fetchRecap(BIG_UID, YM));

  assert.equal(error.kind, API_ERROR_KIND.NETWORK);
  assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.NETWORK);
  assert.equal(gateway.requestsTo(recapPath(BIG_UID, YM)).length, 1);
});

test('응답 지연 → TIMEOUT (네트워크 오류와 구분), 자동 재시도 없음', async () => {
  gateway.route('GET', recapPath(BIG_UID, YM), () => ({ public: true, delay: 1200, body: {} }));

  const error = await rejectionOf(fetchRecap(BIG_UID, YM));

  assert.equal(error.kind, API_ERROR_KIND.TIMEOUT);
  assert.equal(getRecapErrorType(error), RECAP_ERROR_TYPE.TIMEOUT);
  assert.equal(gateway.requestsTo(recapPath(BIG_UID, YM)).length, 1);
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

test('1부 범위: recapApi는 화면·Redux·AsyncStorage·기존 Work slice를 import하지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/moneyRecap/recapApi.js', import.meta.url),
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
  // 금액·비율을 숫자로 변환하지 않는다.
  assert.equal(/Number\(|parseFloat|parseInt|toLocaleString|BigInt/.test(code), false);
});
