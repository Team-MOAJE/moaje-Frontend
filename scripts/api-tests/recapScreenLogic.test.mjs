// Money Recap 화면 로직(API-37/38) 단위 테스트. 서버 호출 없음(fetcher 주입), React/RN 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/recapScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const { OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const { RECAP_ERROR_TYPE, mapRecapResponse } =
  await import('../../src/features/moneyRecap/recapApi.js');
const logic = await import('../../src/features/moneyRecap/recapScreenLogic.js');
const {
  RECAP_EMPTY_REASON,
  RECAP_ERROR_POLICY,
  RECAP_SESSION_STATUS,
  buildRecapEntryViewModel,
  buildRecapStoriesData,
  canRetryRecapError,
  createRecapSession,
  describeRecapEmpty,
  describeRecapError,
  formatWonString,
  formatYearMonthLabel,
  loadRecap,
  loadRecapMonths,
  shareToPercent,
} = logic;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';
const YM = '2026-09';
const YM_PREV = '2026-08';

const apiError = (kind, status = null) => createApiError({ kind, status });
const http = status =>
  apiError(status >= 500 ? API_ERROR_KIND.HTTP_5XX : API_ERROR_KIND.HTTP_4XX, status);

const deepFreeze = value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// 서버 원본(snake_case) fixture. 반드시 1부의 실제 mapRecapResponse를 거쳐 화면 로직에 들어간다.
const categoryBody = (overrides = {}) => ({
  code: 'FOOD',
  label: '식비',
  amount: '420000.0000',
  share: '0.6000',
  ...overrides,
});

const serverBody = (overrides = {}) => ({
  user_id: 123,
  year_month: YM,
  revision: 2,
  total_income: '1250000.0000',
  total_expense: '700000.0000',
  total_transfer: '50000.0000',
  net_saving: '550000.0000',
  categories: [
    categoryBody(),
    categoryBody({ code: 'CAFE', label: '카페/디저트', amount: '280000.0000', share: '0.4000' }),
  ],
  top_category: categoryBody(),
  nickname: '식도락 탐험가',
  nickname_reason: '식비 비중이 가장 높아요.',
  coverage: {
    total_tx: 24,
    classified_tx: 22,
    unclassified_share: '0.08',
    is_reliable: true,
    note: '분석 데이터가 충분해요.',
  },
  insights: ['수입의 44% 가 남았어요.', '식비가 가장 큰 비중이에요.'],
  ...overrides,
});

const modelOf = (overrides = {}) => mapRecapResponse(serverBody(overrides));

const expectInvalid = fn =>
  assert.throws(
    fn,
    error => error.invalidResponse === true && typeof error.invalidField === 'string'
  );

// ── formatWonString ──────────────────────────────────────────

const WON_CASES = [
  ['0', '0원'],
  ['1000', '1,000원'],
  ['200000', '200,000원'],
  ['200000.0000', '200,000원'],
  ['1000.00', '1,000원'],
  ['1000.000000', '1,000원'],
  ['1234.5000', '1,234.5원'],
  ['1234.5678', '1,234.5678원'],
  ['0.0001', '0.0001원'],
  ['0.5', '0.5원'],
  ['-1234.5000', '-1,234.5원'],
  ['-12000', '-12,000원'],
  ['-0', '0원'],
  ['-0.0000', '0원'],
  ['0.0000', '0원'],
  ['9007199254740993', '9,007,199,254,740,993원'],
  ['9007199254740993.0000', '9,007,199,254,740,993원'],
  ['123456789012345678901', '123,456,789,012,345,678,901원'],
  ['-9007199254740993', '-9,007,199,254,740,993원'],
  ['9007199254740993.1000', '9,007,199,254,740,993.1원'],
];

for (const [input, expected] of WON_CASES) {
  test(`formatWonString("${input}") → ${expected} (정밀도 보존)`, () => {
    assert.equal(formatWonString(input), expected);
  });
}

for (const bad of [
  '007',
  '1.',
  '.5',
  '1e3',
  '1E+3',
  'NaN',
  ' 100',
  '100 ',
  '1,000',
  '+100',
  '',
  'abc',
  null,
  undefined,
  100,
  1000.5,
]) {
  test(`formatWonString(${JSON.stringify(bad)}) → invalidResponse로 throw`, () => {
    expectInvalid(() => formatWonString(bad));
  });
}

// ── shareToPercent ───────────────────────────────────────────

const PERCENT_CASES = [
  ['0', 0],
  ['0.0', 0],
  ['0.0000', 0],
  ['0.0049', 0],
  ['0.005', 1],
  ['0.285', 29], // 부동소수점이면 28.499…가 되는 값
  ['0.2849', 28],
  ['0.3333', 33],
  ['0.5', 50],
  ['0.5000', 50],
  ['0.6667', 67],
  ['0.9949', 99],
  ['0.995', 100],
  ['1', 100],
  ['1.0', 100],
  ['1.0000', 100],
];

for (const [input, expected] of PERCENT_CASES) {
  test(`shareToPercent("${input}") → ${expected} (표시용 정수 백분율)`, () => {
    assert.equal(shareToPercent(input), expected);
  });
}

for (const bad of [
  '1.0001',
  '-0.1',
  'NaN',
  '1e-1',
  '.5',
  '1.',
  '00.5',
  ' 0.5',
  '50%',
  '',
  null,
  0.5,
]) {
  test(`shareToPercent(${JSON.stringify(bad)}) → 0%로 대체하지 않고 throw`, () => {
    expectInvalid(() => shareToPercent(bad));
  });
}

test('formatYearMonthLabel: 형식이 맞을 때만 라벨, 아니면 null', () => {
  assert.equal(formatYearMonthLabel('2026-09'), '2026년 9월');
  assert.equal(formatYearMonthLabel('2025-12'), '2025년 12월');
  assert.equal(formatYearMonthLabel('2026-10'), '2026년 10월');
  for (const bad of ['2026-13', '2026-9', '202609', '', null, undefined, 202609]) {
    assert.equal(formatYearMonthLabel(bad), null);
  }
});

// ── buildRecapStoriesData: 서버 원본 → 1부 모델 → 스토리 data ──

test('매핑: data 키는 cover/summary/category/insights뿐 (hourly/comparison/closing/등급·점수 없음)', () => {
  const data = buildRecapStoriesData(modelOf());

  assert.deepEqual(Object.keys(data), ['cover', 'summary', 'category', 'insights']);
  for (const key of ['hourly', 'comparison', 'closing']) assert.equal(key in data, false);
  for (const key of ['grade', 'score', 'scorePercent', 'gradeLabel']) {
    assert.equal(key in data.cover, false);
  }
  assert.equal('days' in data.category, false);
  assert.equal('legend' in data.category, false);
  assert.equal('tags' in data.category, false);
});

test('매핑: nickname_reason → cover.summaryText, nickname → cover.badgeLabel (서버 원문 그대로)', () => {
  const body = serverBody({
    nickname: '식도락 탐험가',
    nickname_reason: '식비 비중이 가장 높아요.',
  });
  const data = buildRecapStoriesData(mapRecapResponse(body));

  assert.equal(data.cover.summaryText, body.nickname_reason);
  assert.equal(data.cover.badgeLabel, body.nickname);
  assert.equal(data.cover.period, '2026년 9월');
  assert.deepEqual(data.cover.titleLines, ['머니', '리캡']);
});

test('매핑: nickname / nickname_reason이 null이면 해당 키를 만들지 않음 (각각 독립)', () => {
  const both = buildRecapStoriesData(modelOf({ nickname: null, nickname_reason: null }));
  assert.equal('badgeLabel' in both.cover, false);
  assert.equal('summaryText' in both.cover, false);

  const onlyNickname = buildRecapStoriesData(modelOf({ nickname: '별명', nickname_reason: null }));
  assert.equal(onlyNickname.cover.badgeLabel, '별명');
  assert.equal('summaryText' in onlyNickname.cover, false);

  const onlyReason = buildRecapStoriesData(modelOf({ nickname: null, nickname_reason: '이유' }));
  assert.equal('badgeLabel' in onlyReason.cover, false);
  assert.equal(onlyReason.cover.summaryText, '이유');
});

test('매핑: 금액 4종 → summary.metrics (formatWonString, 소수 0 제거, 순저축만 accent)', () => {
  const { summary } = buildRecapStoriesData(modelOf());

  assert.deepEqual(summary.metrics, [
    { key: 'income', label: '수입', value: '1,250,000원' },
    { key: 'expense', label: '소비 지출', value: '700,000원' },
    { key: 'transfer', label: '자금이동', value: '50,000원' },
    { key: 'netSaving', label: '순저축', value: '550,000원', accent: true },
  ]);
  assert.equal(summary.eyebrow, '이달의 소비 요약');
});

test('매핑: 음수 순저축·소수 금액·-0도 문자열 그대로 정밀하게 표시', () => {
  const { summary } = buildRecapStoriesData(
    modelOf({
      total_income: '9007199254740993.0000',
      total_expense: '1234.5678',
      total_transfer: '-0.0000',
      net_saving: '-12000.5000',
    })
  );

  assert.deepEqual(
    summary.metrics.map(metric => metric.value),
    ['9,007,199,254,740,993원', '1,234.5678원', '0원', '-12,000.5원']
  );
});

test('매핑: categories[].code/label/share → key/label/percent (서버 순서 유지, 금액 재계산 없음)', () => {
  const { category } = buildRecapStoriesData(modelOf());

  assert.deepEqual(category.categories, [
    { key: 'FOOD', label: '식비', percent: 60 },
    { key: 'CAFE', label: '카페/디저트', percent: 40 },
  ]);
  assert.equal(category.categoryCardLabel, '카테고리 비중');
  for (const item of category.categories) assert.equal(Number.isInteger(item.percent), true);
});

test('매핑: coverage.is_reliable=false일 때만 summary.safeChipText = note 원문', () => {
  const unreliable = buildRecapStoriesData(
    modelOf({
      coverage: {
        total_tx: 3,
        classified_tx: 1,
        unclassified_share: '0.50',
        is_reliable: false,
        note: '분석에 필요한 데이터가 부족합니다.',
      },
    })
  );
  assert.equal(unreliable.summary.safeChipText, '분석에 필요한 데이터가 부족합니다.');

  const reliable = buildRecapStoriesData(modelOf());
  assert.equal('safeChipText' in reliable.summary, false);

  const blankNote = buildRecapStoriesData(
    modelOf({
      coverage: {
        total_tx: 3,
        classified_tx: 1,
        unclassified_share: '0.50',
        is_reliable: false,
        note: '  ',
      },
    })
  );
  assert.equal('safeChipText' in blankNote.summary, false);
});

test('매핑: insights 문자열 → {key, body}, 서버 문구 그대로 (title 없음)', () => {
  const { insights } = buildRecapStoriesData(modelOf());

  assert.deepEqual(insights.insights, [
    { key: 'insight-0', body: '수입의 44% 가 남았어요.' },
    { key: 'insight-1', body: '식비가 가장 큰 비중이에요.' },
  ]);
  for (const item of insights.insights) assert.equal('title' in item, false);
});

test('매핑: categories / insights가 빈 배열이면 해당 섹션 키를 만들지 않음 (스토리 3장: cover·summary·closing)', () => {
  const data = buildRecapStoriesData(
    modelOf({
      categories: [],
      top_category: null,
      insights: [],
      nickname: null,
      nickname_reason: null,
    })
  );

  assert.deepEqual(Object.keys(data), ['cover', 'summary']);
});

test('매핑: 입력 모델을 변경하지 않음 (deep freeze된 모델도 처리)', () => {
  const model = deepFreeze(modelOf());
  const snapshot = JSON.stringify(model);

  buildRecapStoriesData(model);

  assert.equal(JSON.stringify(model), snapshot);
});

test('매핑: 기존 buildMoneyRecapStories의 섹션 조건(경로)과 이 data의 경로가 일치', () => {
  const builder = readFileSync(
    new URL('../../src/features/moneyRecap/buildMoneyRecapStories.js', import.meta.url),
    'utf8'
  );
  // 빌더는 JSX 컴포넌트를 import하므로 실행하지 않고 조건 경로만 확인한다.
  for (const path of [
    'data.summary?.metrics',
    'data.category?.categories',
    'data.insights?.insights',
    'data.hourly?.hours',
    'data.comparison?.midterm',
  ]) {
    assert.ok(builder.includes(path), `${path} 조건 확인`);
  }

  const data = buildRecapStoriesData(modelOf());
  assert.ok(data.summary.metrics.length > 0);
  assert.ok(data.category.categories.length > 0);
  assert.ok(data.insights.insights.length > 0);
  assert.equal('hourly' in data, false);
  assert.equal('comparison' in data, false);
});

test('매핑: 서버 원본 snake_case 객체를 그대로 넘기면 throw (필드명 불일치가 undefined로 숨지 않음)', () => {
  expectInvalid(() => buildRecapStoriesData(serverBody()));
});

test('매핑: 필수 키·타입이 없는 모델은 throw (nicknameReason 누락 포함)', () => {
  const base = modelOf();
  const without = key => {
    const { [key]: _removed, ...rest } = base;
    return rest;
  };

  for (const key of [
    'yearMonth',
    'totalIncome',
    'totalExpense',
    'totalTransfer',
    'netSaving',
    'categories',
    'nickname',
    'nicknameReason',
    'coverage',
    'insights',
  ]) {
    expectInvalid(() => buildRecapStoriesData(without(key)));
  }
  expectInvalid(() => buildRecapStoriesData(null));
  expectInvalid(() => buildRecapStoriesData([]));
  expectInvalid(() => buildRecapStoriesData({ ...base, nicknameReason: undefined }));
  expectInvalid(() => buildRecapStoriesData({ ...base, nicknameReason: 1 }));
  expectInvalid(() => buildRecapStoriesData({ ...base, totalIncome: 100 }));
  expectInvalid(() => buildRecapStoriesData({ ...base, yearMonth: '2026-13' }));
  expectInvalid(() =>
    buildRecapStoriesData({ ...base, coverage: { ...base.coverage, isReliable: 'false' } })
  );
  expectInvalid(() =>
    buildRecapStoriesData({ ...base, coverage: { ...base.coverage, note: undefined } })
  );
  expectInvalid(() => buildRecapStoriesData({ ...base, insights: [1] }));
  expectInvalid(() =>
    buildRecapStoriesData({ ...base, categories: [{ ...base.categories[0], share: 'NaN' }] })
  );
});

test('buildRecapEntryViewModel: Entry가 읽는 필드를 모두 채움 (배열은 항상 배열)', () => {
  const vm = buildRecapEntryViewModel(YM);

  assert.equal(vm.periodLabel, '2026년 9월');
  for (const key of ['titleLines', 'headlineLines', 'subtitleLines']) {
    assert.ok(Array.isArray(vm[key]) && vm[key].length > 0);
    assert.ok(vm[key].every(line => typeof line === 'string'));
  }
  assert.equal(typeof vm.ctaLabel, 'string');
  assert.deepEqual(vm.headlineLines, ['2026년 9월 소비를', '돌아봐요']);

  const fallback = buildRecapEntryViewModel(null);
  assert.equal(fallback.periodLabel, '');
  assert.ok(Array.isArray(fallback.headlineLines));
});

// ── 로더 ─────────────────────────────────────────────────────

test('loadRecapMonths: 성공 시 months, fetcher에는 user_id 문자열만 전달', async () => {
  const calls = [];
  const result = await loadRecapMonths(UID, {
    fetcher: async userId => {
      calls.push(userId);
      return [YM, YM_PREV];
    },
  });

  assert.deepEqual(result, { ok: true, months: [YM, YM_PREV] });
  assert.deepEqual(calls, [UID]);
  assert.equal(typeof calls[0], 'string');
});

test('loadRecapMonths: months [] → 오류가 아닌 빈 상태(NO_MONTHS)', async () => {
  const result = await loadRecapMonths(UID, { fetcher: async () => [] });

  assert.deepEqual(result, { ok: false, empty: true, reason: RECAP_EMPTY_REASON.NO_MONTHS });
});

test('loadRecapMonths: 404는 빈 상태가 아니라 오류(NOT_FOUND)', async () => {
  const result = await loadRecapMonths(UID, {
    fetcher: async () => {
      throw http(404);
    },
  });

  assert.deepEqual(result, { ok: false, errorType: RECAP_ERROR_TYPE.NOT_FOUND });
});

test('loadRecapMonths: 배열이 아닌 결과는 INVALID_RESPONSE', async () => {
  const result = await loadRecapMonths(UID, { fetcher: async () => ({ months: [] }) });

  assert.deepEqual(result, { ok: false, errorType: RECAP_ERROR_TYPE.INVALID_RESPONSE });
});

test('loadRecap: 성공하면 모델과 storiesData, fetcher에는 user_id/월 문자열만 전달', async () => {
  const calls = [];
  const model = modelOf();
  const result = await loadRecap(UID, YM, {
    fetcher: async (userId, yearMonth) => {
      calls.push([userId, yearMonth]);
      return model;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.recap, model);
  assert.deepEqual(Object.keys(result.storiesData), ['cover', 'summary', 'category', 'insights']);
  assert.deepEqual(calls, [[UID, YM]]);
});

test('loadRecap: 404 → 빈 상태(NO_RECAP), 오류로 취급하지 않음', async () => {
  const result = await loadRecap(UID, YM, {
    fetcher: async () => {
      throw http(404);
    },
  });

  assert.deepEqual(result, { ok: false, empty: true, reason: RECAP_EMPTY_REASON.NO_RECAP });
});

test('loadRecap: 오류 종류별 errorType만 돌려주고 값을 만들지 않음', async () => {
  const cases = [
    [apiError(API_ERROR_KIND.NETWORK), RECAP_ERROR_TYPE.NETWORK],
    [apiError(API_ERROR_KIND.TIMEOUT), RECAP_ERROR_TYPE.TIMEOUT],
    [http(503), RECAP_ERROR_TYPE.SERVER],
    [http(500), RECAP_ERROR_TYPE.SERVER],
    [http(400), RECAP_ERROR_TYPE.BAD_REQUEST],
    [http(403), RECAP_ERROR_TYPE.FORBIDDEN],
    [http(422), RECAP_ERROR_TYPE.VALIDATION],
    [http(429), RECAP_ERROR_TYPE.CLIENT_ERROR],
    [apiError(API_ERROR_KIND.AUTH_REQUIRED, 401), RECAP_ERROR_TYPE.UNAUTHORIZED],
    [apiError(API_ERROR_KIND.SESSION_EXPIRED), RECAP_ERROR_TYPE.UNAUTHORIZED],
    [
      new OnboardingRequestError(ONBOARDING_REQUEST_ERROR.INVALID_USER_ID, 'x'),
      RECAP_ERROR_TYPE.INVALID_REQUEST,
    ],
    [Object.assign(new Error('x'), { invalidResponse: true }), RECAP_ERROR_TYPE.INVALID_RESPONSE],
  ];

  for (const [error, errorType] of cases) {
    const result = await loadRecap(UID, YM, {
      fetcher: async () => {
        throw error;
      },
    });
    assert.deepEqual(result, { ok: false, errorType });
  }
});

test('loadRecap: 모델→스토리 data 매핑이 실패하면 INVALID_RESPONSE', async () => {
  const result = await loadRecap(UID, YM, { fetcher: async () => serverBody() });

  assert.deepEqual(result, { ok: false, errorType: RECAP_ERROR_TYPE.INVALID_RESPONSE });
});

test('loadRecap / loadRecapMonths: 취소는 오류가 아닌 canceled로 구분', async () => {
  const fetcher = async () => {
    throw apiError(API_ERROR_KIND.CANCELED);
  };

  assert.deepEqual(await loadRecap(UID, YM, { fetcher }), { ok: false, canceled: true });
  assert.deepEqual(await loadRecapMonths(UID, { fetcher }), { ok: false, canceled: true });
});

// ── 오류 재시도·안내 정책 ────────────────────────────────────

const EXPECTED_RETRYABLE = {
  [RECAP_ERROR_TYPE.NETWORK]: true,
  [RECAP_ERROR_TYPE.TIMEOUT]: true,
  [RECAP_ERROR_TYPE.SERVER]: true,
  [RECAP_ERROR_TYPE.INVALID_RESPONSE]: true,
  [RECAP_ERROR_TYPE.UNKNOWN]: true,
  [RECAP_ERROR_TYPE.UNAUTHORIZED]: false,
  [RECAP_ERROR_TYPE.FORBIDDEN]: false,
  [RECAP_ERROR_TYPE.BAD_REQUEST]: false,
  [RECAP_ERROR_TYPE.VALIDATION]: false,
  [RECAP_ERROR_TYPE.CLIENT_ERROR]: false,
  [RECAP_ERROR_TYPE.NOT_FOUND]: false,
  [RECAP_ERROR_TYPE.INVALID_REQUEST]: false,
  [RECAP_ERROR_TYPE.CONFIG]: false,
};

for (const [errorType, retryable] of Object.entries(EXPECTED_RETRYABLE)) {
  test(`정책: ${errorType} → retryable ${retryable}, 비어 있지 않은 안내 문구`, () => {
    assert.equal(canRetryRecapError(errorType), retryable);
    const message = describeRecapError(errorType);
    assert.equal(typeof message, 'string');
    assert.notEqual(message.trim(), '');
    assert.equal(RECAP_ERROR_POLICY[errorType].message, message);
    // 식별 정보·서버 원문이 문구에 들어가지 않는다.
    for (const forbidden of [UID, YM, 'Bearer', 'token', 'detail']) {
      assert.equal(message.includes(forbidden), false);
    }
    // 재시도 불가 유형에는 '다시 시도' 문구를 붙이지 않는다.
    if (!retryable) assert.equal(message.includes('다시 시도'), false);
  });
}

test('정책: 표에 없는 유형(CANCELED·임의 문자열·프로토타입 키)은 재시도 불가 + 일반 문구', () => {
  for (const unknown of [
    RECAP_ERROR_TYPE.CANCELED,
    'WHATEVER',
    'toString',
    'constructor',
    null,
    undefined,
  ]) {
    assert.equal(canRetryRecapError(unknown), false);
    assert.equal(typeof describeRecapError(unknown), 'string');
    assert.notEqual(describeRecapError(unknown).trim(), '');
  }
});

test('정책: 401 안내는 다시 로그인, 403은 접근 불가 (재시도 버튼 근거 없음)', () => {
  assert.match(describeRecapError(RECAP_ERROR_TYPE.UNAUTHORIZED), /로그인/);
  assert.match(describeRecapError(RECAP_ERROR_TYPE.FORBIDDEN), /접근/);
  assert.equal(canRetryRecapError(RECAP_ERROR_TYPE.UNAUTHORIZED), false);
  assert.equal(canRetryRecapError(RECAP_ERROR_TYPE.FORBIDDEN), false);
});

test('describeRecapEmpty: 이유별 제목·안내, 알 수 없는 이유는 NO_RECAP 문구', () => {
  assert.equal(describeRecapEmpty(RECAP_EMPTY_REASON.NO_MONTHS).title, '아직 머니 리캡이 없어요');
  assert.equal(describeRecapEmpty(RECAP_EMPTY_REASON.NO_RECAP).title, '이 달의 리캡이 아직 없어요');
  assert.deepEqual(describeRecapEmpty('???'), describeRecapEmpty(RECAP_EMPTY_REASON.NO_RECAP));
});

// ── 세션 컨트롤러 ────────────────────────────────────────────

// fetcher 호출을 기록하는 세션. 월별 응답은 byMonth[ym]이 있으면 그것을, 없으면 즉시 성공 모델을 쓴다.
const makeSession = ({ months, byMonth = {} } = {}) => {
  const calls = { months: [], recap: [] };
  const session = createRecapSession({
    fetchMonths: userId => {
      calls.months.push(userId);
      return months ? months(userId) : Promise.resolve([YM, YM_PREV]);
    },
    fetchRecap: (userId, yearMonth) => {
      calls.recap.push([userId, yearMonth]);
      const handler = byMonth[yearMonth];
      if (handler) return typeof handler === 'function' ? handler(userId) : handler.promise;
      return Promise.resolve(modelOf({ year_month: yearMonth }));
    },
  });
  session.setUser(UID);
  return { session, calls };
};

const countNotifications = session => {
  const counter = { count: 0 };
  session.subscribe(() => {
    counter.count += 1;
  });
  return counter;
};

test('세션: 필수 fetcher가 없으면 TypeError', () => {
  assert.throws(() => createRecapSession(), TypeError);
  assert.throws(() => createRecapSession({ fetchMonths: () => {} }), TypeError);
});

test('세션: loadMonths 성공 시 최신 월(months[0])을 기본 선택, 서버 순서 유지', async () => {
  const { session, calls } = makeSession();

  await session.loadMonths();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.READY);
  assert.deepEqual([...snapshot.months], [YM, YM_PREV]);
  assert.equal(snapshot.selectedMonth, YM);
  assert.deepEqual(calls.months, [UID]);
  assert.equal(calls.recap.length, 0, 'months 로딩만으로 API-38을 호출하지 않음');
});

test('세션: loadMonths 중복 호출은 요청 1회(진행 중 promise 공유), ready 이후에는 no-op', async () => {
  const gate = deferred();
  const { session, calls } = makeSession({ months: () => gate.promise });

  const first = session.loadMonths();
  const second = session.loadMonths();
  assert.equal(first, second);
  assert.equal(session.getSnapshot().monthsStatus, RECAP_SESSION_STATUS.LOADING);
  gate.resolve([YM]);
  await first;
  await session.loadMonths();

  assert.equal(calls.months.length, 1);
});

test('세션: months [] → EMPTY(오류 아님), 재호출해도 요청 없음', async () => {
  const { session, calls } = makeSession({ months: async () => [] });

  await session.loadMonths();
  await session.loadMonths();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.EMPTY);
  assert.equal(snapshot.selectedMonth, null);
  assert.equal(snapshot.monthsErrorType, null);
  assert.equal(calls.months.length, 1);
});

test('세션: selectMonth는 선택만 바꾸고 fetcher를 호출하지 않음, 목록에 없는 월은 무시', async () => {
  const { session, calls } = makeSession();
  await session.loadMonths();

  assert.equal(session.selectMonth(YM_PREV), true);
  assert.equal(session.getSnapshot().selectedMonth, YM_PREV);
  assert.equal(session.selectMonth('2025-01'), false);
  assert.equal(session.selectMonth('bad'), false);
  assert.equal(session.getSnapshot().selectedMonth, YM_PREV);
  assert.equal(calls.recap.length, 0, '월 선택만으로 API-38을 호출하지 않음');
});

test('세션: selectMonth 직후에도 recap은 idle (표시는 시작 시점에 결정)', async () => {
  const { session } = makeSession();
  await session.loadMonths();
  await session.openRecap();
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);

  session.selectMonth(YM_PREV);

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.IDLE);
  assert.equal(snapshot.storiesData, null);
});

test('세션: openRecap 성공 → READY + storiesData, 캐시 히트 시 재요청 0회', async () => {
  const { session, calls } = makeSession();
  await session.loadMonths();

  await session.openRecap();
  const first = session.getSnapshot();
  assert.equal(first.recapStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(first.recapMonth, YM);
  assert.deepEqual(Object.keys(first.storiesData), ['cover', 'summary', 'category', 'insights']);

  session.closeRecap();
  await session.openRecap();

  assert.equal(calls.recap.length, 1, '같은 사용자·월은 캐시 사용');
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(session.getSnapshot().storiesData, first.storiesData);
});

test('세션: 같은 월 연타(진행 중 중복 openRecap)는 요청 1회', async () => {
  const gate = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();

  const first = session.openRecap();
  const second = session.openRecap();
  const third = session.openRecap(YM);
  assert.equal(first, second);
  assert.equal(first, third);
  gate.resolve(modelOf());
  await first;

  assert.equal(calls.recap.length, 1);
});

test('세션: 사용자별·월별 캐시 키 분리', async () => {
  const { session, calls } = makeSession();
  await session.loadMonths();

  await session.openRecap(YM);
  await session.openRecap(YM_PREV);
  assert.equal(calls.recap.length, 2, '월이 다르면 별도 요청');

  session.setUser(OTHER_UID);
  await session.loadMonths();
  await session.openRecap(YM);
  assert.equal(calls.recap.length, 3, '사용자가 다르면 같은 월도 별도 요청');
  assert.deepEqual(calls.recap[2], [OTHER_UID, YM]);
});

test('세션: 실패·404·INVALID_RESPONSE는 캐시하지 않음 (재열람 시 재요청)', async () => {
  const outcomes = [
    () => Promise.reject(apiError(API_ERROR_KIND.NETWORK)),
    () => Promise.reject(http(404)),
    () => Promise.resolve({ not: 'a model' }),
    () => Promise.reject(http(503)),
  ];
  let attempt = 0;
  const { session, calls } = makeSession({ byMonth: { [YM]: () => outcomes[attempt++]() } });
  await session.loadMonths();

  for (let index = 0; index < outcomes.length; index += 1) {
    await session.openRecap();
    assert.equal(calls.recap.length, index + 1, `${index + 1}번째 재열람도 요청`);
    assert.notEqual(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
    session.closeRecap();
  }
});

test('세션: 404 → EMPTY(NO_RECAP) 상태, 오류 필드 없음', async () => {
  const { session } = makeSession({ byMonth: { [YM]: () => Promise.reject(http(404)) } });
  await session.loadMonths();

  await session.openRecap();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.EMPTY);
  assert.equal(snapshot.recapEmptyReason, RECAP_EMPTY_REASON.NO_RECAP);
  assert.equal(snapshot.recapErrorType, null);
  assert.equal(snapshot.storiesData, null);
  assert.equal(snapshot.recapRetryable, false);
});

test('세션: 월 A 진행 중 openRecap(B) → A의 늦은 응답은 폐기, B만 반영, A는 캐시되지 않음', async () => {
  const gateA = deferred();
  const gateB = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gateA, [YM_PREV]: gateB } });
  await session.loadMonths();

  const pendingA = session.openRecap(YM);
  const pendingB = session.openRecap(YM_PREV);
  gateB.resolve(modelOf({ year_month: YM_PREV }));
  await pendingB;
  const afterB = session.getSnapshot();
  gateA.resolve(modelOf({ year_month: YM }));
  await pendingA;

  assert.equal(session.getSnapshot(), afterB, '늦은 A 응답이 상태를 덮어쓰지 않음');
  assert.equal(afterB.recapMonth, YM_PREV);
  assert.equal(afterB.recapStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(afterB.storiesData.cover.period, '2026년 8월');
  await session.openRecap(YM);
  assert.equal(calls.recap.length, 3, 'A는 캐시되지 않았으므로 다시 요청');
});

test('세션: 사용자 변경 뒤 이전 사용자의 늦은 응답은 폐기 (상태·캐시 미혼입)', async () => {
  const gate = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();
  const pending = session.openRecap();

  session.setUser(OTHER_UID);
  const afterSwitch = session.getSnapshot();
  const notifications = countNotifications(session);
  gate.resolve(modelOf());
  await pending;

  assert.equal(session.getSnapshot(), afterSwitch);
  assert.equal(notifications.count, 0);
  assert.equal(afterSwitch.userId, OTHER_UID);
  assert.equal(afterSwitch.recapStatus, RECAP_SESSION_STATUS.IDLE);
  assert.equal(afterSwitch.monthsStatus, RECAP_SESSION_STATUS.IDLE);
  // 새 사용자로 같은 월을 열면 캐시에 이전 응답이 없으므로 요청한다.
  await session.loadMonths();
  await session.openRecap(YM);
  assert.deepEqual(calls.recap.at(-1), [OTHER_UID, YM]);
});

test('세션: 사용자 변경 시 캐시 전체 폐기 (원래 사용자로 돌아와도 재요청)', async () => {
  const { session, calls } = makeSession();
  await session.loadMonths();
  await session.openRecap();
  assert.equal(calls.recap.length, 1);

  session.setUser(OTHER_UID);
  session.setUser(UID);
  await session.loadMonths();
  await session.openRecap();

  assert.equal(calls.recap.length, 2);
});

test('세션: 같은 사용자 setUser는 상태·리스너에 영향 없음', async () => {
  const { session } = makeSession();
  await session.loadMonths();
  const before = session.getSnapshot();
  const notifications = countNotifications(session);

  session.setUser(UID);

  assert.equal(session.getSnapshot(), before);
  assert.equal(notifications.count, 0);
});

test('세션: months 로딩 중 사용자 변경 → 이전 사용자의 늦은 months 응답 폐기', async () => {
  const gate = deferred();
  const { session } = makeSession({ months: () => gate.promise });
  const pending = session.loadMonths();

  session.setUser(OTHER_UID);
  gate.resolve([YM]);
  await pending;

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.userId, OTHER_UID);
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.IDLE);
  assert.deepEqual([...snapshot.months], []);
});

test('세션: dispose 뒤 늦은 응답은 폐기, 캐시·리스너 비움, 이후 재사용 가능', async () => {
  const gate = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();
  const notifications = countNotifications(session);
  const pending = session.openRecap();
  assert.equal(notifications.count, 1);

  session.dispose();
  gate.resolve(modelOf());
  await pending;

  assert.equal(notifications.count, 1, 'dispose 뒤에는 리스너가 호출되지 않음');
  assert.equal(session.getSnapshot().userId, null);
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.IDLE);

  session.setUser(UID);
  await session.loadMonths();
  await session.openRecap();
  assert.equal(calls.recap.length, 2, '캐시가 비워졌으므로 다시 요청');
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
});

test('세션: 스냅샷은 불변이고 변경이 있을 때만 새 객체·리스너 호출', async () => {
  const { session } = makeSession();
  const notifications = countNotifications(session);
  const initial = session.getSnapshot();
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(session.getSnapshot(), initial, '변경 없으면 같은 참조');

  await session.loadMonths(); // loading, ready → 2회
  assert.equal(notifications.count, 2);
  const ready = session.getSnapshot();
  assert.notEqual(ready, initial);
  assert.equal(Object.isFrozen(ready.months), true);

  session.selectMonth(YM); // 이미 선택된 월 → 변경 없음
  session.closeRecap(); // idle에서 호출 → 변경 없음
  await session.loadMonths(); // ready에서 no-op
  assert.equal(notifications.count, 2);
  assert.equal(session.getSnapshot(), ready);
});

test('세션: 유효하지 않은 월로 openRecap하면 요청 없이 INVALID_REQUEST 오류 상태', async () => {
  const { session, calls } = makeSession({ months: async () => [] });
  await session.loadMonths();

  await session.openRecap(); // 선택된 월 없음(null)
  await session.openRecap('2026-13');

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.ERROR);
  assert.equal(snapshot.recapErrorType, RECAP_ERROR_TYPE.INVALID_REQUEST);
  assert.equal(snapshot.recapRetryable, false);
  assert.equal(calls.recap.length, 0);
});

// ── 세션: 재시도 정책 ────────────────────────────────────────

test('재시도: 재시도 가능 오류(NETWORK) 뒤 openRecap이 재요청하고 성공 시 READY·캐시 저장', async () => {
  let attempt = 0;
  const { session, calls } = makeSession({
    byMonth: {
      [YM]: () =>
        attempt++ === 0
          ? Promise.reject(apiError(API_ERROR_KIND.NETWORK))
          : Promise.resolve(modelOf()),
    },
  });
  await session.loadMonths();

  await session.openRecap();
  let snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.ERROR);
  assert.equal(snapshot.recapErrorType, RECAP_ERROR_TYPE.NETWORK);
  assert.equal(snapshot.recapRetryable, true);

  await session.openRecap();
  snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(snapshot.recapRetryable, false);
  assert.equal(snapshot.recapErrorType, null);
  assert.equal(calls.recap.length, 2);

  session.closeRecap();
  await session.openRecap();
  assert.equal(calls.recap.length, 2, '성공 후에는 캐시');
});

for (const [name, error, type] of [
  ['TIMEOUT', apiError(API_ERROR_KIND.TIMEOUT), RECAP_ERROR_TYPE.TIMEOUT],
  ['SERVER(503)', http(503), RECAP_ERROR_TYPE.SERVER],
  [
    'INVALID_RESPONSE',
    Object.assign(new Error('x'), { invalidResponse: true }),
    RECAP_ERROR_TYPE.INVALID_RESPONSE,
  ],
]) {
  test(`재시도: ${name}도 수동 재시도 가능 (recapRetryable true, 같은 월 재요청)`, async () => {
    const { session, calls } = makeSession({ byMonth: { [YM]: () => Promise.reject(error) } });
    await session.loadMonths();

    await session.openRecap();
    assert.equal(session.getSnapshot().recapErrorType, type);
    assert.equal(session.getSnapshot().recapRetryable, true);
    await session.openRecap();

    assert.equal(calls.recap.length, 2);
  });
}

for (const [name, error, type] of [
  ['401 AUTH_REQUIRED', apiError(API_ERROR_KIND.AUTH_REQUIRED, 401), RECAP_ERROR_TYPE.UNAUTHORIZED],
  ['403', http(403), RECAP_ERROR_TYPE.FORBIDDEN],
  ['400', http(400), RECAP_ERROR_TYPE.BAD_REQUEST],
  ['422', http(422), RECAP_ERROR_TYPE.VALIDATION],
]) {
  test(`재시도: ${name} → 재시도 불가, 같은 월 재호출은 fetcher를 호출하지 않고 상태 유지`, async () => {
    const { session, calls } = makeSession({ byMonth: { [YM]: () => Promise.reject(error) } });
    await session.loadMonths();

    await session.openRecap();
    const failed = session.getSnapshot();
    assert.equal(failed.recapStatus, RECAP_SESSION_STATUS.ERROR);
    assert.equal(failed.recapErrorType, type);
    assert.equal(failed.recapRetryable, false);
    await session.openRecap();

    assert.equal(calls.recap.length, 1);
    assert.equal(session.getSnapshot(), failed);
  });
}

test('재시도: 재시도 불가 오류 뒤에도 다른 월은 요청 가능', async () => {
  const { session, calls } = makeSession({
    byMonth: { [YM]: () => Promise.reject(http(403)) },
  });
  await session.loadMonths();
  await session.openRecap(YM);

  await session.openRecap(YM_PREV);

  assert.equal(calls.recap.length, 2);
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
});

test('재시도: months 오류 — NETWORK는 loadMonths 재시도 가능, 403은 요청 없이 상태 유지', async () => {
  let attempt = 0;
  const retryable = makeSession({
    months: () =>
      attempt++ === 0 ? Promise.reject(apiError(API_ERROR_KIND.NETWORK)) : Promise.resolve([YM]),
  });
  await retryable.session.loadMonths();
  assert.equal(retryable.session.getSnapshot().monthsStatus, RECAP_SESSION_STATUS.ERROR);
  assert.equal(retryable.session.getSnapshot().monthsRetryable, true);
  await retryable.session.loadMonths();
  assert.equal(retryable.session.getSnapshot().monthsStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(retryable.session.getSnapshot().monthsRetryable, false);
  assert.equal(retryable.calls.months.length, 2);

  const blocked = makeSession({ months: () => Promise.reject(http(403)) });
  await blocked.session.loadMonths();
  const failed = blocked.session.getSnapshot();
  assert.equal(failed.monthsErrorType, RECAP_ERROR_TYPE.FORBIDDEN);
  assert.equal(failed.monthsRetryable, false);
  await blocked.session.loadMonths();
  assert.equal(blocked.calls.months.length, 1);
  assert.equal(blocked.session.getSnapshot(), failed);
});

test('재시도: months canceled는 오류가 아닌 idle', async () => {
  const { session } = makeSession({
    months: () => Promise.reject(apiError(API_ERROR_KIND.CANCELED)),
  });

  await session.loadMonths();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.monthsStatus, RECAP_SESSION_STATUS.IDLE);
  assert.equal(snapshot.monthsErrorType, null);
});

// ── 세션: closeRecap (진행 중 요청 취소) ─────────────────────

test('closeRecap (1) 로딩 중 닫기 → 즉시 idle, 리스너 알림 1회', async () => {
  const gate = deferred();
  const { session } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();
  const pending = session.openRecap();
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.LOADING);
  const notifications = countNotifications(session);

  session.closeRecap();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.recapStatus, RECAP_SESSION_STATUS.IDLE);
  assert.equal(snapshot.recapMonth, null);
  assert.equal(snapshot.storiesData, null);
  assert.equal(notifications.count, 1);
  gate.resolve(modelOf());
  await pending;
});

test('closeRecap (2) 닫은 뒤 도착한 성공 응답은 상태·리스너·캐시를 바꾸지 않음', async () => {
  const gate = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();
  const pending = session.openRecap();
  session.closeRecap();
  const afterClose = session.getSnapshot();
  const notifications = countNotifications(session);

  gate.resolve(modelOf());
  await pending;

  assert.equal(session.getSnapshot(), afterClose, '스냅샷 동일 참조');
  assert.equal(notifications.count, 0);
  await session.openRecap();
  assert.equal(calls.recap.length, 2, '취소된 요청 결과는 캐시되지 않아 다시 요청');
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
});

test('closeRecap (3) 닫은 뒤 도착한 실패·404·INVALID_RESPONSE는 상태·오류·empty를 바꾸지 않음', async () => {
  for (const settle of [
    gate => gate.reject(apiError(API_ERROR_KIND.NETWORK)),
    gate => gate.reject(http(500)),
    gate => gate.reject(http(404)),
    gate => gate.reject(http(403)),
    gate => gate.resolve({ broken: true }),
  ]) {
    const gate = deferred();
    const { session, calls } = makeSession({ byMonth: { [YM]: gate } });
    await session.loadMonths();
    const pending = session.openRecap();
    session.closeRecap();
    const afterClose = session.getSnapshot();
    const notifications = countNotifications(session);

    settle(gate);
    await pending;

    assert.equal(session.getSnapshot(), afterClose);
    assert.equal(notifications.count, 0);
    assert.equal(afterClose.recapErrorType, null);
    assert.equal(afterClose.recapEmptyReason, null);
    // 늦은 오류가 '마지막 오류 기록'을 남기지 않았으므로(403 포함) 같은 월은 다시 요청된다.
    await session.openRecap();
    assert.equal(calls.recap.length, 2);
  }
});

test('closeRecap (4) 기존 성공 캐시(X)는 유지, 닫힌 Y의 늦은 응답은 캐시되지 않음', async () => {
  const gateY = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM_PREV]: gateY } });
  await session.loadMonths();
  await session.openRecap(YM); // X = YM → 캐시됨
  assert.equal(calls.recap.length, 1);

  const pendingY = session.openRecap(YM_PREV);
  session.closeRecap();
  gateY.resolve(modelOf({ year_month: YM_PREV }));
  await pendingY;

  await session.openRecap(YM);
  assert.equal(calls.recap.length, 2, 'X는 캐시 히트(추가 요청 없음)');
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(session.getSnapshot().recapMonth, YM);

  session.closeRecap();
  await session.openRecap(YM_PREV);
  assert.equal(calls.recap.length, 3, 'Y는 캐시되지 않았으므로 새 요청');
});

test('closeRecap (5) 닫은 뒤 다른 월을 열어 완료한 뒤 이전 요청 응답이 늦게 와도 덮어쓰지 않음', async () => {
  const gateA = deferred();
  const { session, calls } = makeSession({ byMonth: { [YM]: gateA } });
  await session.loadMonths();
  const pendingA = session.openRecap(YM);
  session.closeRecap();

  await session.openRecap(YM_PREV);
  const afterB = session.getSnapshot();
  const notifications = countNotifications(session);
  gateA.resolve(modelOf({ year_month: YM }));
  await pendingA;

  assert.equal(session.getSnapshot(), afterB);
  assert.equal(notifications.count, 0);
  assert.equal(afterB.recapMonth, YM_PREV);
  await session.openRecap(YM);
  assert.equal(calls.recap.length, 3, 'A는 캐시되지 않음');
});

test('closeRecap (6) idle/ready/error 상태에서의 호출은 부작용 없이 성공 캐시를 유지', async () => {
  let failNext = false;
  const { session, calls } = makeSession({
    byMonth: {
      [YM_PREV]: () =>
        failNext
          ? Promise.reject(apiError(API_ERROR_KIND.NETWORK))
          : Promise.resolve(modelOf({ year_month: YM_PREV })),
    },
  });
  await session.loadMonths();

  const idle = session.getSnapshot();
  const notifications = countNotifications(session);
  session.closeRecap();
  assert.equal(session.getSnapshot(), idle, 'idle에서 닫기는 변경 없음');
  assert.equal(notifications.count, 0);

  await session.openRecap(YM); // ready + 캐시
  session.closeRecap();
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.IDLE);
  await session.openRecap(YM);
  assert.equal(calls.recap.length, 1, 'ready에서 닫고 다시 열어도 캐시 히트');

  failNext = true;
  await session.openRecap(YM_PREV); // error
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.ERROR);
  session.closeRecap();
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.IDLE);
  await session.openRecap(YM);
  assert.equal(calls.recap.length, 2, 'error에서 닫아도 기존 성공 캐시 유지');
});

test('closeRecap (7) 닫은 뒤 같은 월 재열람은 이전 in-flight promise를 재사용하지 않고 새 요청', async () => {
  const gate = deferred();
  const second = deferred();
  let call = 0;
  const { session, calls } = makeSession({
    byMonth: { [YM]: () => (call++ === 0 ? gate.promise : second.promise) },
  });
  await session.loadMonths();

  const first = session.openRecap();
  session.closeRecap();
  const reopened = session.openRecap();

  assert.notEqual(first, reopened);
  assert.equal(calls.recap.length, 2);
  second.resolve(modelOf());
  await reopened;
  assert.equal(session.getSnapshot().recapStatus, RECAP_SESSION_STATUS.READY);
  gate.resolve(modelOf());
  await first;
  assert.equal(
    session.getSnapshot().recapStatus,
    RECAP_SESSION_STATUS.READY,
    '첫 요청은 영향 없음'
  );
});

test('closeRecap (8) months 로딩 중 closeRecap은 months 상태에 영향 없음', async () => {
  const gate = deferred();
  const { session } = makeSession({ months: () => gate.promise });
  const pending = session.loadMonths();

  session.closeRecap();
  assert.equal(session.getSnapshot().monthsStatus, RECAP_SESSION_STATUS.LOADING);
  gate.resolve([YM]);
  await pending;

  assert.equal(session.getSnapshot().monthsStatus, RECAP_SESSION_STATUS.READY);
  assert.equal(session.getSnapshot().selectedMonth, YM);
});

test('selectMonth: recap 로딩 중에는 무시 (월 변경으로 진행 중 요청과 어긋나지 않음)', async () => {
  const gate = deferred();
  const { session } = makeSession({ byMonth: { [YM]: gate } });
  await session.loadMonths();
  const pending = session.openRecap();

  assert.equal(session.selectMonth(YM_PREV), false);
  assert.equal(session.getSnapshot().selectedMonth, YM);
  gate.resolve(modelOf());
  await pending;
});

// ── 정적 검사 ────────────────────────────────────────────────

test('정적: React·RN·Redux·AsyncStorage·apiClient를 import하지 않고 허용 import만 사용', () => {
  const source = readFileSync(
    new URL('../../src/features/moneyRecap/recapScreenLogic.js', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(imports.sort(), ['../onboarding/workOnboardingScreenLogic', './recapApi']);

  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(
    /AsyncStorage|useSelector|dispatch|react-native|from 'react'|apiClient/.test(code),
    false
  );
  // 금액·비율은 숫자로 변환하지 않는다(share 반올림도 문자열 기반).
  assert.equal(/Number\(|parseFloat|toLocaleString|BigInt/.test(code), false);
});

test('정적: 모델은 camelCase(nicknameReason)로만 읽고 snake_case 서버 키를 읽지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/moneyRecap/recapScreenLogic.js', import.meta.url),
    'utf8'
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert.ok(code.includes("'nicknameReason'"));
  for (const snake of [
    'nickname_reason',
    'total_income',
    'net_saving',
    'is_reliable',
    'year_month',
  ]) {
    assert.equal(code.includes(snake), false, `${snake} 미사용`);
  }
});

test('정적: 서버에 없는 스토리 key(hourly/comparison/closing)와 등급·점수 필드를 만들지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/moneyRecap/recapScreenLogic.js', import.meta.url),
    'utf8'
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const forbidden of [
    'hourly',
    'comparison',
    'closing',
    'gradeLabel',
    'scorePercent',
    'days:',
  ]) {
    assert.equal(code.includes(forbidden), false, `${forbidden} 미생성`);
  }
});
