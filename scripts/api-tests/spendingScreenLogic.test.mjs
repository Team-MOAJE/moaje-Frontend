// 학기 소비 분석 화면 로직(API-42~46) 단위 테스트. 서버 호출 없음(함수 주입), 순수 로직만 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/spendingScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const { EVENT_TYPE, SPENDING_ERROR_TYPE } = await import('../../src/features/work/spendingApi.js');
const logic = await import('../../src/features/work/spendingScreenLogic.js');
const { AMOUNT_INPUT_ERROR } = await import('../../src/features/work/simulatorScreenLogic.js');
const {
  REPORT_LABELS,
  SCHEDULE_FIELD_ERROR,
  SCHEDULE_PAGE_SIZE,
  SPENDING_STATUS,
  SPENDING_TAB,
  SUBMIT_REJECT,
  SUBMIT_STATUS,
  buildEventBufferViewModel,
  buildProfileViewModel,
  buildReportViewModel,
  buildScheduleItemViewModel,
  canRetrySpendingError,
  createEmptyScheduleForm,
  createSpendingSession,
  describeEventType,
  describeSpendingError,
  describeSubmitResult,
  formatDateInput,
  formatServerDateTime,
  getInitialYear,
  isoDateOnly,
  trimDecimalString,
  validateScheduleForm,
} = logic;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';
const S = SPENDING_STATUS;

// ── 도구 ─────────────────────────────────────────────────────

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise(resolve => setImmediate(resolve));

const apiError = kind => createApiError({ kind, message: 'x' });
const httpError = status =>
  Object.assign(createApiError({ kind: API_ERROR_KIND.HTTP_4XX, message: 'x' }), { status });

const scheduleModel = (overrides = {}) => ({
  eventType: 'MT',
  eventName: '학과 MT',
  startDate: '2026-10-19T00:00:00',
  endDate: '2026-10-23T00:00:00',
  expectedExtraSpend: '50000.0000',
  ...overrides,
});

const profileModel = (overrides = {}) => ({
  avgDailyAmount: '10000.0000',
  peakSpendHour: 12,
  topCategory: '식비',
  riskScoreBaseline: '0.10',
  lastAnalyzedAt: '2026-10-11T03:00:00',
  ...overrides,
});

const reportModel = (overrides = {}) => ({
  year: 2026,
  semester: 2,
  periodLabel: '2026년 2학기',
  periodStart: '2026-09-01',
  periodEnd: '2026-12-20',
  spending: {
    totalTxCount: 12,
    avgDailyLimit: '10000',
    peakLimitDate: '2026-09-15',
    peakLimitAmount: '20000.0000',
    lowestLimitDate: '2026-09-01',
    lowestLimitAmount: '5000.0000',
    peakSpendHour: 12,
    topCategory: '식비',
    totalLogDays: 10,
    dailyLimitComplianceRate: '0.8',
    dailyLimitCv: '0.512',
  },
  fds: {
    totalDetected: 2,
    highCount: 1,
    mediumCount: 1,
    safetyScore: 29,
    safetyGrade: 'B',
    topReason: 'AMOUNT_SPIKE',
  },
  events: [
    {
      eventType: 'MIDTERM',
      eventName: '중간고사',
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      periodDays: 5,
      avgDailyLimit: '12000',
      totalLimit: '60000',
      vsNormalRatio: '1.20',
    },
  ],
  scoreBreakdown: {
    safetyScore: 29,
    dailyLimitScore: 22,
    eventScore: 20,
    regularityScore: 7,
    total: 78,
  },
  overallGrade: 'B',
  overallScore: 78,
  summaryMessage: '✅ 안정적인 소비 습관을 유지했어요.',
  badges: ['🛡️ 완벽 안전'],
  ...overrides,
});

// 호출을 기록하는 API 모의. 각 함수의 응답은 handlers로 교체한다.
const createApis = () => {
  const calls = [];
  const handlers = {
    buffer: async () => '50000.0000',
    profile: async () => profileModel(),
    schedules: async () => [scheduleModel()],
    report: async () => reportModel(),
    create: async () => scheduleModel(),
    universities: async () => [],
    sync: async () => ({}),
  };
  const apis = {
    fetchEventBuffer: (...args) => (calls.push(['buffer', ...args]), handlers.buffer(...args)),
    fetchSpendingProfile: (...args) => (
      calls.push(['profile', ...args]),
      handlers.profile(...args)
    ),
    // 일정 목록은 API-20(fetchCalendarSchedules)으로 읽는다(호출 기록 이름 'schedules'는 그대로).
    fetchCalendarSchedules: (...args) => (
      calls.push(['schedules', ...args]),
      handlers.schedules(...args)
    ),
    fetchUniversities: (...args) => (
      calls.push(['universities', ...args]),
      handlers.universities(...args)
    ),
    syncCalendar: (...args) => (calls.push(['sync', ...args]), handlers.sync(...args)),
    fetchSemesterReport: (...args) => (calls.push(['report', ...args]), handlers.report(...args)),
    createAcademicSchedule: (...args) => (
      calls.push(['create', ...args]),
      handlers.create(...args)
    ),
  };
  const count = name => calls.filter(call => call[0] === name).length;
  return { apis, handlers, calls, count };
};

const newSession = (setup = {}) => {
  const harness = createApis();
  Object.assign(harness.handlers, setup);
  const session = createSpendingSession({
    ...harness.apis,
    now: () => new Date('2026-10-13T00:00:00'),
  });
  return { ...harness, session };
};

const validFormInputs = session => {
  session.setFormField('eventType', EVENT_TYPE.MT);
  session.setFormField('eventName', '학과 MT');
  session.setFormField('startDate', '20261019');
  session.setFormField('endDate', '20261023');
  session.setFormField('expectedExtraSpend', '50000');
};

// ── 순수 변환 ────────────────────────────────────────────────

test('날짜·시각 표시: 시간대 변환 없이 문자열에서만 읽음', () => {
  assert.equal(isoDateOnly('2026-10-19T00:00:00'), '2026-10-19');
  assert.equal(isoDateOnly('2026-10-19'), '2026-10-19');
  assert.equal(isoDateOnly('이상한 값'), '이상한 값');
  assert.equal(formatServerDateTime('2026-10-11T03:00:00'), '2026-10-11 03:00');
  assert.equal(formatServerDateTime('2026-10-11T03:00:00.123456'), '2026-10-11 03:00');
  assert.equal(formatServerDateTime('모름'), '모름');
});

test('trimDecimalString: 뒤쪽 0만 제거, 반올림 없음, 형식 위반은 invalidResponse', () => {
  assert.equal(trimDecimalString('0.10'), '0.1');
  assert.equal(trimDecimalString('1.00'), '1');
  assert.equal(trimDecimalString('0.512'), '0.512');
  assert.equal(trimDecimalString('-0.00'), '0');
  assert.throws(
    () => trimDecimalString('1e3'),
    error => error.invalidResponse === true
  );
  assert.throws(
    () => trimDecimalString(1),
    error => error.invalidResponse === true
  );
});

test('formatDateInput: 숫자만 남겨 YYYY-MM-DD로 하이픈 삽입, 8자리 제한', () => {
  assert.equal(formatDateInput('2026'), '2026');
  assert.equal(formatDateInput('202610'), '2026-10');
  assert.equal(formatDateInput('20261019'), '2026-10-19');
  assert.equal(formatDateInput('2026-10-19-99'), '2026-10-19');
  assert.equal(formatDateInput('abc2026'), '2026');
});

test('getInitialYear: 기기 연도, 서버 허용 범위(2020~2030)로 보정', () => {
  assert.equal(getInitialYear(new Date('2026-10-13T00:00:00')), 2026);
  assert.equal(getInitialYear(new Date('2019-01-01T00:00:00')), 2020);
  assert.equal(getInitialYear(new Date('2040-01-01T00:00:00')), 2030);
});

test('일정 유형 라벨: 서버 enum 10개 전부 한글 라벨, 알 수 없는 값은 원문', () => {
  for (const value of Object.values(EVENT_TYPE)) {
    assert.notEqual(describeEventType(value), value === 'MT' ? '' : value.toString().toLowerCase());
  }
  assert.equal(describeEventType(EVENT_TYPE.MIDTERM), '중간고사');
  assert.equal(describeEventType('SOMETHING_NEW'), 'SOMETHING_NEW');
  assert.equal(logic.EVENT_TYPE_OPTIONS.length, 10);
});

test('뷰모델 API-42/43: 금액은 문자열 포맷(소수 뒤 0 제거), 0은 빈 상태 표시용 플래그', () => {
  assert.deepEqual(buildEventBufferViewModel('50000.0000'), {
    amountText: '50,000원',
    isEmpty: false,
  });
  assert.deepEqual(buildEventBufferViewModel('0'), { amountText: '0원', isEmpty: true });
  assert.deepEqual(buildEventBufferViewModel('0.0000'), { amountText: '0원', isEmpty: true });

  assert.deepEqual(buildProfileViewModel(profileModel()), {
    avgDailyAmountText: '10,000원',
    peakHourText: '12시',
    topCategoryText: '식비',
    riskScoreText: '0.1',
    lastAnalyzedText: '2026-10-11 03:00',
  });
  assert.equal(buildProfileViewModel(profileModel({ topCategory: null })).topCategoryText, '-');
  assert.throws(
    () => buildProfileViewModel(null),
    error => error.invalidResponse === true
  );
});

test('뷰모델 API-45: 키는 id가 아닌 내용+위치, 같은 일정 두 개도 키 충돌 없음', () => {
  const a = buildScheduleItemViewModel(scheduleModel(), 0);
  const b = buildScheduleItemViewModel(scheduleModel(), 1);
  assert.notEqual(a.key, b.key);
  assert.deepEqual(
    { ...a, key: undefined },
    {
      key: undefined,
      typeLabel: 'MT',
      name: '학과 MT',
      periodText: '2026-10-19 ~ 2026-10-23',
      extraSpendText: '50,000원',
    }
  );
  assert.equal(
    buildScheduleItemViewModel(scheduleModel({ endDate: '2026-10-19T00:00:00' }), 0).periodText,
    '2026-10-19'
  );
});

test('뷰모델 API-46: 점수·등급은 서버 값 그대로, 만점은 고정 라벨, 한도 값은 소비 금액 표현 없음', () => {
  const vm = buildReportViewModel(reportModel());

  assert.equal(vm.grade, 'B');
  assert.equal(vm.gradeText, 'B');
  assert.equal(vm.scoreText, '78점');
  assert.deepEqual(
    vm.breakdown.map(item => item.scoreText),
    ['29 / 40', '22 / 30', '20 / 20', '7 / 10']
  );
  assert.equal(vm.summaryMessage, '✅ 안정적인 소비 습관을 유지했어요.', '서버 문구 그대로');
  assert.deepEqual(vm.badges, ['🛡️ 완벽 안전']);
  assert.equal(vm.limitRows.find(row => row.key === 'complianceRate').value, '80%');
  assert.equal(vm.limitRows.find(row => row.key === 'cv').value, '0.512');
  assert.equal(vm.limitRows.find(row => row.key === 'peakLimit').value, '2026-09-15 · 20,000원');
  assert.deepEqual(vm.events[0], {
    key: vm.events[0].key,
    typeLabel: '중간고사',
    name: '중간고사',
    periodText: '2026-10-19 ~ 2026-10-23 (5일)',
    avgLimitText: '12,000원',
    totalLimitText: '60,000원',
    ratioText: '1.2배',
  });
});

test('뷰모델 API-46: "N/A"는 미평가, cv null은 계산 불가, 빈 events/badges 정상', () => {
  const vm = buildReportViewModel(
    reportModel({
      overallGrade: 'N/A',
      overallScore: 0,
      events: [],
      badges: [],
      spending: { ...reportModel().spending, dailyLimitCv: null },
    })
  );
  assert.equal(vm.isNotEvaluated, true);
  assert.equal(vm.gradeText, '미평가');
  assert.equal(vm.grade, 'N/A');
  assert.equal(vm.limitRows.find(row => row.key === 'cv').value, '계산 불가');
  assert.deepEqual(vm.events, []);
  assert.deepEqual(vm.badges, []);
});

test('리포트 라벨·고정 안내: 실제 소비 금액으로 오해할 표현이 없고 Daily Limit 기준을 밝힘', () => {
  const forbidden = ['지출', '소비 금액', '소비금액', '썼', '사용한 금액', '쓴 돈'];
  const texts = [
    ...Object.values(REPORT_LABELS),
    logic.REPORT_NOTICE,
    logic.REPORT_EVENT_NOTICE,
    ...buildReportViewModel(reportModel()).limitRows.map(row => row.label),
  ];
  for (const text of texts) {
    for (const word of forbidden) assert.equal(text.includes(word), false, `${text} ⊃ ${word}`);
  }
  assert.match(logic.REPORT_NOTICE, /Daily Limit/);
  assert.match(logic.REPORT_NOTICE, /실제 결제·거래 금액이 아니에요/);
});

// ── 폼 검증 ──────────────────────────────────────────────────

const formWith = (overrides = {}) => ({
  ...createEmptyScheduleForm(),
  eventName: '학과 MT',
  startDate: '2026-10-19',
  endDate: '2026-10-23',
  ...overrides,
});

test('폼 검증: 정상 입력은 trim된 camelCase 입력, 금액 비어 있으면 키 없음', () => {
  const result = validateScheduleForm(
    formWith({ eventName: '  학과 MT ', expectedExtraSpend: '1,000' })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.input, {
    eventType: EVENT_TYPE.EXAM,
    eventName: '학과 MT',
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    expectedExtraSpend: '1000',
  });
  assert.equal('expectedExtraSpend' in validateScheduleForm(formWith()).input, false);
  assert.equal(
    validateScheduleForm(formWith({ expectedExtraSpend: '0' })).input.expectedExtraSpend,
    '0'
  );
});

test('폼 검증: 이름 경계(100자), 실존하지 않는 날짜, 종료일 < 시작일, 금액 형식', () => {
  assert.equal(validateScheduleForm(formWith({ eventName: 'a'.repeat(100) })).ok, true);
  const cases = [
    [{ eventName: ' ' }, 'eventName', SCHEDULE_FIELD_ERROR.NAME_EMPTY],
    [{ eventName: 'a'.repeat(101) }, 'eventName', SCHEDULE_FIELD_ERROR.NAME_TOO_LONG],
    [{ startDate: '' }, 'startDate', SCHEDULE_FIELD_ERROR.DATE_EMPTY],
    [{ startDate: '2026-02-30' }, 'startDate', SCHEDULE_FIELD_ERROR.DATE_INVALID],
    [{ endDate: '2026-10' }, 'endDate', SCHEDULE_FIELD_ERROR.DATE_INVALID],
    [{ endDate: '2026-10-18' }, 'endDate', SCHEDULE_FIELD_ERROR.DATE_BEFORE_START],
    [{ eventType: 'NOPE' }, 'eventType', SCHEDULE_FIELD_ERROR.EVENT_TYPE],
    [{ expectedExtraSpend: '-5' }, 'expectedExtraSpend', AMOUNT_INPUT_ERROR.NOT_DIGITS],
  ];
  for (const [override, field, code] of cases) {
    const result = validateScheduleForm(formWith(override));
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.equal(result.fieldErrors[field], code);
  }
  assert.equal(
    validateScheduleForm(formWith({ endDate: '2026-10-19' })).ok,
    true,
    '같은 날은 허용'
  );
});

// ── 오류 문구 ────────────────────────────────────────────────

test('오류 문구·재시도 정책: 네트워크/타임아웃/5xx/응답 오류만 재시도, 서버 원문 미노출', () => {
  for (const type of [
    SPENDING_ERROR_TYPE.NETWORK,
    SPENDING_ERROR_TYPE.TIMEOUT,
    SPENDING_ERROR_TYPE.SERVER,
    SPENDING_ERROR_TYPE.INVALID_RESPONSE,
  ]) {
    assert.equal(canRetrySpendingError(type), true, type);
  }
  for (const type of [
    SPENDING_ERROR_TYPE.UNAUTHORIZED,
    SPENDING_ERROR_TYPE.FORBIDDEN,
    SPENDING_ERROR_TYPE.NOT_FOUND,
    SPENDING_ERROR_TYPE.VALIDATION,
    SPENDING_ERROR_TYPE.INVALID_REQUEST,
  ]) {
    assert.equal(canRetrySpendingError(type), false, type);
  }
  assert.match(describeSpendingError(SPENDING_ERROR_TYPE.TIMEOUT), /지연/);
  assert.equal(
    describeSpendingError('???'),
    '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
  );
});

// ── 세션: 로딩·빈 데이터·오류 ────────────────────────────────

test('세션: 사용자 설정 전에는 요청 없음, 유효하지 않은 사용자도 요청 없음', async () => {
  const { session, calls } = newSession();
  assert.equal(session.getSnapshot().schedules.status, S.IDLE);
  await session.setUser(null);
  await session.setUser(123);
  await session.setUser('abc');
  assert.equal(calls.length, 0);
});

test('세션: 사용자 설정 시 첫 구간(일정)의 GET 2개(예비비·목록 첫 페이지)만 요청, POST 없음', async () => {
  const { session, calls, count } = newSession();

  await session.setUser(UID);

  assert.equal(count('buffer'), 1);
  assert.equal(count('schedules'), 1);
  assert.equal(count('profile') + count('report') + count('create'), 0);
  assert.deepEqual(
    calls.find(call => call[0] === 'schedules'),
    ['schedules', UID, { year: 2026, limit: SCHEDULE_PAGE_SIZE, offset: 0 }]
  );
  const snap = session.getSnapshot();
  assert.equal(snap.buffer.status, S.READY);
  assert.equal(snap.buffer.viewModel.amountText, '50,000원');
  assert.equal(snap.schedules.status, S.READY);
  assert.equal(snap.schedules.items.length, 1);
  assert.equal(snap.schedules.hasMore, false);
});

test('세션: 빈 일정 배열·예비비 0은 오류가 아닌 READY(빈 데이터)', async () => {
  const { session } = newSession({ schedules: async () => [], buffer: async () => '0' });
  await session.setUser(UID);
  const snap = session.getSnapshot();
  assert.equal(snap.schedules.status, S.READY);
  assert.deepEqual([...snap.schedules.items], []);
  assert.equal(snap.buffer.viewModel.isEmpty, true);
});

test('세션: 구간 전환은 처음 한 번만 해당 구간을 조회(재진입 시 재요청 없음)', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);

  await session.selectTab(SPENDING_TAB.PROFILE);
  await session.selectTab(SPENDING_TAB.SCHEDULES);
  await session.selectTab(SPENDING_TAB.PROFILE);
  await session.selectTab(SPENDING_TAB.REPORT);
  await session.selectTab(SPENDING_TAB.PROFILE);
  await session.selectTab(SPENDING_TAB.REPORT);

  assert.equal(count('profile'), 1);
  assert.equal(count('report'), 1);
  assert.equal(count('schedules'), 1);
  assert.equal(count('buffer'), 1);
});

test('세션: 오류는 errorType+retryable로 표시, 구간 재진입으로 자동 재시도하지 않고 retry()만 재요청', async () => {
  let attempt = 0;
  const { session, count } = newSession({
    profile: async () => {
      attempt += 1;
      if (attempt === 1) throw apiError(API_ERROR_KIND.TIMEOUT);
      return profileModel();
    },
  });
  await session.setUser(UID);
  await session.selectTab(SPENDING_TAB.PROFILE);

  let snap = session.getSnapshot();
  assert.equal(snap.profile.status, S.ERROR);
  assert.equal(snap.profile.errorType, SPENDING_ERROR_TYPE.TIMEOUT);
  assert.equal(snap.profile.retryable, true);
  assert.equal(snap.profile.viewModel, null, '실패 시 가짜 값을 만들지 않음');

  await session.selectTab(SPENDING_TAB.SCHEDULES);
  await session.selectTab(SPENDING_TAB.PROFILE);
  assert.equal(count('profile'), 1, '재진입 자동 재시도 없음');

  await session.retry('profile');
  snap = session.getSnapshot();
  assert.equal(count('profile'), 2);
  assert.equal(snap.profile.status, S.READY);
});

test('세션: 403은 재시도 불가로 표시, 응답 형식 오류는 INVALID_RESPONSE', async () => {
  const { session } = newSession({
    profile: async () => {
      throw httpError(403);
    },
    report: async () => reportModel({ scoreBreakdown: null }),
  });
  await session.setUser(UID);
  await session.selectTab(SPENDING_TAB.PROFILE);
  assert.equal(session.getSnapshot().profile.errorType, SPENDING_ERROR_TYPE.FORBIDDEN);
  assert.equal(session.getSnapshot().profile.retryable, false);

  await session.selectTab(SPENDING_TAB.REPORT);
  const { report } = session.getSnapshot();
  assert.equal(report.status, S.ERROR);
  assert.equal(report.errorType, SPENDING_ERROR_TYPE.INVALID_RESPONSE);
});

test('세션: CANCELED(로그아웃 등)는 오류 화면이 아닌 중립(IDLE)', async () => {
  const { session } = newSession({
    profile: async () => {
      throw apiError(API_ERROR_KIND.CANCELED);
    },
  });
  await session.setUser(UID);
  await session.selectTab(SPENDING_TAB.PROFILE);
  assert.equal(session.getSnapshot().profile.status, S.IDLE);
});

// ── 세션: 요청 무효화 ────────────────────────────────────────

test('무효화: 사용자 변경 뒤 이전 사용자의 늦은 응답은 폐기, 새 사용자 데이터만 반영', async () => {
  const slow = deferred();
  let first = true;
  const { session } = newSession({
    schedules: async userId => {
      if (first) {
        first = false;
        return slow.promise;
      }
      return [scheduleModel({ eventName: '새 사용자 일정' })];
    },
  });
  const p1 = session.setUser(UID);
  await tick();
  const p2 = session.setUser(OTHER_UID);
  await p2;

  slow.resolve([scheduleModel({ eventName: '이전 사용자 일정' })]);
  await p1;
  await tick();

  const snap = session.getSnapshot();
  assert.equal(snap.userId, OTHER_UID);
  assert.deepEqual(
    snap.schedules.items.map(item => item.name),
    ['새 사용자 일정']
  );
});

test('무효화: 연도를 연속 변경하면 마지막 연도 응답만 반영(늦게 온 이전 연도 응답 폐기)', async () => {
  const gates = {};
  const { session, calls } = newSession({
    schedules: (userId, query) => {
      gates[query.year] = deferred();
      return gates[query.year].promise;
    },
  });
  session.setUser(UID); // 2026 요청이 대기 상태(setUser는 응답 완료까지 resolve되지 않으므로 기다리지 않는다)
  await tick();
  session.setScheduleYear(2025);
  session.setScheduleYear(2024);
  await tick();

  gates[2024].resolve([scheduleModel({ eventName: '2024' })]);
  await tick();
  gates[2025].resolve([scheduleModel({ eventName: '2025' })]);
  gates[2026].resolve([scheduleModel({ eventName: '2026' })]);
  await tick();
  await tick();

  const snap = session.getSnapshot();
  assert.equal(snap.scheduleYear, 2024);
  assert.deepEqual(
    snap.schedules.items.map(item => item.name),
    ['2024']
  );
  assert.equal(calls.filter(call => call[0] === 'schedules').length, 3);
});

test('무효화: 같은 연도·학기 재선택은 요청 없음, 범위 밖 값은 무시', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);
  await session.setScheduleYear(2026);
  await session.setScheduleYear(2019);
  await session.setScheduleYear(2031);
  await session.setScheduleYear(2026.5);
  assert.equal(count('schedules'), 1);

  await session.selectTab(SPENDING_TAB.REPORT);
  await session.setReportPeriod({ year: 2026, semester: 1 }); // 기본 선택과 같음
  await session.setReportPeriod({ year: 2026, semester: 3 });
  await session.setReportPeriod({ year: 2031, semester: 1 });
  assert.equal(count('report'), 1);
});

test('리포트: 선택한 year/semester를 그대로 전달, 선택 변경 시 이전 결과는 비우고 새로 조회', async () => {
  const { session, calls } = newSession();
  await session.setUser(UID);
  await session.selectTab(SPENDING_TAB.REPORT);
  await session.setReportPeriod({ year: 2025, semester: 2 });

  const reportCalls = calls.filter(call => call[0] === 'report');
  assert.deepEqual(reportCalls[0].slice(1), [UID, { year: 2026, semester: 1 }]);
  assert.deepEqual(reportCalls[1].slice(1), [UID, { year: 2025, semester: 2 }]);
  assert.equal(session.getSnapshot().report.status, S.READY);
});

test('무효화: dispose 뒤 도착한 응답은 상태를 바꾸지 않고 구독 해제', async () => {
  const slow = deferred();
  const { session } = newSession({ schedules: () => slow.promise });
  let notified = 0;
  session.subscribe(() => {
    notified += 1;
  });
  const pending = session.setUser(UID);
  await tick();
  const before = notified;

  session.dispose();
  slow.resolve([scheduleModel()]);
  await pending;
  await tick();

  assert.equal(notified, before);
  assert.equal(session.getSnapshot().schedules.status, S.LOADING);
  assert.equal(session.getSnapshot() !== null, true);
});

// ── 세션: 페이지네이션 ───────────────────────────────────────

test('페이지네이션: 한 페이지가 가득 차면 hasMore, 더 보기는 offset=받은 개수로 이어붙이고 마지막 페이지에서 종료', async () => {
  const page = (start, size) =>
    Array.from({ length: size }, (_, i) => scheduleModel({ eventName: `일정${start + i}` }));
  const { session, calls } = newSession({
    schedules: async (userId, query) =>
      query.offset === 0 ? page(0, SCHEDULE_PAGE_SIZE) : page(SCHEDULE_PAGE_SIZE, 3),
  });
  await session.setUser(UID);

  let snap = session.getSnapshot();
  assert.equal(snap.schedules.hasMore, true);
  assert.equal(snap.canLoadMoreSchedules, true);

  await session.loadMoreSchedules();
  snap = session.getSnapshot();
  const queries = calls.filter(call => call[0] === 'schedules').map(call => call[2]);
  assert.deepEqual(queries[1], {
    year: 2026,
    limit: SCHEDULE_PAGE_SIZE,
    offset: SCHEDULE_PAGE_SIZE,
  });
  assert.equal(snap.schedules.items.length, SCHEDULE_PAGE_SIZE + 3);
  assert.equal(snap.schedules.hasMore, false);
  assert.equal(
    new Set(snap.schedules.items.map(item => item.key)).size,
    snap.schedules.items.length
  );

  await session.loadMoreSchedules();
  assert.equal(
    calls.filter(call => call[0] === 'schedules').length,
    2,
    '끝난 목록은 더 요청하지 않음'
  );
});

test('페이지네이션: 더 보기 중복 호출은 요청 1회, 실패해도 받은 목록 유지', async () => {
  const slow = deferred();
  let fail = false;
  const { session, count } = newSession({
    schedules: (userId, query) => {
      if (query.offset === 0) {
        return Promise.resolve(Array.from({ length: SCHEDULE_PAGE_SIZE }, () => scheduleModel()));
      }
      if (fail) return Promise.reject(apiError(API_ERROR_KIND.NETWORK));
      return slow.promise;
    },
  });
  await session.setUser(UID);

  const a = session.loadMoreSchedules();
  const b = session.loadMoreSchedules();
  assert.equal(session.getSnapshot().canLoadMoreSchedules, false);
  slow.resolve([]);
  await Promise.all([a, b]);
  assert.equal(count('schedules'), 2);

  // 실패 케이스
  const second = newSession({
    schedules: (userId, query) =>
      query.offset === 0
        ? Promise.resolve(Array.from({ length: SCHEDULE_PAGE_SIZE }, () => scheduleModel()))
        : Promise.reject(apiError(API_ERROR_KIND.NETWORK)),
  });
  await second.session.setUser(UID);
  await second.session.loadMoreSchedules();
  const snap = second.session.getSnapshot();
  assert.equal(snap.schedules.items.length, SCHEDULE_PAGE_SIZE);
  assert.equal(snap.schedules.moreErrorType, SPENDING_ERROR_TYPE.NETWORK);
  assert.equal(snap.schedules.status, S.READY);
  void fail;
});

test('페이지네이션: 연도 변경 시 목록이 초기화되고 offset 0부터 다시 시작', async () => {
  const { session, calls } = newSession({
    schedules: async () => Array.from({ length: SCHEDULE_PAGE_SIZE }, () => scheduleModel()),
  });
  await session.setUser(UID);
  await session.loadMoreSchedules();
  await session.setScheduleYear(2025);

  const last = calls.filter(call => call[0] === 'schedules').at(-1)[2];
  assert.deepEqual(last, { year: 2025, limit: SCHEDULE_PAGE_SIZE, offset: 0 });
  assert.equal(session.getSnapshot().schedules.items.length, SCHEDULE_PAGE_SIZE);
});

// ── 세션: 일정 등록(API-44) ──────────────────────────────────

test('등록: 폼 입력/구독/구간·연도 전환만으로는 POST가 나가지 않음', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);
  validFormInputs(session);
  await session.selectTab(SPENDING_TAB.PROFILE);
  await session.selectTab(SPENDING_TAB.SCHEDULES);
  await session.setScheduleYear(2025);
  await tick();
  assert.equal(count('create'), 0);
});

test('등록: 검증 실패 시 요청 없음 + 필드 오류 노출, 입력 수정 시 해당 오류 제거', async () => {
  const { session, count } = newSession();
  await session.setUser(UID);

  const result = await session.submitSchedule();

  assert.deepEqual(result, { started: false, reason: SUBMIT_REJECT.INVALID_INPUT });
  assert.equal(count('create'), 0);
  const errors = session.getSnapshot().formErrors;
  assert.equal(errors.eventName, SCHEDULE_FIELD_ERROR.NAME_EMPTY);
  session.setFormField('eventName', '학과 MT');
  assert.equal('eventName' in session.getSnapshot().formErrors, false);
});

test('등록: 사용자 없음이면 요청 없음', async () => {
  const { session, count } = newSession();
  validFormInputs(session);
  const result = await session.submitSchedule();
  assert.equal(result.reason, SUBMIT_REJECT.NO_USER);
  assert.equal(count('create'), 0);
});

test('등록: 연타해도 POST 1회, 동안 canSubmit=false', async () => {
  const slow = deferred();
  const { session, count } = newSession({ create: () => slow.promise });
  await session.setUser(UID);
  validFormInputs(session);

  const first = session.submitSchedule();
  const second = await session.submitSchedule();
  const third = await session.submitSchedule();

  assert.equal(second.reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal(third.reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal(session.getSnapshot().canSubmit, false);
  assert.equal(session.getSnapshot().submit.status, SUBMIT_STATUS.SUBMITTING);
  assert.equal(count('create'), 1);

  slow.resolve(scheduleModel());
  await first;
  assert.equal(count('create'), 1);
});

test('등록: 서버로 가는 입력은 검증된 camelCase(user_id 문자열 그대로), 성공 시 폼 초기화 후 GET만 재조회', async () => {
  const { session, calls, count } = newSession();
  await session.setUser(UID);
  validFormInputs(session);
  const bufferBefore = count('buffer');
  const schedulesBefore = count('schedules');

  const result = await session.submitSchedule();

  assert.deepEqual(result, { started: true, status: SUBMIT_STATUS.SUCCESS });
  assert.deepEqual(calls.find(call => call[0] === 'create').slice(1), [
    UID,
    {
      eventType: 'MT',
      eventName: '학과 MT',
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      expectedExtraSpend: '50000',
    },
  ]);
  assert.equal(count('create'), 1, 'POST 재호출 없음');
  assert.equal(count('buffer'), bufferBefore + 1, '예비비 GET 재조회');
  assert.equal(count('schedules'), schedulesBefore + 1, '목록 GET 재조회');
  const snap = session.getSnapshot();
  assert.deepEqual(snap.form, createEmptyScheduleForm());
  assert.equal(snap.submit.status, SUBMIT_STATUS.SUCCESS);
  assert.equal(describeSubmitResult(snap.submit), '일정을 등록했어요.');
});

test('등록: 타임아웃은 "확인 불가"로 입력 유지, 자동 재요청 없음, 새로고침은 GET만', async () => {
  const { session, handlers, count } = newSession();
  handlers.create = async () => {
    throw apiError(API_ERROR_KIND.TIMEOUT);
  };
  await session.setUser(UID);
  validFormInputs(session);

  const result = await session.submitSchedule();
  await tick();
  await tick();

  assert.equal(result.status, SUBMIT_STATUS.UNCONFIRMED);
  assert.equal(count('create'), 1, '자동 재시도 없음');
  const snap = session.getSnapshot();
  assert.equal(snap.form.eventName, '학과 MT', '입력 유지');
  assert.match(describeSubmitResult(snap.submit), /등록 여부를 확인하지 못했어요/);

  const getsBefore = count('schedules');
  await session.refreshScheduleData();
  assert.equal(count('schedules'), getsBefore + 1);
  assert.equal(count('create'), 1);
});

test('등록: 네트워크 끊김·5xx·응답 해석 실패도 확인 불가, 4xx는 거부(등록되지 않음)', async () => {
  for (const [error, expected] of [
    [apiError(API_ERROR_KIND.NETWORK), SUBMIT_STATUS.UNCONFIRMED],
    [apiError(API_ERROR_KIND.HTTP_5XX), SUBMIT_STATUS.UNCONFIRMED],
    [Object.assign(new Error('x'), { invalidResponse: true }), SUBMIT_STATUS.UNCONFIRMED],
    [httpError(422), SUBMIT_STATUS.REJECTED],
    [httpError(403), SUBMIT_STATUS.REJECTED],
  ]) {
    const { session, handlers, count } = newSession();
    handlers.create = async () => {
      throw error;
    };
    await session.setUser(UID);
    validFormInputs(session);
    const result = await session.submitSchedule();
    assert.equal(result.status, expected);
    assert.equal(count('create'), 1);
    assert.equal(session.getSnapshot().form.eventName, '학과 MT');
  }
});

test('등록: 거부 문구에 서버 원문 없음, 폼 수정 시 이전 결과 문구 제거', async () => {
  const { session, handlers } = newSession();
  handlers.create = async () => {
    throw httpError(422);
  };
  await session.setUser(UID);
  validFormInputs(session);
  await session.submitSchedule();
  assert.equal(
    describeSubmitResult(session.getSnapshot().submit),
    '등록하지 못했어요. 요청 조건을 확인해 주세요.'
  );

  session.setFormField('eventName', '수정');
  assert.equal(session.getSnapshot().submit.status, SUBMIT_STATUS.IDLE);
});

test('등록: 응답 전 사용자가 바뀌면 새 사용자 화면에 결과를 반영하지 않음(재조회도 없음)', async () => {
  const slow = deferred();
  const { session, count } = newSession({ create: () => slow.promise });
  await session.setUser(UID);
  validFormInputs(session);

  const pending = session.submitSchedule();
  await session.setUser(OTHER_UID);
  const schedulesBefore = count('schedules');
  slow.resolve(scheduleModel());
  const result = await pending;

  assert.equal(result.discarded, true);
  assert.equal(session.getSnapshot().submit.status, SUBMIT_STATUS.IDLE);
  assert.equal(session.getSnapshot().userId, OTHER_UID);
  assert.equal(count('schedules'), schedulesBefore);
  assert.equal(count('create'), 1);
});

test('등록: 날짜 입력은 숫자만 받아 자동으로 YYYY-MM-DD 형식이 됨', async () => {
  const { session } = newSession();
  session.setFormField('startDate', '20261019');
  assert.equal(session.getSnapshot().form.startDate, '2026-10-19');
});
