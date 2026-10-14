// 학교 일정 자동 동기화 화면 로직(API-18 학교 목록, API-19 동기화, API-20 일정 목록) 단위 테스트.
// 서버 호출 없음(함수 주입), 순수 로직만 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/calendarSyncLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const logic = await import('../../src/features/work/spendingScreenLogic.js');
const {
  SPENDING_STATUS: S,
  SYNC_CONFIRM_MESSAGE,
  SYNC_REJECT,
  SYNC_STATUS,
  buildScheduleItemViewModel,
  buildUniversityViewModel,
  createSpendingSession,
  describeSyncResult,
} = logic;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';

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

const universityModel = (overrides = {}) => ({
  universityId: 1,
  name: '한신대학교',
  shortName: '한신대',
  region: '경기',
  ...overrides,
});

const calendarScheduleModel = (overrides = {}) => ({
  eventType: 'SEMESTER_START',
  eventName: '개강',
  startDate: '2026-03-02 00:00:00',
  endDate: '2026-03-02 00:00:00',
  expectedExtraSpend: '0.0000',
  isAuto: true,
  ...overrides,
});

const syncResultModel = (overrides = {}) => ({
  universityName: '한신대학교',
  year: 2026,
  semester: 1,
  syncedCount: 3,
  schedules: [],
  ...overrides,
});

const newSession = (setup = {}) => {
  const calls = [];
  const handlers = {
    buffer: async () => '0',
    schedules: async () => [calendarScheduleModel()],
    universities: async () => [
      universityModel(),
      universityModel({ universityId: 2, name: '서울대학교' }),
    ],
    sync: async () => syncResultModel(),
    ...setup,
  };
  const session = createSpendingSession({
    fetchEventBuffer: (...a) => (calls.push(['buffer', ...a]), handlers.buffer(...a)),
    fetchSpendingProfile: async () => ({}),
    createAcademicSchedule: async () => ({}),
    fetchSemesterReport: async () => ({}),
    fetchCalendarSchedules: (...a) => (calls.push(['schedules', ...a]), handlers.schedules(...a)),
    fetchUniversities: (...a) => (calls.push(['universities', ...a]), handlers.universities(...a)),
    syncCalendar: (...a) => (calls.push(['sync', ...a]), handlers.sync(...a)),
    now: () => new Date('2026-10-13T00:00:00'),
  });
  const count = name => calls.filter(call => call[0] === name).length;
  return { session, calls, handlers, count };
};

// 사용자 설정 + 패널 열기 + 학교 선택까지 마친 세션
const readySession = async (setup = {}) => {
  const ctx = newSession(setup);
  await ctx.session.setUser(UID);
  await ctx.session.toggleCalendarPanel();
  ctx.session.selectUniversity(1);
  return ctx;
};

// ── 뷰모델 ───────────────────────────────────────────────────

test('일정 뷰모델: API-20 is_auto는 자동/직접 배지, 공백 구분 시각에서 날짜만 표시', () => {
  const auto = buildScheduleItemViewModel(calendarScheduleModel(), 0);
  assert.equal(auto.sourceLabel, '자동');
  assert.equal(auto.periodText, '2026-03-02');

  const manual = buildScheduleItemViewModel(calendarScheduleModel({ isAuto: false }), 0);
  assert.equal(manual.sourceLabel, '직접');

  const unknown = buildScheduleItemViewModel(calendarScheduleModel({ isAuto: undefined }), 0);
  assert.equal('sourceLabel' in unknown, false, '출처를 모르면 추측하지 않음');
});

test('학교 뷰모델: 서버 이름 그대로, 약칭·지역은 보조 정보(없으면 null)', () => {
  assert.deepEqual(buildUniversityViewModel(universityModel()), {
    universityId: 1,
    name: '한신대학교',
    detail: '한신대 · 경기',
  });
  assert.equal(
    buildUniversityViewModel(universityModel({ shortName: '', region: null })).detail,
    null
  );
});

test('동기화 결과 문구: 성공/미확인/404/기타 거부, 서버 원문·ID 노출 없음', () => {
  assert.equal(
    describeSyncResult({
      status: SYNC_STATUS.SUCCESS,
      syncedCount: 3,
      universityName: '한신대학교',
    }),
    '한신대학교 일정 3건을 불러왔어요.'
  );
  assert.equal(
    describeSyncResult({
      status: SYNC_STATUS.SUCCESS,
      syncedCount: 0,
      universityName: '한신대학교',
    }),
    '불러온 일정이 없어요.'
  );
  assert.match(describeSyncResult({ status: SYNC_STATUS.UNCONFIRMED }), /확인하지 못했어요/);
  assert.match(
    describeSyncResult({ status: SYNC_STATUS.REJECTED, errorType: 'NOT_FOUND' }),
    /아직 준비되지 않았어요/
  );
  assert.match(
    describeSyncResult({ status: SYNC_STATUS.REJECTED, errorType: 'FORBIDDEN' }),
    /불러오지 못했어요/
  );
  assert.equal(describeSyncResult(null), null);
  assert.equal(describeSyncResult({ status: SYNC_STATUS.IDLE }), null);
  assert.match(SYNC_CONFIRM_MESSAGE, /직접 등록한 일정은 그대로/);
});

// ── 요청 시점 ────────────────────────────────────────────────

test('진입 시: 일정 목록(API-20)·예비비 GET만 나가고 학교 목록·동기화(POST)는 나가지 않음', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);

  assert.equal(count('schedules'), 1);
  assert.equal(count('buffer'), 1);
  assert.equal(count('universities'), 0);
  assert.equal(count('sync'), 0);
  assert.equal(session.getSnapshot().calendar.open, false);
  session.dispose();
});

test('목록 요청은 fetchCalendarSchedules(API-20)에 year/limit/offset으로 전달', async () => {
  const { session, calls } = newSession();
  await session.setUser(UID);
  const [, userId, query] = calls.find(call => call[0] === 'schedules');
  assert.equal(userId, UID);
  assert.deepEqual(query, { year: 2026, limit: 50, offset: 0 });
  assert.equal(session.getSnapshot().schedules.items[0].sourceLabel, '자동');
  session.dispose();
});

test('패널을 처음 열 때만 학교 목록 GET 1회, 닫았다 다시 열어도 재요청 없음', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);

  await session.toggleCalendarPanel();
  assert.equal(count('universities'), 1);
  assert.equal(session.getSnapshot().calendar.open, true);
  assert.equal(session.getSnapshot().calendar.universities.status, S.READY);
  assert.deepEqual(
    session.getSnapshot().calendar.universities.viewModel.map(item => item.name),
    ['한신대학교', '서울대학교']
  );

  await session.toggleCalendarPanel(); // 닫기
  await session.toggleCalendarPanel(); // 다시 열기
  assert.equal(count('universities'), 1);
  assert.equal(count('sync'), 0, '패널 조작으로 POST가 나가지 않음');
  session.dispose();
});

test('학교 목록 오류: errorType 표시, 자동 재시도 없음, retry("universities")만 재요청', async () => {
  let fail = true;
  const { session, count } = newSession({
    universities: async () => {
      if (fail) throw createApiError({ kind: API_ERROR_KIND.NETWORK });
      return [universityModel()];
    },
  });
  await session.setUser(UID);
  await session.toggleCalendarPanel();

  const failed = session.getSnapshot().calendar.universities;
  assert.equal(failed.status, S.ERROR);
  assert.equal(failed.errorType, 'NETWORK');
  assert.equal(failed.retryable, true);

  await session.toggleCalendarPanel();
  await session.toggleCalendarPanel();
  assert.equal(count('universities'), 1, '재진입으로 재요청하지 않음');

  fail = false;
  await session.retry('universities');
  assert.equal(count('universities'), 2);
  assert.equal(session.getSnapshot().calendar.universities.status, S.READY);
  session.dispose();
});

test('빈 학교 목록은 오류가 아닌 READY(빈 데이터)이며 동기화 불가', async () => {
  const { session } = newSession({ universities: async () => [] });
  await session.setUser(UID);
  await session.toggleCalendarPanel();
  const { calendar } = session.getSnapshot();
  assert.equal(calendar.universities.status, S.READY);
  assert.deepEqual([...calendar.universities.viewModel], []);
  assert.equal(calendar.canSync, false);
  session.dispose();
});

// ── 선택/검증 ────────────────────────────────────────────────

test('학교·학년도·학기 선택은 요청을 만들지 않고, 목록에 없는 학교/범위 밖 값은 무시', async () => {
  const { session, count } = await readySession();

  assert.equal(session.getSnapshot().calendar.selectedUniversityId, 1);
  assert.equal(session.selectUniversity(999), false);
  assert.equal(session.getSnapshot().calendar.selectedUniversityId, 1);

  assert.equal(session.setSyncPeriod({ year: 2025, semester: 2 }), true);
  assert.equal(session.setSyncPeriod({ year: 2019, semester: 1 }), false);
  assert.equal(session.setSyncPeriod({ year: 2025, semester: 3 }), false);
  assert.equal(session.setSyncPeriod({ year: 2025, semester: 2 }), false, '같은 값은 무시');
  assert.equal(session.getSnapshot().calendar.year, 2025);
  assert.equal(session.getSnapshot().calendar.semester, 2);

  assert.equal(count('sync'), 0);
  session.dispose();
});

test('학교 미선택이면 canSync false이고 syncSchedules는 NO_UNIVERSITY로 거부(POST 없음)', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);
  await session.toggleCalendarPanel();
  assert.equal(session.getSnapshot().calendar.canSync, false);

  const result = await session.syncSchedules();
  assert.deepEqual(result, { started: false, reason: SYNC_REJECT.NO_UNIVERSITY });
  assert.equal(count('sync'), 0);
  session.dispose();
});

test('유효하지 않은 사용자/폐기된 세션에서는 어떤 호출도 요청을 만들지 않음', async () => {
  const a = newSession();
  await a.session.setUser(null);
  await a.session.toggleCalendarPanel();
  assert.deepEqual(await a.session.syncSchedules(), {
    started: false,
    reason: SYNC_REJECT.NO_USER,
  });
  assert.deepEqual(a.calls, []);

  const b = newSession();
  b.session.dispose();
  await b.session.setUser(UID);
  await b.session.toggleCalendarPanel();
  b.session.selectUniversity(1);
  assert.deepEqual(await b.session.syncSchedules(), {
    started: false,
    reason: SYNC_REJECT.DISPOSED,
  });
  assert.deepEqual(b.calls, []);
});

// ── 동기화(API-19) ──────────────────────────────────────────

test('syncSchedules: 선택한 학교·학년도·학기와 로그인 사용자로 POST 1회, 성공 후 GET으로 목록·예비비 재조회', async () => {
  const { session, calls, count } = await readySession();
  session.setSyncPeriod({ year: 2025, semester: 2 });
  const schedulesBefore = count('schedules');
  const bufferBefore = count('buffer');

  const result = await session.syncSchedules();

  assert.equal(result.status, SYNC_STATUS.SUCCESS);
  const syncCalls = calls.filter(call => call[0] === 'sync');
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0].slice(1), [UID, { universityId: 1, year: 2025, semester: 2 }]);

  const snap = session.getSnapshot();
  assert.equal(snap.calendar.sync.status, SYNC_STATUS.SUCCESS);
  assert.equal(snap.calendar.sync.syncedCount, 3);
  assert.equal(snap.calendar.isSyncing, false);
  assert.equal(count('schedules'), schedulesBefore + 1, '목록은 서버에서 다시 읽음');
  assert.equal(count('buffer'), bufferBefore + 1, '예비비는 서버에서 다시 읽음(합산하지 않음)');
  assert.equal(snap.scheduleYear, 2025, '결과가 보이도록 목록 연도를 동기화 학년도로 맞춤');
  assert.deepEqual(
    calls
      .filter(call => call[0] === 'schedules')
      .at(-1)
      .slice(1),
    [UID, { year: 2025, limit: 50, offset: 0 }]
  );
  session.dispose();
});

test('syncSchedules: 진행 중 중복 호출은 IN_FLIGHT로 거부되어 POST는 1회뿐', async () => {
  const gate = deferred();
  const { session, count } = await readySession({ sync: () => gate.promise });

  const first = session.syncSchedules();
  assert.equal(session.getSnapshot().calendar.isSyncing, true);
  assert.equal(session.getSnapshot().calendar.canSync, false);
  assert.equal(session.getSnapshot().calendar.sync.status, SYNC_STATUS.SYNCING);

  const second = await session.syncSchedules();
  assert.deepEqual(second, { started: false, reason: SYNC_REJECT.IN_FLIGHT });
  assert.equal(session.selectUniversity(2), false, '진행 중에는 선택 변경 불가');
  assert.equal(session.setSyncPeriod({ year: 2024, semester: 1 }), false);

  gate.resolve(syncResultModel());
  await first;
  assert.equal(count('sync'), 1);
  session.dispose();
});

test('syncSchedules 오류 분류: 타임아웃·네트워크·5xx·응답오류는 UNCONFIRMED, 4xx는 REJECTED, 자동 재시도 없음', async () => {
  const cases = [
    [createApiError({ kind: API_ERROR_KIND.TIMEOUT }), SYNC_STATUS.UNCONFIRMED],
    [createApiError({ kind: API_ERROR_KIND.NETWORK }), SYNC_STATUS.UNCONFIRMED],
    [
      Object.assign(createApiError({ kind: API_ERROR_KIND.HTTP_5XX }), { status: 500 }),
      SYNC_STATUS.UNCONFIRMED,
    ],
    [Object.assign(new Error('x'), { invalidResponse: true }), SYNC_STATUS.UNCONFIRMED],
    [httpError(404), SYNC_STATUS.REJECTED],
    [httpError(403), SYNC_STATUS.REJECTED],
    [httpError(422), SYNC_STATUS.REJECTED],
  ];

  for (const [error, expected] of cases) {
    const { session, count } = await readySession({
      sync: async () => {
        throw error;
      },
    });
    const result = await session.syncSchedules();
    assert.equal(result.status, expected, error.kind ?? error.message);
    assert.equal(session.getSnapshot().calendar.sync.status, expected);
    assert.equal(count('sync'), 1, '자동 재시도 없음');
    assert.equal(session.getSnapshot().calendar.isSyncing, false);
    session.dispose();
  }
});

test('syncSchedules 404는 REJECTED + NOT_FOUND 문구, 실패 시 목록을 건드리지 않음(재조회 없음)', async () => {
  const { session, count } = await readySession({
    sync: async () => {
      throw httpError(404);
    },
  });
  const schedulesBefore = count('schedules');
  await session.syncSchedules();

  const { sync } = session.getSnapshot().calendar;
  assert.equal(sync.status, SYNC_STATUS.REJECTED);
  assert.equal(sync.errorType, 'NOT_FOUND');
  assert.match(describeSyncResult(sync), /아직 준비되지 않았어요/);
  assert.equal(count('schedules'), schedulesBefore);
  session.dispose();
});

test('CANCELED(로그아웃 등)는 오류가 아닌 중립(IDLE)', async () => {
  const { session } = await readySession({
    sync: async () => {
      throw createApiError({ kind: API_ERROR_KIND.CANCELED });
    },
  });
  const result = await session.syncSchedules();
  assert.equal(result.status, SYNC_STATUS.IDLE);
  assert.equal(session.getSnapshot().calendar.sync.status, SYNC_STATUS.IDLE);
  session.dispose();
});

test('선택을 바꾸면 이전 동기화 결과 문구를 지움(진행 중이 아닐 때)', async () => {
  const { session } = await readySession({
    sync: async () => {
      throw httpError(404);
    },
  });
  await session.syncSchedules();
  assert.equal(session.getSnapshot().calendar.sync.status, SYNC_STATUS.REJECTED);

  session.selectUniversity(2);
  assert.equal(session.getSnapshot().calendar.sync.status, SYNC_STATUS.IDLE);
  session.dispose();
});

// ── 무효화 ───────────────────────────────────────────────────

test('사용자 변경: 동기화 응답이 늦게 와도 폐기, 새 사용자 상태에 영향 없음', async () => {
  const gate = deferred();
  const { session, count } = await readySession({ sync: () => gate.promise });

  const pending = session.syncSchedules();
  await session.setUser(OTHER_UID);
  const afterChange = session.getSnapshot().calendar;
  assert.equal(afterChange.open, false);
  assert.equal(afterChange.selectedUniversityId, null);
  assert.equal(afterChange.sync.status, SYNC_STATUS.IDLE);
  assert.equal(afterChange.isSyncing, false);

  const schedulesBefore = count('schedules');
  gate.resolve(syncResultModel());
  assert.deepEqual(await pending, { started: true, discarded: true });
  assert.equal(session.getSnapshot().calendar.sync.status, SYNC_STATUS.IDLE);
  assert.equal(count('schedules'), schedulesBefore, '폐기된 응답은 재조회도 일으키지 않음');
  session.dispose();
});

test('dispose: 진행 중이던 동기화 응답과 학교 목록 응답은 상태를 바꾸지 않음', async () => {
  const syncGate = deferred();
  const { session, count } = await readySession({ sync: () => syncGate.promise });
  const pending = session.syncSchedules();
  const before = session.getSnapshot();

  session.dispose();
  syncGate.resolve(syncResultModel());
  assert.deepEqual(await pending, { started: true, discarded: true });
  assert.equal(session.getSnapshot(), before, '스냅샷 변화 없음');
  assert.equal(count('sync'), 1);

  const universitiesGate = deferred();
  const other = newSession({ universities: () => universitiesGate.promise });
  await other.session.setUser(UID);
  const opening = other.session.toggleCalendarPanel();
  other.session.dispose();
  universitiesGate.resolve([universityModel()]);
  await opening;
  assert.equal(other.session.getSnapshot().calendar.universities.status, S.LOADING);
});

test('학교 목록 응답이 사용자 변경 뒤 늦게 도착해도 폐기', async () => {
  const gate = deferred();
  const { session } = newSession({ universities: () => gate.promise });
  await session.setUser(UID);
  const opening = session.toggleCalendarPanel();

  await session.setUser(OTHER_UID);
  gate.resolve([universityModel()]);
  await opening;

  const { calendar } = session.getSnapshot();
  assert.equal(calendar.universities.status, S.IDLE);
  assert.equal(calendar.selectedUniversityId, null);
  session.dispose();
});

test('같은 사용자로 setUser를 다시 호출해도 학교 목록·동기화 요청이 늘지 않음(StrictMode 대비)', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);
  await session.toggleCalendarPanel();
  await session.setUser(UID);
  assert.equal(count('universities'), 1);
  assert.equal(count('sync'), 0);
  session.dispose();
});
