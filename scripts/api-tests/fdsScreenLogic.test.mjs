// 이상거래 알림 화면 로직(API-25~28) 단위 테스트. 서버 호출 없음(함수 주입), 순수 로직만 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/fdsScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const logic = await import('../../src/features/work/fdsScreenLogic.js');
const {
  ALERTS_LIMIT,
  CONFIRM_REJECT,
  FDS_STATUS: S,
  FDS_TAB,
  LOGS_LIMIT,
  NO_ANALYZED_NOTICE,
  buildAlertViewModel,
  buildLogViewModel,
  buildScoreViewModel,
  createFdsSession,
  describeConfirmError,
  describeRiskLevel,
} = logic;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';
const BIG_ALERT_ID = '1234567890123456789';
const OTHER_ALERT_ID = '1234567890123456788';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const httpError = status =>
  Object.assign(createApiError({ kind: API_ERROR_KIND.HTTP_4XX, message: 'x' }), { status });

const scoreModel = (overrides = {}) => ({
  safetyScore: 92,
  grade: 'A',
  emoji: '🛡️',
  totalTx: 12,
  highCount: 0,
  mediumCount: 1,
  periodDays: 30,
  message: '안전한 소비 습관이에요.',
  ...overrides,
});

const alertModel = (overrides = {}) => ({
  alertId: BIG_ALERT_ID,
  transactionId: 'work-fds-1-1',
  amount: '900000.0000',
  merchant: null,
  riskLevel: 'HIGH',
  reasonCode: 'RULE_ABNORMAL_AMOUNT(z=4.2)',
  message: '🚨 이상 거래가 감지됐어요.',
  isConfirmed: false,
  confirmedAt: null,
  createdAt: '2026-10-11 03:00:00',
  ...overrides,
});

const alertsModel = (overrides = {}) => ({
  total: 2,
  unread: 2,
  returned: 2,
  alerts: [alertModel(), alertModel({ alertId: OTHER_ALERT_ID, riskLevel: 'MEDIUM' })],
  ...overrides,
});

const logModel = (overrides = {}) => ({
  logId: '7',
  transactionId: 'tx-1',
  amount: '10000.0000',
  riskScore: '0.1500',
  riskLevel: 'LOW',
  reasonCode: 'NORMAL',
  isAlerted: false,
  createdAt: '2026-10-11 03:00:00',
  ...overrides,
});

const newSession = (setup = {}) => {
  const calls = [];
  const handlers = {
    score: async () => scoreModel(),
    alerts: async () => alertsModel(),
    logs: async () => [logModel()],
    confirm: async (userId, alertId) => ({
      alertId,
      isConfirmed: true,
      confirmedAt: '2026-10-11 05:00:00',
    }),
    ...setup,
  };
  const session = createFdsSession({
    fetchSafetyScore: (...a) => (calls.push(['score', ...a]), handlers.score(...a)),
    fetchFdsAlerts: (...a) => (calls.push(['alerts', ...a]), handlers.alerts(...a)),
    fetchFdsLogs: (...a) => (calls.push(['logs', ...a]), handlers.logs(...a)),
    confirmFdsAlert: (...a) => (calls.push(['confirm', ...a]), handlers.confirm(...a)),
  });
  const count = name => calls.filter(call => call[0] === name).length;
  return { session, calls, handlers, count };
};

// ── 뷰모델 ───────────────────────────────────────────────────

test('안전도 뷰모델: 점수·등급·이모지·메시지는 서버 값 그대로, 거래가 있으면 참고용 안내 없음', () => {
  const vm = buildScoreViewModel(scoreModel());
  assert.equal(vm.scoreText, '92점');
  assert.equal(vm.grade, 'A');
  assert.equal(vm.emoji, '🛡️');
  assert.equal(vm.message, '안전한 소비 습관이에요.');
  assert.equal(vm.periodText, '최근 30일 기준');
  assert.equal(vm.noAnalyzedTransactions, false);
  assert.equal(vm.referenceNotice, null);
  assert.deepEqual(
    vm.rows.map(row => [row.key, row.value]),
    [
      ['totalTx', '12건'],
      ['highCount', '0건'],
      ['mediumCount', '1건'],
    ]
  );
});

test('안전도 뷰모델: total_tx 0이면 100점/A 그대로 두고 참고용 안내만 추가', () => {
  const vm = buildScoreViewModel(
    scoreModel({ safetyScore: 100, grade: 'A', totalTx: 0, highCount: 0, mediumCount: 0 })
  );
  assert.equal(vm.scoreText, '100점', '서버 점수는 바꾸지 않음');
  assert.equal(vm.grade, 'A', '서버 등급은 바꾸지 않음');
  assert.equal(vm.message, '안전한 소비 습관이에요.', '서버 메시지는 숨기지 않음');
  assert.equal(vm.noAnalyzedTransactions, true);
  assert.equal(vm.referenceNotice, NO_ANALYZED_NOTICE);
  assert.equal(NO_ANALYZED_NOTICE, '분석된 거래가 없어 현재 점수는 참고용이에요.');
});

test('알림 뷰모델: 금액 포맷, 위험도 라벨, 확인 전/후 표시, id는 문자열 그대로', () => {
  const vm = buildAlertViewModel(alertModel({ merchant: '편의점' }));
  assert.equal(vm.alertId, BIG_ALERT_ID);
  assert.equal(vm.key, BIG_ALERT_ID);
  assert.equal(vm.riskLabel, '높은 위험');
  assert.equal(vm.amountText, '900,000원');
  assert.equal(vm.merchantText, '편의점');
  assert.equal(vm.message, '🚨 이상 거래가 감지됐어요.');
  assert.equal(vm.createdText, '2026-10-11 03:00');
  assert.equal(vm.isConfirmed, false);
  assert.equal(vm.confirmedText, null);

  const confirmed = buildAlertViewModel(
    alertModel({ isConfirmed: true, confirmedAt: '2026-10-11 04:30:00', merchant: '' })
  );
  assert.equal(confirmed.confirmedText, '2026-10-11 04:30');
  assert.equal(confirmed.merchantText, null);
});

test('로그 뷰모델·위험도 라벨: 알 수 없는 위험도는 서버 원문 그대로', () => {
  const vm = buildLogViewModel(logModel({ isAlerted: true, riskLevel: 'MEDIUM' }));
  assert.equal(vm.riskLabel, '주의');
  assert.equal(vm.amountText, '10,000원');
  assert.equal(vm.isAlerted, true);
  assert.equal(describeRiskLevel('LOW'), '낮음');
  assert.equal(describeRiskLevel('NEW_LEVEL'), 'NEW_LEVEL');
});

test('확인 실패 문구: 404는 목록 새로고침 안내, 서버 원문·ID 노출 없음', () => {
  assert.match(describeConfirmError('NOT_FOUND'), /새로고침/);
  assert.match(describeConfirmError('NETWORK'), /확인 처리하지 못했어요/);
  assert.equal(describeConfirmError('NOT_FOUND').includes(BIG_ALERT_ID), false);
});

// ── 요청 시점 ────────────────────────────────────────────────

test('진입 시: 점수·알림 GET만 나가고 로그·확인(PATCH)은 나가지 않음, 알림은 limit 50 전체 목록', async () => {
  const { session, calls, count } = newSession();
  await session.setUser(UID);

  assert.equal(count('score'), 1);
  assert.equal(count('alerts'), 1);
  assert.equal(count('logs'), 0);
  assert.equal(count('confirm'), 0);
  assert.deepEqual(calls.find(call => call[0] === 'alerts').slice(1), [
    UID,
    { limit: ALERTS_LIMIT, unread: false },
  ]);
  assert.deepEqual(calls.find(call => call[0] === 'score').slice(1), [UID]);

  const snap = session.getSnapshot();
  assert.equal(snap.score.status, S.READY);
  assert.equal(snap.alerts.status, S.READY);
  assert.equal(snap.alerts.items.length, 2);
  session.dispose();
});

test('같은 사용자로 setUser를 다시 호출해도 요청이 늘지 않음(StrictMode 대비)', async () => {
  const { session, calls } = newSession();
  await session.setUser(UID);
  await session.setUser(UID);
  assert.equal(calls.length, 2);
  session.dispose();
});

test('사용자 설정 전/유효하지 않은 사용자는 요청 없음', async () => {
  const { session, calls } = newSession();
  await session.setUser(null);
  await session.setUser('abc');
  await session.selectTab(FDS_TAB.LOGS);
  await session.retry('score');
  assert.deepEqual(calls, []);
  session.dispose();
});

test('탐지 기록 구간은 처음 들어갈 때만 GET, 재진입으로 재요청하지 않음', async () => {
  const { session, calls, count } = newSession();
  await session.setUser(UID);

  await session.selectTab(FDS_TAB.LOGS);
  assert.equal(count('logs'), 1);
  assert.deepEqual(calls.find(call => call[0] === 'logs').slice(1), [UID, { limit: LOGS_LIMIT }]);
  assert.equal(session.getSnapshot().logs.items.length, 1);

  await session.selectTab(FDS_TAB.ALERTS);
  await session.selectTab(FDS_TAB.LOGS);
  assert.equal(count('logs'), 1);
  assert.equal(count('alerts'), 1, '알림 구간 재진입도 재요청 없음');
  session.dispose();
});

test('빈 알림(total 0)은 오류가 아닌 READY(빈 데이터), 가짜 알림 없음', async () => {
  const { session } = newSession({
    alerts: async () => ({ total: 0, unread: 0, returned: 0, alerts: [] }),
  });
  await session.setUser(UID);
  const { alerts } = session.getSnapshot();
  assert.equal(alerts.status, S.READY);
  assert.deepEqual([...alerts.items], []);
  assert.equal(alerts.isTruncated, false);
  session.dispose();
});

test('서버 집계가 반환 개수보다 크면 isTruncated(일부만 표시), 필터별로 해당 집계 기준', async () => {
  const { session } = newSession({
    alerts: async () => alertsModel({ total: 80, unread: 1, returned: 50 }),
  });
  await session.setUser(UID);
  assert.equal(session.getSnapshot().alerts.isTruncated, true);

  const unreadOnly = newSession({
    alerts: async () => alertsModel({ total: 80, unread: 2, returned: 2 }),
  });
  await unreadOnly.session.setUser(UID);
  await unreadOnly.session.setUnreadOnly(true);
  assert.equal(
    unreadOnly.session.getSnapshot().alerts.isTruncated,
    false,
    'unread 집계 2 = 반환 2'
  );
  session.dispose();
  unreadOnly.session.dispose();
});

test('미확인 필터 전환: unread=true로 알림 GET 1회, 같은 값은 무시, 점수는 재요청 없음', async () => {
  const { session, calls, count } = newSession();
  await session.setUser(UID);

  await session.setUnreadOnly(true);
  assert.equal(count('alerts'), 2);
  assert.deepEqual(
    calls
      .filter(call => call[0] === 'alerts')
      .at(-1)
      .slice(1),
    [UID, { limit: ALERTS_LIMIT, unread: true }]
  );
  assert.equal(session.getSnapshot().unreadOnly, true);

  await session.setUnreadOnly(true);
  assert.equal(count('alerts'), 2);
  assert.equal(count('score'), 1);
  await session.setUnreadOnly('yes');
  assert.equal(count('alerts'), 2);
  session.dispose();
});

// ── 오류 ─────────────────────────────────────────────────────

test('오류: errorType+retryable 표시, 자동 재시도 없음, retry()만 재요청, 점수와 알림은 독립', async () => {
  let fail = true;
  const { session, count } = newSession({
    alerts: async () => {
      if (fail) throw createApiError({ kind: API_ERROR_KIND.TIMEOUT });
      return alertsModel();
    },
  });
  await session.setUser(UID);

  const snap = session.getSnapshot();
  assert.equal(snap.alerts.status, S.ERROR);
  assert.equal(snap.alerts.errorType, 'TIMEOUT');
  assert.equal(snap.alerts.retryable, true);
  assert.equal(snap.score.status, S.READY, '점수 성공은 알림 실패와 무관');

  await session.selectTab(FDS_TAB.LOGS);
  await session.selectTab(FDS_TAB.ALERTS);
  assert.equal(count('alerts'), 1, '구간 재진입으로 자동 재시도하지 않음');

  fail = false;
  await session.retry('alerts');
  assert.equal(count('alerts'), 2);
  assert.equal(session.getSnapshot().alerts.status, S.READY);
  session.dispose();
});

test('403은 재시도 불가, 401(UNAUTHORIZED)·응답 형식 오류 분류, CANCELED는 중립(IDLE)', async () => {
  const forbidden = newSession({
    score: async () => {
      throw httpError(403);
    },
  });
  await forbidden.session.setUser(UID);
  assert.equal(forbidden.session.getSnapshot().score.errorType, 'FORBIDDEN');
  assert.equal(forbidden.session.getSnapshot().score.retryable, false);

  const invalid = newSession({
    alerts: async () => {
      throw Object.assign(new Error('x'), { invalidResponse: true });
    },
  });
  await invalid.session.setUser(UID);
  assert.equal(invalid.session.getSnapshot().alerts.errorType, 'INVALID_RESPONSE');

  const unauthorized = newSession({
    alerts: async () => {
      throw createApiError({ kind: API_ERROR_KIND.AUTH_REQUIRED, status: 401 });
    },
  });
  await unauthorized.session.setUser(UID);
  assert.equal(unauthorized.session.getSnapshot().alerts.errorType, 'UNAUTHORIZED');

  const canceled = newSession({
    alerts: async () => {
      throw createApiError({ kind: API_ERROR_KIND.CANCELED });
    },
  });
  await canceled.session.setUser(UID);
  assert.equal(canceled.session.getSnapshot().alerts.status, S.IDLE);

  for (const ctx of [forbidden, invalid, unauthorized, canceled]) ctx.session.dispose();
});

// ── 알림 확인(API-27) ───────────────────────────────────────

test('confirmAlert: 서버 응답 후에만 확인됨으로 바꾸고 미확인 집계를 1 줄임, PATCH 1회(큰 id 문자열 그대로)', async () => {
  const gate = deferred();
  const { session, calls, count } = newSession({ confirm: () => gate.promise });
  await session.setUser(UID);

  const pending = session.confirmAlert(BIG_ALERT_ID);
  let snap = session.getSnapshot();
  const during = snap.alerts.items.find(item => item.alertId === BIG_ALERT_ID);
  assert.equal(during.confirming, true);
  assert.equal(during.canConfirm, false);
  assert.equal(
    during.isConfirmed,
    false,
    '서버 응답 전에는 확인됨으로 바꾸지 않음(낙관적 변경 없음)'
  );
  assert.equal(snap.alerts.unread, 2);

  gate.resolve({ alertId: BIG_ALERT_ID, isConfirmed: true, confirmedAt: '2026-10-11 05:00:00' });
  assert.deepEqual(await pending, { started: true, confirmed: true });

  snap = session.getSnapshot();
  const after = snap.alerts.items.find(item => item.alertId === BIG_ALERT_ID);
  assert.equal(after.isConfirmed, true);
  assert.equal(after.confirmedText, '2026-10-11 05:00');
  assert.equal(after.confirming, false);
  assert.equal(after.canConfirm, false);
  assert.equal(snap.alerts.unread, 1);
  assert.equal(snap.alerts.total, 2, '전체 집계는 유지');
  assert.equal(
    snap.alerts.items.find(item => item.alertId === OTHER_ALERT_ID).isConfirmed,
    false,
    '다른 알림은 영향 없음'
  );

  assert.equal(count('confirm'), 1);
  assert.deepEqual(calls.find(call => call[0] === 'confirm').slice(1), [UID, BIG_ALERT_ID]);
  session.dispose();
});

test('confirmAlert: 진행 중 중복 탭은 IN_FLIGHT, 이미 확인된 알림/모르는 id는 PATCH 없음', async () => {
  const gate = deferred();
  const { session, count } = newSession({
    confirm: () => gate.promise,
    alerts: async () =>
      alertsModel({
        alerts: [
          alertModel(),
          alertModel({
            alertId: OTHER_ALERT_ID,
            isConfirmed: true,
            confirmedAt: '2026-10-11 04:00:00',
          }),
        ],
      }),
  });
  await session.setUser(UID);

  const first = session.confirmAlert(BIG_ALERT_ID);
  assert.deepEqual(await session.confirmAlert(BIG_ALERT_ID), {
    started: false,
    reason: CONFIRM_REJECT.IN_FLIGHT,
  });
  assert.deepEqual(await session.confirmAlert(OTHER_ALERT_ID), {
    started: false,
    reason: CONFIRM_REJECT.ALREADY_CONFIRMED,
  });
  assert.deepEqual(await session.confirmAlert('999'), {
    started: false,
    reason: CONFIRM_REJECT.UNKNOWN_ALERT,
  });

  gate.resolve({ alertId: BIG_ALERT_ID, isConfirmed: true, confirmedAt: '2026-10-11 05:00:00' });
  await first;
  assert.equal(count('confirm'), 1);
  session.dispose();
});

test('confirmAlert 실패: 목록 변경 없음, 알림별 오류 문구, 자동 재시도 없음, 사용자가 다시 탭하면 재요청', async () => {
  let fail = true;
  const { session, count } = newSession({
    confirm: async (userId, alertId) => {
      if (fail) throw httpError(404);
      return { alertId, isConfirmed: true, confirmedAt: '2026-10-11 05:00:00' };
    },
  });
  await session.setUser(UID);

  const result = await session.confirmAlert(BIG_ALERT_ID);
  assert.deepEqual(result, { started: true, confirmed: false, errorType: 'NOT_FOUND' });
  assert.equal(count('confirm'), 1, '자동 재시도 없음');

  let item = session.getSnapshot().alerts.items.find(entry => entry.alertId === BIG_ALERT_ID);
  assert.equal(item.isConfirmed, false);
  assert.equal(item.canConfirm, true);
  assert.match(item.confirmErrorMessage, /새로고침/);
  assert.equal(session.getSnapshot().alerts.unread, 2);
  assert.equal(
    session.getSnapshot().alerts.items.find(entry => entry.alertId === OTHER_ALERT_ID)
      .confirmErrorMessage,
    null
  );

  fail = false;
  await session.confirmAlert(BIG_ALERT_ID);
  item = session.getSnapshot().alerts.items.find(entry => entry.alertId === BIG_ALERT_ID);
  assert.equal(item.isConfirmed, true);
  assert.equal(item.confirmErrorMessage, null);
  assert.equal(count('confirm'), 2);
  session.dispose();
});

test('confirmAlert: CANCELED는 오류 표시 없이 확인 전 상태로 복귀', async () => {
  const { session } = newSession({
    confirm: async () => {
      throw createApiError({ kind: API_ERROR_KIND.CANCELED });
    },
  });
  await session.setUser(UID);
  const result = await session.confirmAlert(BIG_ALERT_ID);
  assert.deepEqual(result, { started: true, canceled: true });
  const item = session.getSnapshot().alerts.items.find(entry => entry.alertId === BIG_ALERT_ID);
  assert.equal(item.confirming, false);
  assert.equal(item.confirmErrorMessage, null);
  session.dispose();
});

test('confirmAlert: 사용자 없음/폐기된 세션은 PATCH 없음', async () => {
  const noUser = newSession();
  assert.deepEqual(await noUser.session.confirmAlert(BIG_ALERT_ID), {
    started: false,
    reason: CONFIRM_REJECT.NO_USER,
  });
  assert.equal(noUser.count('confirm'), 0);

  const disposed = newSession();
  await disposed.session.setUser(UID);
  disposed.session.dispose();
  assert.deepEqual(await disposed.session.confirmAlert(BIG_ALERT_ID), {
    started: false,
    reason: CONFIRM_REJECT.DISPOSED,
  });
  assert.equal(disposed.count('confirm'), 0);
});

// ── 무효화 ───────────────────────────────────────────────────

test('사용자 변경: 이전 사용자의 늦은 점수·알림 응답은 폐기, 새 사용자 데이터만 반영', async () => {
  const slow = deferred();
  const calls = [];
  const session = createFdsSession({
    fetchSafetyScore: async userId => (calls.push(['score', userId]), scoreModel()),
    fetchFdsAlerts: userId => {
      calls.push(['alerts', userId]);
      return userId === UID
        ? slow.promise
        : Promise.resolve(
            alertsModel({
              total: 1,
              unread: 1,
              returned: 1,
              alerts: [alertModel({ alertId: '5' })],
            })
          );
    },
    fetchFdsLogs: async () => [],
    confirmFdsAlert: async () => ({}),
  });

  const first = session.setUser(UID);
  await session.setUser(OTHER_UID);
  slow.resolve(alertsModel());
  await first;

  const snap = session.getSnapshot();
  assert.equal(snap.userId, OTHER_UID);
  assert.deepEqual(
    snap.alerts.items.map(item => item.alertId),
    ['5']
  );
  session.dispose();
});

test('사용자 변경: 진행 중이던 확인(PATCH) 응답은 폐기되어 새 사용자의 목록을 바꾸지 않음', async () => {
  const gate = deferred();
  const { session } = newSession({ confirm: () => gate.promise });
  await session.setUser(UID);
  const pending = session.confirmAlert(BIG_ALERT_ID);

  await session.setUser(OTHER_UID);
  gate.resolve({ alertId: BIG_ALERT_ID, isConfirmed: true, confirmedAt: '2026-10-11 05:00:00' });
  assert.deepEqual(await pending, { started: true, discarded: true });

  const item = session.getSnapshot().alerts.items.find(entry => entry.alertId === BIG_ALERT_ID);
  assert.equal(item?.isConfirmed ?? false, false);
  assert.equal(session.getSnapshot().alerts.unread, 2);
  session.dispose();
});

test('필터를 연속 전환하면 마지막 필터의 응답만 반영(늦게 온 이전 응답 폐기)', async () => {
  const first = deferred();
  const second = deferred();
  const queue = [first, second];
  const { session } = newSession({
    alerts: () => queue.shift().promise,
  });
  const loading = session.setUser(UID); // all → first
  const switching = session.setUnreadOnly(true); // unread → second

  second.resolve(
    alertsModel({ total: 1, unread: 1, returned: 1, alerts: [alertModel({ alertId: '5' })] })
  );
  await switching;
  first.resolve(alertsModel());
  await loading;

  const { alerts } = session.getSnapshot();
  assert.deepEqual(
    alerts.items.map(item => item.alertId),
    ['5']
  );
  assert.equal(alerts.scope, 'unread');
  session.dispose();
});

test('dispose 후에는 어떤 호출도 요청을 만들지 않고 늦은 응답은 상태를 바꾸지 않음', async () => {
  const gate = deferred();
  const { session, calls } = newSession({ alerts: () => gate.promise });
  const loading = session.setUser(UID);
  const before = session.getSnapshot();
  const callsBefore = calls.length;

  session.dispose();
  gate.resolve(alertsModel());
  await loading;
  assert.equal(session.getSnapshot(), before);

  await session.setUser(OTHER_UID);
  await session.selectTab(FDS_TAB.LOGS);
  await session.setUnreadOnly(true);
  await session.retry('score');
  await session.refreshAlerts();
  await session.confirmAlert(BIG_ALERT_ID);
  assert.equal(calls.length, callsBefore);
});

test('새로고침(refreshAlerts)은 점수·알림 GET만 다시 요청', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);
  await session.refreshAlerts();
  assert.equal(count('score'), 2);
  assert.equal(count('alerts'), 2);
  assert.equal(count('logs'), 0);
  assert.equal(count('confirm'), 0);
  session.dispose();
});
