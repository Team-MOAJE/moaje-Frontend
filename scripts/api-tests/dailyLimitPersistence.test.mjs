// API-15 일일 사용 가능 금액 로컬 보관·복원 테스트 — 모의 Gateway + AsyncStorage 메모리 스텁만 사용(실서버·Android 호출 없음).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/dailyLimitPersistence.test.mjs
// "앱 재실행"은 새 Redux store를 만들어 모사한다(메모리 상태 소실, AsyncStorage는 유지).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { gateway, jsonRoute, everRequested } from './assetTestEnv.mjs';
import { authEnvelope } from './mockGateway.mjs';
import { __store as asyncStore, __control, __resetControl } from './stubs/asyncStorage.mjs';

const { default: assetReducer } = await import('../../src/features/asset/assetSlice.js');
const { submitDailyLimit, syncDailyLimitForToday } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { loginUser, deleteAccount } = await import('../../src/features/auth/authApi.js');
const { dailyLimitStorageKey } = await import('../../src/features/asset/dailyLimitStorage.js');
const { isDailyLimitCurrent, getLocalDateKey, msUntilNextLocalMidnight, toDisplayWon } =
  await import('../../src/features/asset/cashflowScreenLogic.js');

const DAILY_PATH = '/api/v1/assets/cashflow/daily-limit';
const ME_PATH = '/api/v1/auth/me';

// ── 시계 고정(로컬 날짜 기준) ─────────────────────────────────
const RealDate = Date;
let fixedTime = null;
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0 && fixedTime !== null) super(fixedTime);
    else super(...args);
  }
  static now() {
    return fixedTime ?? RealDate.now();
  }
}
globalThis.Date = FakeDate;
const setNow = (year, month, day, hour = 12, minute = 0) => {
  fixedTime = new RealDate(year, month - 1, day, hour, minute, 0).getTime();
};
after(() => {
  globalThis.Date = RealDate;
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => {
  asyncStore.clear();
  __resetControl();
  setNow(2026, 10, 13);
});

// ── 헬퍼 ──────────────────────────────────────────────────────
const dailyBody = (overrides = {}) => ({
  userId: '101',
  currentBalance: 800000.0,
  expectedIncome: 0,
  fixedExpenses: 0,
  eventBuffer: 0,
  daysUntilNextPayday: 15,
  dailyLimit: 53333.3333,
  snapshotDate: '2026-10-13',
  ...overrides,
});

const makeStore = userId => {
  const authInitial = authReducer(undefined, { type: 'init' });
  return configureStore({
    reducer: { auth: authReducer, asset: assetReducer },
    preloadedState: userId
      ? {
          auth: {
            ...authInitial,
            user: { userId },
            isAuthenticated: true,
            isAppUnlocked: true,
          },
        }
      : undefined,
  });
};
const asset = store => store.getState().asset;
const daily = store => asset(store).cashflowDaily;
const storedRaw = userId => asyncStore.get(dailyLimitStorageKey(userId)) ?? null;
const storedRecord = userId => JSON.parse(storedRaw(userId));

const signOut = store => store.dispatch(logout());
const signIn = (store, userId) => {
  const requestId = `rid-${userId}`;
  store.dispatch(loginUser.pending(requestId, {}));
  store.dispatch(loginUser.fulfilled({ user: { userId } }, requestId, {}));
  assert.equal(store.getState().auth.user.userId, userId);
};

const calculate = async (store, input = { daysUntilNextPayday: 15 }, body = dailyBody()) => {
  gateway.route('POST', DAILY_PATH, jsonRoute(body));
  const action = await store.dispatch(submitDailyLimit(input));
  assert.equal(submitDailyLimit.fulfilled.match(action), true);
  return action;
};

const captureWarn = () => {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  return {
    calls,
    restore: () => {
      console.warn = original;
    },
  };
};

// ── 1~2. 저장과 앱 재실행 복원 ────────────────────────────────

test('계산 성공: 서버 결과·계산일·입력만 사용자 키로 저장하고 토큰은 저장하지 않는다', async () => {
  const store = makeStore('101');
  await calculate(store, { daysUntilNextPayday: 15, fixedExpenses: 120000 });

  const record = storedRecord('101');
  assert.equal(record.userId, '101');
  assert.equal(record.calculatedOn, '2026-10-13');
  assert.equal(record.result.dailyLimit, 53333.3333);
  assert.deepEqual(record.input, { daysUntilNextPayday: 15, fixedExpenses: 120000 });
  const raw = storedRaw('101');
  for (const secret of ['valid', 'refresh', 'Bearer', 'userId":"101","currentBalance']) {
    assert.equal(raw.includes(secret), false, `${secret} 저장됨`);
  }
  assert.equal(daily(store).result.dailyLimit, 53333.3333);
  assert.equal(asset(store).dailyLimitMeta.calculatedOn, '2026-10-13');
});

test('앱 재실행(같은 사용자·같은 날짜): 계산하지 않고 홈 금액(53,333원)을 복원한다', async () => {
  await calculate(makeStore('101'), { daysUntilNextPayday: 15, fixedExpenses: 120000 });
  const requestsBefore = gateway.requestsTo(DAILY_PATH).length;

  const restarted = makeStore('101');
  assert.equal(daily(restarted).result, null);
  const action = await restarted.dispatch(syncDailyLimitForToday());

  assert.equal(action.payload, 'restored');
  assert.equal(
    gateway.requestsTo(DAILY_PATH).length,
    requestsBefore,
    '서버를 다시 호출하지 않는다'
  );
  assert.equal(toDisplayWon(daily(restarted).result.dailyLimit), 53333);
  assert.equal(daily(restarted).result.dailyLimit, 53333.3333, '소수 4자리를 보정하지 않는다');
  assert.deepEqual(daily(restarted).input, { daysUntilNextPayday: 15, fixedExpenses: 120000 });
  assert.equal(
    isDailyLimitCurrent(asset(restarted).dailyLimitMeta.calculatedOn, getLocalDateKey()),
    true
  );
});

// ── 3. 화면 이동 후 유지 ──────────────────────────────────────

test('홈 재진입(같은 store): 결과를 유지하고 저장소·서버를 건드리지 않는다', async () => {
  const store = makeStore('101');
  await calculate(store);
  const before = JSON.stringify(daily(store));
  __control.log.length = 0;

  const action = await store.dispatch(syncDailyLimitForToday());

  assert.equal(action.payload, 'kept');
  assert.equal(JSON.stringify(daily(store)), before);
  assert.deepEqual(__control.log, [], '메모리 결과가 유효하면 저장소 접근이 없다');
});

// ── 4~5. 로그아웃·재로그인·사용자 격리 ────────────────────────

test('로그아웃: Redux는 비우고 로컬 기록은 유지 → 같은 사용자 재로그인 시 복원', async () => {
  const store = makeStore('101');
  await calculate(store);

  signOut(store);
  assert.equal(daily(store).result, null);
  assert.notEqual(storedRaw('101'), null, '동일 사용자 재로그인용 기록 유지');

  signIn(store, '101');
  const action = await store.dispatch(syncDailyLimitForToday());
  assert.equal(action.payload, 'restored');
  assert.equal(daily(store).result.dailyLimit, 53333.3333);
});

test('다른 사용자 로그인: 이전 사용자 결과가 보이지 않고, 원래 사용자로 돌아오면 복원된다', async () => {
  const store = makeStore('101');
  await calculate(store, { daysUntilNextPayday: 15 }, dailyBody({ dailyLimit: 53333.3333 }));
  const bStore = makeStore('202');
  await calculate(
    bStore,
    { daysUntilNextPayday: 5 },
    dailyBody({ userId: '202', dailyLimit: 20000, daysUntilNextPayday: 5 })
  );

  signOut(store);
  signIn(store, '303'); // 기록이 없는 제3의 사용자
  assert.equal((await store.dispatch(syncDailyLimitForToday())).payload, 'none');
  assert.equal(daily(store).result, null);
  assert.equal(daily(store).input, null);

  signOut(store);
  signIn(store, '202');
  await store.dispatch(syncDailyLimitForToday());
  assert.equal(daily(store).result.dailyLimit, 20000, 'B에게는 B의 값만 보인다');

  signOut(store);
  signIn(store, '101');
  await store.dispatch(syncDailyLimitForToday());
  assert.equal(daily(store).result.dailyLimit, 53333.3333);
  assert.equal(storedRecord('202').result.dailyLimit, 20000, 'B 기록은 그대로');
});

test('복원 읽기 중 사용자가 바뀌면 이전 사용자 기록을 새 사용자 화면에 적용하지 않는다', async () => {
  await calculate(makeStore('101'));
  const store = makeStore('101');
  __control.delay.get = 40;

  const pending = store.dispatch(syncDailyLimitForToday());
  signOut(store);
  signIn(store, '202');
  const action = await pending;

  assert.equal(action.payload, 'skipped');
  assert.equal(daily(store).result, null);
  assert.equal(asset(store).dailyLimitMeta.ownerUserId, null);
});

// ── 6~7. 날짜 변경 ────────────────────────────────────────────

test('다음 날 앱 실행: 어제 결과는 복원하지 않고 로컬 기록도 정리한다(자동 재계산 없음)', async () => {
  await calculate(makeStore('101'));
  setNow(2026, 10, 14, 9);
  const requestsBefore = gateway.requestsTo(DAILY_PATH).length;

  const restarted = makeStore('101');
  const action = await restarted.dispatch(syncDailyLimitForToday());

  assert.equal(action.payload, 'expired');
  assert.equal(daily(restarted).result, null);
  assert.equal(storedRaw('101'), null);
  assert.equal(gateway.requestsTo(DAILY_PATH).length, requestsBefore, '자동 재계산 없음');
});

test('앱을 켜 둔 채 자정 통과(백그라운드 복귀/타이머): 어제 금액을 만료시키고 표시 조건도 false', async () => {
  const store = makeStore('101');
  await calculate(store);
  assert.equal(
    isDailyLimitCurrent(asset(store).dailyLimitMeta.calculatedOn, getLocalDateKey()),
    true
  );

  setNow(2026, 10, 14, 0, 0);
  // 만료 확인 전에도 홈이 쓰는 표시 조건은 이미 어제 결과를 거부한다.
  assert.equal(
    isDailyLimitCurrent(asset(store).dailyLimitMeta.calculatedOn, getLocalDateKey()),
    false
  );

  const action = await store.dispatch(syncDailyLimitForToday());
  assert.equal(action.payload, 'expired');
  assert.equal(daily(store).result, null);
  assert.equal(storedRaw('101'), null);
});

test('시계 주입: now 인자로 날짜를 넘기면 그 날짜 기준으로 판정한다', async () => {
  const store = makeStore('101');
  await calculate(store);
  const action = await store.dispatch(
    syncDailyLimitForToday({ now: new RealDate(2026, 9, 14, 8) })
  );
  assert.equal(action.payload, 'expired');
});

test('다음 자정까지의 대기 시간: 로컬 자정을 넘기며 UTC 변환으로 하루가 밀리지 않는다', () => {
  const evening = new RealDate(2026, 9, 13, 23, 59, 0); // 로컬 2026-10-13 23:59
  assert.equal(getLocalDateKey(evening), '2026-10-13');
  assert.equal(msUntilNextLocalMidnight(evening), 60 * 1000 + 1000);
  const lateNight = new RealDate(2026, 9, 13, 0, 30, 0);
  assert.equal(getLocalDateKey(lateNight), '2026-10-13');
  assert.equal(msUntilNextLocalMidnight(lateNight), 23.5 * 3600 * 1000 + 1000);
});

test('계산 요청 중 자정을 넘기면 이전 날짜 응답을 반영·저장하지 않는다', async () => {
  const store = makeStore('101');
  setNow(2026, 10, 13, 23, 59);
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody(), { delay: 60 }));

  const pending = store.dispatch(submitDailyLimit({ daysUntilNextPayday: 15 }));
  setNow(2026, 10, 14, 0, 1);
  const action = await pending;

  assert.equal(submitDailyLimit.rejected.match(action), true);
  assert.equal(daily(store).result, null);
  assert.match(daily(store).error, /날짜가 바뀌어/);
  assert.equal(storedRaw('101'), null);
});

test('만료 삭제가 느려도 그 사이 저장된 새 계산 결과를 지우지 않는다', async () => {
  await calculate(makeStore('101'), { daysUntilNextPayday: 15 }, dailyBody({ dailyLimit: 11111 }));
  setNow(2026, 10, 14, 9);
  const restarted = makeStore('101');
  __control.delay.get = 40; // 복원 시도의 읽기·만료 삭제가 느리다.

  gateway.route(
    'POST',
    DAILY_PATH,
    jsonRoute(dailyBody({ dailyLimit: 40000, snapshotDate: '2026-10-14' }))
  );
  const [syncAction, submitAction] = await Promise.all([
    restarted.dispatch(syncDailyLimitForToday()),
    restarted.dispatch(submitDailyLimit({ daysUntilNextPayday: 15 })),
  ]);

  assert.equal(syncDailyLimitForToday.fulfilled.match(syncAction), true);
  assert.equal(submitDailyLimit.fulfilled.match(submitAction), true);
  assert.equal(daily(restarted).result.dailyLimit, 40000);
  assert.equal(storedRecord('101').calculatedOn, '2026-10-14');
  assert.equal(storedRecord('101').result.dailyLimit, 40000, '새 결과가 보존된다');
});

// ── 8~10. 실패·재계산·계산 중 사용자 전환 ─────────────────────

test('계산 실패: 아무것도 저장하지 않고, 이전에 저장된 정상 결과도 지우지 않는다', async () => {
  const store = makeStore('101');
  gateway.route('POST', DAILY_PATH, () => ({ status: 500, body: { message: 'boom' } }));
  const failed = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 15 }));
  assert.equal(submitDailyLimit.rejected.match(failed), true);
  assert.equal(storedRaw('101'), null, '첫 실패는 저장하지 않는다');

  await calculate(store, { daysUntilNextPayday: 15 }, dailyBody({ dailyLimit: 53333.3333 }));
  const saved = storedRaw('101');
  gateway.route('POST', DAILY_PATH, () => ({ status: 500, body: { message: 'boom' } }));
  await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 10 }));

  assert.equal(storedRaw('101'), saved, '실패한 재계산이 정상 기록을 덮어쓰지 않는다');
  assert.equal(daily(store).result.dailyLimit, 53333.3333);
  assert.notEqual(daily(store).error, null);
});

test('응답 형식이 잘못된 계산(검증 실패)도 저장하지 않는다', async () => {
  const store = makeStore('101');
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody({ dailyLimit: '53333' })));
  const action = await store.dispatch(submitDailyLimit({ daysUntilNextPayday: 15 }));
  assert.equal(submitDailyLimit.rejected.match(action), true);
  assert.equal(storedRaw('101'), null);
  assert.equal(daily(store).result, null);
});

test('같은 날짜 재계산 성공: 화면과 저장소 모두 최신 결과(40,000원)로 갱신된다', async () => {
  const store = makeStore('101');
  await calculate(store, { daysUntilNextPayday: 15 }, dailyBody({ dailyLimit: 53333.3333 }));
  await calculate(
    store,
    { daysUntilNextPayday: 10 },
    dailyBody({ dailyLimit: 40000, daysUntilNextPayday: 10 })
  );

  assert.equal(daily(store).result.dailyLimit, 40000);
  assert.equal(storedRecord('101').result.dailyLimit, 40000);
  const restarted = makeStore('101');
  await restarted.dispatch(syncDailyLimitForToday());
  assert.equal(daily(restarted).result.dailyLimit, 40000);
});

test('계산 요청 중 사용자 전환: 이전 사용자 응답을 새 사용자 상태에도 저장소에도 반영하지 않는다', async () => {
  const store = makeStore('101');
  gateway.route('POST', DAILY_PATH, jsonRoute(dailyBody({ dailyLimit: 77777 }), { delay: 60 }));

  const pending = store.dispatch(submitDailyLimit({ daysUntilNextPayday: 15 }));
  signOut(store);
  signIn(store, '202');
  await pending;
  await sleep(10);

  assert.equal(daily(store).result, null);
  assert.equal(asset(store).dailyLimitMeta.calculatedOn, null);
  assert.equal(storedRaw('101'), null, 'A 응답이 저장되지 않는다');
  assert.equal(storedRaw('202'), null, 'B 기록으로 저장되지 않는다');
});

// ── 12. 손상된 저장 데이터 ────────────────────────────────────

const corruptCases = {
  '깨진 JSON': '{not json',
  배열: '[]',
  '다른 버전': JSON.stringify({
    version: 99,
    userId: '101',
    calculatedOn: '2026-10-13',
    result: {},
  }),
  '다른 사용자 기록': JSON.stringify({
    version: 1,
    userId: '999',
    calculatedOn: '2026-10-13',
    result: {
      currentBalance: 1,
      expectedIncome: 0,
      fixedExpenses: 0,
      eventBuffer: 0,
      daysUntilNextPayday: 1,
      dailyLimit: 5,
      snapshotDate: '2026-10-13',
    },
  }),
  '금액이 문자열': JSON.stringify({
    version: 1,
    userId: '101',
    calculatedOn: '2026-10-13',
    result: {
      currentBalance: '1',
      expectedIncome: 0,
      fixedExpenses: 0,
      eventBuffer: 0,
      daysUntilNextPayday: 1,
      dailyLimit: '5',
      snapshotDate: '2026-10-13',
    },
  }),
  '날짜 형식 오류': JSON.stringify({
    version: 1,
    userId: '101',
    calculatedOn: '2026/10/13',
    result: {},
  }),
};

for (const [name, raw] of Object.entries(corruptCases)) {
  test(`손상된 저장 데이터(${name}): 가짜 값을 표시하지 않고 계산 진입 상태를 유지한다`, async () => {
    asyncStore.set(dailyLimitStorageKey('101'), raw);
    const store = makeStore('101');

    const action = await store.dispatch(syncDailyLimitForToday());

    assert.equal(syncDailyLimitForToday.fulfilled.match(action), true);
    assert.equal(daily(store).result, null);
    assert.equal(asset(store).dailyLimitMeta.calculatedOn, null);
    // 이후 정상 계산은 손상 값 위에 문제없이 저장된다.
    await calculate(store);
    assert.equal(storedRecord('101').result.dailyLimit, 53333.3333);
  });
}

test('저장소 읽기가 실패해도 홈 동작은 중단되지 않고 진단 로그만 남는다', async () => {
  await calculate(makeStore('101'));
  const store = makeStore('101');
  __control.fail.get = 1;
  const warn = captureWarn();
  try {
    const action = await store.dispatch(syncDailyLimitForToday());
    assert.equal(syncDailyLimitForToday.fulfilled.match(action), true);
    assert.equal(daily(store).result, null);
    assert.equal(warn.calls.length, 1);
    assert.equal(JSON.stringify(warn.calls).includes('101'), false, '로그에 사용자 ID가 없다');
  } finally {
    warn.restore();
  }
});

test('저장소 쓰기가 실패해도 계산 결과는 화면에 반영된다', async () => {
  const store = makeStore('101');
  __control.fail.set = 1;
  const warn = captureWarn();
  try {
    await calculate(store);
    assert.equal(daily(store).result.dailyLimit, 53333.3333);
    assert.equal(storedRaw('101'), null);
    assert.equal(warn.calls.length, 1);
  } finally {
    warn.restore();
  }
});

// ── 13. 회원 탈퇴 ─────────────────────────────────────────────

test('회원 탈퇴 성공: 해당 사용자의 로컬 기록만 삭제하고 인증 상태는 정리된다', async () => {
  const storeA = makeStore('101');
  await calculate(storeA);
  await calculate(makeStore('202'), { daysUntilNextPayday: 15 }, dailyBody({ userId: '202' }));
  gateway.route('DELETE', ME_PATH, () => ({
    body: authEnvelope({ message: 'ok' }, { code: 'AUTH-200-013' }),
  }));
  gateway.validTokens.add('valid');

  const action = await storeA.dispatch(deleteAccount({ currentPin: '012345' }));

  assert.equal(action.meta.requestStatus, 'fulfilled');
  assert.equal(action.payload.sessionEnded, true);
  assert.equal(storedRaw('101'), null);
  assert.notEqual(storedRaw('202'), null, '다른 사용자 기록은 유지');
  assert.equal(storedRaw('202') !== null && storedRecord('202').userId, '202');
  assert.equal(storeA.getState().auth.isAuthenticated, false);
  assert.equal(daily(storeA).result, null);
});

test('회원 탈퇴 실패(서버 거절): 로컬 기록을 지우지 않는다', async () => {
  const store = makeStore('101');
  await calculate(store);
  gateway.route('DELETE', ME_PATH, () => ({
    status: 400,
    body: authEnvelope(null, { success: false, code: 'AUTH-400-003', status: 400 }),
  }));
  const action = await store.dispatch(deleteAccount({ currentPin: '000000' }));
  assert.equal(action.meta.requestStatus, 'rejected');
  assert.notEqual(storedRaw('101'), null);
  assert.equal(store.getState().auth.isAuthenticated, true);
});

test('회원 탈퇴 성공 + 로컬 삭제 실패: 로그아웃 전환은 중단되지 않고 민감정보 없는 진단 로그만 남는다', async () => {
  const store = makeStore('101');
  await calculate(store);
  gateway.route('DELETE', ME_PATH, () => ({
    body: authEnvelope({ message: 'ok' }, { code: 'AUTH-200-013' }),
  }));
  gateway.validTokens.add('valid');
  __control.fail.remove = 1;
  const warn = captureWarn();
  try {
    const action = await store.dispatch(deleteAccount({ currentPin: '012345' }));

    assert.equal(action.meta.requestStatus, 'fulfilled');
    assert.equal(action.payload.sessionEnded, true);
    assert.equal(store.getState().auth.isAuthenticated, false);
    assert.equal(store.getState().auth.user, null);
    assert.equal(daily(store).result, null);
    assert.equal(warn.calls.length, 1, '조용히 무시하지 않고 로그를 남긴다');
    const logged = JSON.stringify(warn.calls);
    for (const secret of ['101', '012345', '53333', 'valid']) {
      assert.equal(logged.includes(secret), false, `${secret} 로그 노출`);
    }
  } finally {
    warn.restore();
  }
});

// ── 14~15. 기존 계약·UI 연결 유지 ─────────────────────────────

test('API-15 요청 계약 유지: 입력값만 POST 본문에 넣고 userId·날짜·추가 헤더를 보내지 않는다', async () => {
  const store = makeStore('101');
  await calculate(store, { daysUntilNextPayday: 15, fixedExpenses: 120000 });
  const [request] = gateway.requestsTo(DAILY_PATH);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, { daysUntilNextPayday: 15, fixedExpenses: 120000 });
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['idempotency-key'], undefined);
});

test('복원·만료 확인은 서버를 호출하지 않는다', async () => {
  await calculate(makeStore('101'));
  const count = gateway.requests.length;
  const store = makeStore('101');
  await store.dispatch(syncDailyLimitForToday());
  setNow(2026, 10, 14);
  await store.dispatch(syncDailyLimitForToday());
  assert.equal(gateway.requests.length, count);
});

test('홈 화면 연결: 결과 표시는 계산일 확인을 거치고, 진입·앱 복귀·자정 타이머에서 동기화한다', () => {
  const source = readFileSync(
    new URL('../../src/screens/home/HomeScreen.js', import.meta.url),
    'utf8'
  ).replace(/\/\/.*$/gm, '');
  assert.match(source, /syncDailyLimitForToday/);
  assert.match(source, /AppState\.addEventListener\('change'/);
  assert.match(source, /nextState === 'active'/);
  assert.match(source, /msUntilNextLocalMidnight\(\)/);
  assert.match(source, /setTimeout\(/);
  assert.match(source, /clearTimeout\(timerId\)/);
  assert.match(source, /subscription\.remove\(\)/);
  assert.match(source, /isDailyLimitCurrent\(dailyLimitMeta\.calculatedOn, todayKey\)/);
  // 기존 연결 유지
  assert.match(source, /state\.asset\.cashflowDaily\.result/);
  assert.match(source, /navigation\.navigate\(ROUTES\.DAILY_LIMIT\)/);
});

test('실서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
