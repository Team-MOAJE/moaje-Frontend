// Cashflow(API-15~17) thunk + 슬라이스 통합 테스트 — 모의 Gateway만 사용(실서버·Android 호출 없음).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/cashflowFlow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import { everRequested, gateway, jsonRoute, rawJsonRoute } from './assetTestEnv.mjs';

const { default: assetReducer, setCashflowYearMonth } =
  await import('../../src/features/asset/assetSlice.js');
const { submitDailyLimit, loadMonthlyCashflow, loadCategoryCashflow } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { loginUser, logoutUser } = await import('../../src/features/auth/authApi.js');

const DAILY_PATH = '/api/v1/assets/cashflow/daily-limit';
const MONTHLY_PATH = '/api/v1/assets/cashflow/monthly';
const CATEGORY_PATH = '/api/v1/assets/cashflow/category';
const LATE = 120;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const dailyBody = (overrides = {}) => ({
  userId: '101',
  currentBalance: 500000.0,
  expectedIncome: 100000,
  fixedExpenses: 50000,
  eventBuffer: 0,
  daysUntilNextPayday: 10,
  dailyLimit: 55000,
  snapshotDate: '2026-10-13',
  ...overrides,
});
const monthlyBody = (yearMonth = '2026-09', overrides = {}) => ({
  userId: '101',
  yearMonth,
  incomeAmount: 1000000,
  expenseAmount: 350000.5,
  transferAmount: 200000,
  revision: 2,
  calculatedAt: '2026-10-01T00:10:00',
  ...overrides,
});
const categoryBody = (yearMonth = '2026-09', overrides = {}) => ({
  userId: '101',
  yearMonth,
  revision: 2,
  categories: [
    { category: 'INCOME', amount: 1000000 },
    { category: 'FOOD', amount: 120000 },
    { category: 'UNCATEGORIZED', amount: 0 },
  ],
  calculatedAt: '2026-10-01T00:10:00',
  ...overrides,
});
const queryOf = request => new URLSearchParams(request.query).get('yearMonth');

// ── API-15 ────────────────────────────────────────────────────

test('API-15: POST 본문에는 입력한 값만 들어가고 생략한 선택 값·userId·null은 보내지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody()));
  const result = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10 }));

  assert.equal(submitDailyLimit.fulfilled.match(result), true);
  const [request] = gateway.requestsTo(DAILY_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.deepEqual(request.body, { daysUntilNextPayday: 10 });
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.equal(request.rawBody.includes('null'), false);
  assert.equal(asset(store).cashflowDaily.result.dailyLimit, 55000);
  assert.deepEqual(asset(store).cashflowDaily.input, { daysUntilNextPayday: 10 });
});

test('API-15: 모든 입력과 소수 4자리 dailyLimit·음수 값을 서버 응답 그대로 보관한다', async () => {
  const store = makeStore();
  gateway.route(
    'POST',
    DAILY_PATH,
    rawJsonRoute(
      '{"userId":"101","currentBalance":1000.5000,"expectedIncome":0,"fixedExpenses":50000,"eventBuffer":0,"daysUntilNextPayday":3,"dailyLimit":-16333.1667,"snapshotDate":"2026-10-13"}'
    )
  );
  await store.dispatch(
    submitDailyLimit({
      daysUntilNextPayday: 3,
      expectedIncome: 0,
      fixedExpenses: 50000,
      eventBuffer: 0,
    })
  );
  const [request] = gateway.requestsTo(DAILY_PATH);
  assert.deepEqual(request.body, {
    expectedIncome: 0,
    fixedExpenses: 50000,
    eventBuffer: 0,
    daysUntilNextPayday: 3,
  });
  assert.equal(
    asset(store).cashflowDaily.result.dailyLimit,
    -16333.1667,
    '서버 값을 보정하지 않는다'
  );
  assert.equal(asset(store).cashflowDaily.result.expectedIncome, 0, '실제 0과 null을 구분한다');
});

test('API-15: 잘못된 입력은 요청을 보내지 않는다(일수<1, 음수·소수 금액, 문자열)', async () => {
  const store = makeStore();
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody()));
  for (const bad of [
    undefined,
    {},
    { daysUntilNextPayday: 0 },
    { daysUntilNextPayday: -1 },
    { daysUntilNextPayday: 1.5 },
    { daysUntilNextPayday: '10' },
    { daysUntilNextPayday: 10, expectedIncome: -1 },
    { daysUntilNextPayday: 10, fixedExpenses: 1.5 },
    { daysUntilNextPayday: 10, eventBuffer: '5000' },
    { daysUntilNextPayday: 10, eventBuffer: null },
  ]) {
    const result = await store.dispatch(submitDailyLimit(bad));
    assert.equal(submitDailyLimit.rejected.match(result), true, JSON.stringify(bad));
  }
  assert.equal(gateway.requestsTo(DAILY_PATH).length, 0);
  assert.equal(asset(store).cashflowDaily.result, null);
  assert.equal(asset(store).cashflowDaily.loading, false);
});

test('API-15: 409(계좌 없음/활성 계좌 없음)·400·401·500은 오류로 남고 가짜 결과를 만들지 않는다', async () => {
  const problem = {
    type: 'about:blank',
    title: 'AccountError',
    status: 409,
    detail: '계좌가 존재하지 않습니다.',
    instance: DAILY_PATH,
    exception: 'AccountNotLinkedException',
  };
  const cases = [
    [409, jsonRoute(problem, { status: 409 })],
    [400, jsonRoute({ status: 400, error: 'Bad Request' }, { status: 400 })],
    [500, jsonRoute({ status: 500 }, { status: 500 })],
  ];
  for (const [status, route] of cases) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', DAILY_PATH, route);
    const result = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 5 }));
    assert.equal(submitDailyLimit.rejected.match(result), true, String(status));
    assert.equal(asset(store).cashflowDaily.errorStatus, status);
    assert.equal(typeof asset(store).cashflowDaily.error, 'string');
    assert.equal(asset(store).cashflowDaily.result, null);
    assert.equal(gateway.requestsTo(DAILY_PATH).length, 1, '자동 재시도 없음');
  }

  const store = makeStore();
  gateway.reset();
  gateway.rejectAllTokens = true;
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody()));
  const unauthorized = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 5 }));
  assert.equal(submitDailyLimit.rejected.match(unauthorized), true);
  assert.equal(asset(store).cashflowDaily.result, null);
});

test('API-15: 응답 형식 위반·소수 daysUntilNextPayday·큰 정수 금액 문자열은 정상 결과로 쓰지 않는다', async () => {
  for (const body of [
    dailyBody({ dailyLimit: '55000' }),
    dailyBody({ dailyLimit: null }),
    dailyBody({ daysUntilNextPayday: 0 }),
    dailyBody({ snapshotDate: '2026/10/13' }),
    { userId: '101' },
  ]) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', DAILY_PATH, jsonRoute(body));
    const result = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10 }));
    assert.equal(submitDailyLimit.rejected.match(result), true, JSON.stringify(body));
    assert.equal(asset(store).cashflowDaily.result, null);
  }
  // 16자리 이상 정수는 lossless 파싱으로 문자열이 되어 금액 검증을 통과하지 못한다(정밀도 손실 값을 쓰지 않음).
  const store = makeStore();
  gateway.reset();
  gateway.validTokens.add('valid');
  gateway.route(
    'POST',
    DAILY_PATH,
    rawJsonRoute(
      '{"userId":"101","currentBalance":12345678901234567,"expectedIncome":0,"fixedExpenses":0,"eventBuffer":0,"daysUntilNextPayday":1,"dailyLimit":1,"snapshotDate":"2026-10-13"}'
    )
  );
  const result = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 1 }));
  assert.equal(submitDailyLimit.rejected.match(result), true);
});

test('API-15: 진행 중 중복 계산 요청은 보내지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody(), { delay: 100 }));
  const first = store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10 }));
  assert.equal(asset(store).cashflowDaily.loading, true);
  const second = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 11 }));
  assert.equal(second.meta.condition, true);
  await first;
  assert.equal(gateway.requestsTo(DAILY_PATH).length, 1);
  assert.equal(asset(store).cashflowDaily.loading, false);
});

// ── API-16 / API-17 ───────────────────────────────────────────

const selectMonth = (store, yearMonth) => store.dispatch(setCashflowYearMonth(yearMonth));

test('API-16/17: 같은 조회 월로 요청하고 응답을 보관한다(쿼리 yearMonth=YYYY-MM)', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09')));
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09')));
  selectMonth(store, '2026-09');
  await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ]);

  assert.equal(queryOf(gateway.requestsTo(MONTHLY_PATH)[0]), '2026-09');
  assert.equal(queryOf(gateway.requestsTo(CATEGORY_PATH)[0]), '2026-09');
  assert.equal(gateway.requestsTo(MONTHLY_PATH)[0].headers.authorization, 'Bearer valid');
  assert.equal(asset(store).cashflowYearMonth, '2026-09');
  assert.equal(asset(store).cashflowMonthly.data.incomeAmount, 1000000);
  assert.equal(
    asset(store).cashflowMonthly.data.expenseAmount,
    350000.5,
    '서버 값 그대로(반올림 없음)'
  );
  assert.equal(asset(store).cashflowMonthly.data.transferAmount, 200000);
  assert.equal(asset(store).cashflowCategory.data.categories.length, 3);
  assert.equal(
    asset(store).cashflowMonthly.data.yearMonth,
    asset(store).cashflowCategory.data.yearMonth
  );
});

test('API-16/17: 조회 월이 아닌 월·형식이 잘못된 월은 요청하지 않는다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09')));
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09')));
  // 월 미지정
  assert.equal((await store.dispatch(loadMonthlyCashflow('2026-09'))).meta.condition, true);
  selectMonth(store, '2026-09');
  // 다른 월
  assert.equal((await store.dispatch(loadMonthlyCashflow('2026-08'))).meta.condition, true);
  assert.equal((await store.dispatch(loadCategoryCashflow('2026-08'))).meta.condition, true);
  // 형식 오류는 setCashflowYearMonth가 무시한다
  selectMonth(store, '2026-13');
  selectMonth(store, '202609');
  selectMonth(store, null);
  assert.equal(asset(store).cashflowYearMonth, '2026-09');
  assert.equal(gateway.requestsTo(MONTHLY_PATH).length, 0);
  assert.equal(gateway.requestsTo(CATEGORY_PATH).length, 0);
});

test('API-16/17: 월을 바꾸면 이전 월 데이터가 즉시 비워지고, 이전 월의 늦은 응답은 반영되지 않는다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, ({ record }) => {
    const ym = queryOf(record);
    return {
      body: monthlyBody(ym, { incomeAmount: ym === '2026-09' ? 111 : 222 }),
      delay: ym === '2026-09' ? 150 : 0,
    };
  });
  gateway.route('GET', CATEGORY_PATH, ({ record }) => {
    const ym = queryOf(record);
    return {
      body: categoryBody(ym, {
        categories: [{ category: 'FOOD', amount: ym === '2026-09' ? 1 : 2 }],
      }),
      delay: ym === '2026-09' ? 150 : 0,
    };
  });

  selectMonth(store, '2026-09');
  const lateMonthly = store.dispatch(loadMonthlyCashflow('2026-09'));
  const lateCategory = store.dispatch(loadCategoryCashflow('2026-09'));
  assert.equal(asset(store).cashflowMonthly.loading, true);

  // 사용자가 곧바로 다음 달로 이동
  selectMonth(store, '2026-10');
  assert.equal(asset(store).cashflowMonthly.data, null);
  assert.equal(
    asset(store).cashflowMonthly.loading,
    false,
    '이전 월 요청은 무효화되어 새 요청이 막히지 않는다'
  );
  await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-10')),
    store.dispatch(loadCategoryCashflow('2026-10')),
  ]);
  await Promise.all([lateMonthly, lateCategory]);
  await sleep(LATE);

  assert.equal(asset(store).cashflowYearMonth, '2026-10');
  assert.equal(asset(store).cashflowMonthly.data.yearMonth, '2026-10');
  assert.equal(
    asset(store).cashflowMonthly.data.incomeAmount,
    222,
    '이전 월(111) 응답이 덮어쓰지 않는다'
  );
  assert.equal(asset(store).cashflowCategory.data.yearMonth, '2026-10');
  assert.equal(asset(store).cashflowCategory.data.categories[0].amount, 2);
  assert.equal(asset(store).cashflowMonthly.loading, false);
  assert.equal(asset(store).cashflowCategory.loading, false);
});

test('API-16/17: 응답의 yearMonth가 요청한 월과 다르면 오류로 처리하고 데이터를 반영하지 않는다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-08')));
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-08')));
  selectMonth(store, '2026-09');
  const [monthlyResult, categoryResult] = await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ]);
  assert.equal(loadMonthlyCashflow.rejected.match(monthlyResult), true);
  assert.equal(loadCategoryCashflow.rejected.match(categoryResult), true);
  assert.equal(asset(store).cashflowMonthly.data, null);
  assert.equal(asset(store).cashflowCategory.data, null);
  assert.equal(typeof asset(store).cashflowMonthly.error, 'string');
});

test('API-16/17: 거래가 없는 월은 오류가 아니라 0원 데이터이며 null과 구분된다', async () => {
  const store = makeStore();
  gateway.route(
    'GET',
    MONTHLY_PATH,
    jsonRoute(
      monthlyBody('2026-09', { incomeAmount: 0, expenseAmount: 0, transferAmount: 0, revision: 1 })
    )
  );
  gateway.route(
    'GET',
    CATEGORY_PATH,
    jsonRoute(
      categoryBody('2026-09', { revision: 1, categories: [{ category: 'FOOD', amount: 0 }] })
    )
  );
  selectMonth(store, '2026-09');
  await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ]);
  assert.equal(asset(store).cashflowMonthly.error, null);
  assert.equal(asset(store).cashflowMonthly.data.incomeAmount, 0);
  assert.notEqual(asset(store).cashflowMonthly.data.incomeAmount, null);
  assert.deepEqual(asset(store).cashflowCategory.data.categories, [
    { category: 'FOOD', amount: 0 },
  ]);
});

test('API-16/17: UNCATEGORIZED는 정상이고, 계약에 없는 category 값이 오면 응답 전체를 거부한다', async () => {
  const store = makeStore();
  gateway.route(
    'GET',
    CATEGORY_PATH,
    jsonRoute(
      categoryBody('2026-09', { categories: [{ category: 'UNCATEGORIZED', amount: 7000 }] })
    )
  );
  selectMonth(store, '2026-09');
  await store.dispatch(loadCategoryCashflow('2026-09'));
  assert.equal(asset(store).cashflowCategory.data.categories[0].category, 'UNCATEGORIZED');

  const store2 = makeStore();
  gateway.route(
    'GET',
    CATEGORY_PATH,
    jsonRoute(categoryBody('2026-09', { categories: [{ category: 'UNKNOWN', amount: 7000 }] }))
  );
  selectMonth(store2, '2026-09');
  const rejected = await store2.dispatch(loadCategoryCashflow('2026-09'));
  assert.equal(loadCategoryCashflow.rejected.match(rejected), true);
  assert.equal(asset(store2).cashflowCategory.data, null);
});

test('API-16/17: 서버 오류(401·500·형식 위반)는 오류 상태이며 빈 월처럼 보이지 않는다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute({ status: 500 }, { status: 500 }));
  gateway.route('GET', CATEGORY_PATH, jsonRoute({ yearMonth: '2026-09' }));
  selectMonth(store, '2026-09');
  await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ]);
  assert.equal(asset(store).cashflowMonthly.data, null);
  assert.equal(asset(store).cashflowCategory.data, null);
  assert.equal(typeof asset(store).cashflowMonthly.error, 'string');
  assert.equal(typeof asset(store).cashflowCategory.error, 'string');
  assert.equal(gateway.requestsTo(MONTHLY_PATH).length, 1, '자동 재시도 없음');

  // 사용자가 다시 시도하면 새 요청이 나가고 성공하면 오류가 사라진다.
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09')));
  await store.dispatch(loadMonthlyCashflow('2026-09'));
  assert.equal(asset(store).cashflowMonthly.error, null);
  assert.notEqual(asset(store).cashflowMonthly.data, null);

  const unauth = makeStore();
  gateway.reset();
  gateway.rejectAllTokens = true;
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09')));
  selectMonth(unauth, '2026-09');
  await unauth.dispatch(loadMonthlyCashflow('2026-09'));
  assert.equal(asset(unauth).cashflowMonthly.data, null);
});

test('API-16/17: 진행 중에는 같은 집계를 중복 요청하지 않는다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09'), { delay: 100 }));
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09'), { delay: 100 }));
  selectMonth(store, '2026-09');
  const first = [
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ];
  const dup1 = await store.dispatch(loadMonthlyCashflow('2026-09'));
  const dup2 = await store.dispatch(loadCategoryCashflow('2026-09'));
  assert.equal(dup1.meta.condition, true);
  assert.equal(dup2.meta.condition, true);
  await Promise.all(first);
  assert.equal(gateway.requestsTo(MONTHLY_PATH).length, 1);
  assert.equal(gateway.requestsTo(CATEGORY_PATH).length, 1);
});

test('API-16/17: revision은 보관되어 두 응답의 집계 시점 차이를 비교할 수 있다', async () => {
  const store = makeStore();
  gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09', { revision: 3 })));
  gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09', { revision: 4 })));
  selectMonth(store, '2026-09');
  await Promise.all([
    store.dispatch(loadMonthlyCashflow('2026-09')),
    store.dispatch(loadCategoryCashflow('2026-09')),
  ]);
  assert.equal(asset(store).cashflowMonthly.data.revision, 3);
  assert.equal(asset(store).cashflowCategory.data.revision, 4);
});

// ── 사용자 전환 / 초기화 ──────────────────────────────────────

const sessionEnders = {
  'logoutUser.pending': () => logoutUser.pending('rid'),
  'logoutUser.fulfilled': () => logoutUser.fulfilled({}, 'rid'),
  logout: () => logout(),
  'loginUser.fulfilled': () => loginUser.fulfilled({ user: { userId: '2' } }, 'rid', {}),
};

for (const [name, makeAction] of Object.entries(sessionEnders)) {
  test(`세션 종료(${name}): Cashflow 상태 전체가 초기화되고 이전 사용자 값이 남지 않는다`, async () => {
    const store = makeStore();
    gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody({ dailyLimit: 424242 })));
    gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09', { incomeAmount: 777777 })));
    gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09')));
    await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10, fixedExpenses: 987654 }));
    selectMonth(store, '2026-09');
    await Promise.all([
      store.dispatch(loadMonthlyCashflow('2026-09')),
      store.dispatch(loadCategoryCashflow('2026-09')),
    ]);
    assert.notEqual(asset(store).cashflowDaily.result, null);

    store.dispatch(makeAction());
    const state = asset(store);
    assert.deepEqual(state.cashflowDaily, {
      result: null,
      input: null,
      loading: false,
      error: null,
      errorStatus: null,
      requestId: null,
    });
    assert.equal(state.cashflowYearMonth, null);
    assert.deepEqual(state.cashflowMonthly, {
      data: null,
      loading: false,
      error: null,
      requestId: null,
    });
    assert.deepEqual(state.cashflowCategory, {
      data: null,
      loading: false,
      error: null,
      requestId: null,
    });
    const serialized = JSON.stringify(state);
    for (const leaked of ['424242', '777777', '987654']) {
      assert.equal(serialized.includes(leaked), false, `${leaked} 잔존`);
    }
  });

  test(`세션 종료(${name}): 로그아웃 직전에 보낸 느린 응답(API-15·16·17)은 새 세션 상태를 바꾸지 않는다`, async () => {
    const store = makeStore();
    gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody(), { delay: LATE }));
    gateway.route('GET', MONTHLY_PATH, jsonRoute(monthlyBody('2026-09'), { delay: LATE }));
    gateway.route('GET', CATEGORY_PATH, jsonRoute(categoryBody('2026-09'), { delay: LATE }));
    selectMonth(store, '2026-09');
    const inflight = [
      store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10 })),
      store.dispatch(loadMonthlyCashflow('2026-09')),
      store.dispatch(loadCategoryCashflow('2026-09')),
    ];
    store.dispatch(makeAction());
    const snapshot = JSON.stringify(asset(store));
    await Promise.all(inflight);
    await sleep(20);
    assert.equal(JSON.stringify(asset(store)), snapshot);
  });
}

test('사용자 전환: 사용자 B가 조회하면 B의 값만 보이고 A의 입력(input)이 복원되지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody({ dailyLimit: 1111 })));
  await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10, fixedExpenses: 123456 }));
  store.dispatch(logoutUser.pending('rid'));
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  assert.equal(asset(store).cashflowDaily.input, null);

  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody({ dailyLimit: 2222 })));
  await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 5 }));
  assert.equal(asset(store).cashflowDaily.result.dailyLimit, 2222);
  assert.deepEqual(asset(store).cashflowDaily.input, { daysUntilNextPayday: 5 });
});

test('실서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
