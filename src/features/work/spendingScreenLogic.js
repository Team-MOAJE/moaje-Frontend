// 학기 소비 분석 화면 로직 (API-42~46). React / react-native / Redux / AsyncStorage에 의존하지 않는 순수 모듈이다.
//
// 원칙
// - 예비비·프로필·점수·등급·총평·뱃지는 모두 서버가 계산한 값이다. 이 모듈은 그 문자열을 표시용으로 포맷할 뿐 합산·차감·
//   점수/등급 재계산을 하지 않는다. 금액은 문자열로만 다루며 Number로 바꾸지 않는다.
// - 학기 리포트의 Limit 계열 금액(가장 높았던/낮았던 날, 평균, 이벤트 기간 값)은 실제 거래 금액이 아니라 Daily Limit 계산 기록
//   기준이다. 그래서 라벨에 "지출/소비 금액" 같은 표현을 쓰지 않고 REPORT_NOTICE로 기준을 항상 함께 안내한다.
// - 요청이 실패하면 값을 만들지 않는다(가짜 0원·기본값 없음). 오류 종류만 돌려준다.
// - 자동 재시도·폴링·타이머가 없다. GET은 화면 진입/구간 첫 진입/연도·학기 선택/사용자의 '다시 불러오기'에서만 나가고,
//   POST(API-44)는 submitSchedule() 호출(등록 버튼 탭)로만 나간다. 폼 입력·구독·사용자 변경으로는 POST가 나가지 않는다.
// - 사용자 변경·dispose·연도/학기 변경 뒤에 도착한 늦은 응답은 폐기한다(요청 게이트).
import { createRequestGate, describeErrorType } from '../onboarding/workOnboardingScreenLogic';
import { isValidOnboardingUserId } from '../onboarding/onboardingApi';
import { formatWonString, shareToPercent } from '../moneyRecap/recapScreenLogic';
import { AMOUNT_INPUT_ERROR, normalizeAmountInput } from './simulatorScreenLogic';
import {
  EVENT_TYPE,
  MAX_EVENT_NAME_LENGTH,
  MAX_YEAR,
  MIN_YEAR,
  SPENDING_ERROR_TYPE,
  getSpendingErrorType,
  isRealIsoDate,
} from './spendingApi';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 화면 로직이 받은 모델이 계약과 다를 때. getSpendingErrorType이 INVALID_RESPONSE로 분류한다.
const invalidData = field => {
  const error = new Error('학기 소비 분석 데이터를 해석할 수 없습니다.');
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

// ── 상수 ─────────────────────────────────────────────────────

export const SPENDING_TAB = Object.freeze({
  SCHEDULES: 'schedules',
  PROFILE: 'profile',
  REPORT: 'report',
});

export const SPENDING_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export const SUBMIT_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  REJECTED: 'rejected', // 서버가 명확히 거부(4xx): 등록되지 않았다.
  UNCONFIRMED: 'unconfirmed', // 응답을 확인하지 못함: 등록되었을 수도 있다.
});

export const SUBMIT_REJECT = Object.freeze({
  IN_FLIGHT: 'IN_FLIGHT',
  NO_USER: 'NO_USER',
  INVALID_INPUT: 'INVALID_INPUT',
  DISPOSED: 'DISPOSED',
});

export const SCHEDULE_PAGE_SIZE = 50;
export const SEMESTERS = Object.freeze([1, 2]);
export const YEAR_RANGE = Object.freeze({ min: MIN_YEAR, max: MAX_YEAR });

// score_breakdown 항목별 만점. 서버 스키마(ScoreBreakdown 주석)의 고정 값이며 표시용 라벨이다(점수 계산에 쓰지 않는다).
export const SCORE_MAX = Object.freeze({
  safety: 40,
  dailyLimit: 30,
  event: 20,
  regularity: 10,
});

// 리포트 기준 안내. 금액이 실제 거래가 아님을 항상 함께 보여준다.
export const REPORT_NOTICE =
  '이 리포트의 금액은 Daily Limit(하루 사용 가능 한도) 계산 기록을 기준으로 해요. 실제 결제·거래 금액이 아니에요.';
export const REPORT_EVENT_NOTICE =
  '학기 기간 안에 있는 중간고사·기말고사·MT·축제·취업 일정만 이벤트 분석에 포함돼요.';
export const PROFILE_NOTICE = 'AI가 분석한 기준 값이에요. 거래 기록이 쌓이면 달라질 수 있어요.';
export const BUFFER_NOTICE =
  '오늘부터 7일 동안 겹치는 학사 일정의 예상 추가 지출을 합한 금액이에요.';

const EVENT_TYPE_LABELS = Object.freeze({
  [EVENT_TYPE.EXAM]: '시험',
  [EVENT_TYPE.MT]: 'MT',
  [EVENT_TYPE.FESTIVAL]: '축제',
  [EVENT_TYPE.VACATION]: '방학',
  [EVENT_TYPE.EMPLOYMENT]: '취업',
  [EVENT_TYPE.SEMESTER_START]: '개강',
  [EVENT_TYPE.SEMESTER_END]: '종강',
  [EVENT_TYPE.MIDTERM]: '중간고사',
  [EVENT_TYPE.FINAL]: '기말고사',
  [EVENT_TYPE.HOLIDAY]: '공휴일/휴강',
});

// 선택 목록(표시 순서 고정).
export const EVENT_TYPE_OPTIONS = Object.freeze(
  Object.values(EVENT_TYPE).map(value => Object.freeze({ value, label: EVENT_TYPE_LABELS[value] }))
);

// 알 수 없는 유형은 서버 원문을 그대로 보여준다.
export const describeEventType = eventType =>
  hasOwn(EVENT_TYPE_LABELS, eventType) ? EVENT_TYPE_LABELS[eventType] : String(eventType);

// ── 표시 변환 ────────────────────────────────────────────────

const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})/;
const ISO_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

// 서버 날짜/시각 문자열에서 날짜 부분만 읽는다(시간대 변환 없음). 형식이 다르면 원문 그대로.
export const isoDateOnly = value => {
  if (typeof value !== 'string') return '';
  const match = ISO_DATE_PREFIX_PATTERN.exec(value);
  return match ? match[1] : value;
};

// 서버 시각 → 'YYYY-MM-DD HH:mm'. 시간대 변환 없이 문자열에서만 읽는다. 형식이 다르면 원문 그대로.
export const formatServerDateTime = value => {
  if (typeof value !== 'string') return '';
  const match = ISO_DATE_TIME_PATTERN.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
};

// 소수 문자열 → 뒤쪽 0만 제거한 문자열("0.10" → "0.1", "1.00" → "1"). 반올림하지 않는다.
export const trimDecimalString = value => {
  const parts = typeof value === 'string' ? DECIMAL_PATTERN.exec(value) : null;
  if (!parts) throw invalidData('decimal');
  const [, sign, integerPart, fraction = ''] = parts;
  const trimmed = fraction.replace(/0+$/, '');
  const isZero = /^0+$/.test(integerPart) && trimmed === '';
  return `${sign && !isZero ? '-' : ''}${integerPart}${trimmed ? `.${trimmed}` : ''}`;
};

const periodText = (startDate, endDate) => {
  const start = isoDateOnly(startDate);
  const end = isoDateOnly(endDate);
  return start === end ? start : `${start} ~ ${end}`;
};

// ── 사용자 문구 (서버 원문·토큰·ID 노출 없음) ────────────────

const T = SPENDING_ERROR_TYPE;
const REQUEST_CONDITION_MESSAGE = '요청 조건을 확인해 주세요.';
const RETRYABLE_ERROR_TYPES = new Set([
  T.NETWORK,
  T.TIMEOUT,
  T.SERVER,
  T.INVALID_RESPONSE,
  T.UNKNOWN,
]);

export const canRetrySpendingError = errorType => RETRYABLE_ERROR_TYPES.has(errorType);

export const describeSpendingError = errorType => {
  switch (errorType) {
    case T.NOT_FOUND:
      return '요청한 정보를 찾을 수 없어요.';
    case T.BAD_REQUEST:
    case T.VALIDATION:
    case T.INVALID_REQUEST:
      return REQUEST_CONDITION_MESSAGE;
    case T.CLIENT_ERROR:
      return '요청을 처리할 수 없어요.';
    default:
      return describeErrorType(errorType);
  }
};

// ── 일정 등록 폼 ─────────────────────────────────────────────

export const createEmptyScheduleForm = () => ({
  eventType: EVENT_TYPE.EXAM,
  eventName: '',
  startDate: '',
  endDate: '',
  expectedExtraSpend: '',
});

const SCHEDULE_FORM_KEYS = Object.freeze(Object.keys(createEmptyScheduleForm()));
const DATE_KEYS = new Set(['startDate', 'endDate']);

// 숫자만 남기고 YYYY-MM-DD로 하이픈을 넣는다(날짜 선택 라이브러리 없이 입력을 돕는다). 최대 8자리.
export const formatDateInput = text => {
  const digits = String(text ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

export const SCHEDULE_FIELD_ERROR = Object.freeze({
  EVENT_TYPE: 'EVENT_TYPE',
  NAME_EMPTY: 'NAME_EMPTY',
  NAME_TOO_LONG: 'NAME_TOO_LONG',
  DATE_EMPTY: 'DATE_EMPTY',
  DATE_INVALID: 'DATE_INVALID',
  DATE_BEFORE_START: 'DATE_BEFORE_START',
});

const SCHEDULE_FIELD_MESSAGES = {
  [SCHEDULE_FIELD_ERROR.EVENT_TYPE]: '일정 유형을 선택해 주세요.',
  [SCHEDULE_FIELD_ERROR.NAME_EMPTY]: '일정 이름을 입력해 주세요.',
  [SCHEDULE_FIELD_ERROR.NAME_TOO_LONG]: `일정 이름은 ${MAX_EVENT_NAME_LENGTH}자 이하로 입력해 주세요.`,
  [SCHEDULE_FIELD_ERROR.DATE_EMPTY]: '날짜를 입력해 주세요.',
  [SCHEDULE_FIELD_ERROR.DATE_INVALID]: '실제로 있는 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.',
  [SCHEDULE_FIELD_ERROR.DATE_BEFORE_START]: '종료일은 시작일보다 빠를 수 없어요.',
  [AMOUNT_INPUT_ERROR.BAD_FORMAT]:
    '숫자만 입력해 주세요. 쉼표는 1,000처럼 천 단위로만 쓸 수 있어요.',
  [AMOUNT_INPUT_ERROR.NOT_DIGITS]: '0 이상의 정수만 입력할 수 있어요.',
  [AMOUNT_INPUT_ERROR.LEADING_ZERO]: '앞에 0을 붙이지 않고 입력해 주세요.',
  [AMOUNT_INPUT_ERROR.TOO_LONG]: '금액이 너무 커요.',
};

export const describeScheduleFieldError = code =>
  hasOwn(SCHEDULE_FIELD_MESSAGES, code) ? SCHEDULE_FIELD_MESSAGES[code] : '입력값을 확인해 주세요.';

// 폼 → spendingApi 입력(camelCase). 서버 규칙(길이·enum·날짜 형식·금액)에 더해 종료일 < 시작일을 UI에서 막는다
// (서버는 이 순서를 검증하지 않는다). 예상 추가 지출이 비어 있으면 키를 만들지 않는다(서버 기본값 0).
export const validateScheduleForm = form => {
  const fieldErrors = {};

  if (!EVENT_TYPE_OPTIONS.some(option => option.value === form?.eventType)) {
    fieldErrors.eventType = SCHEDULE_FIELD_ERROR.EVENT_TYPE;
  }

  const name = typeof form?.eventName === 'string' ? form.eventName.trim() : '';
  if (name === '') fieldErrors.eventName = SCHEDULE_FIELD_ERROR.NAME_EMPTY;
  else if (name.length > MAX_EVENT_NAME_LENGTH) {
    fieldErrors.eventName = SCHEDULE_FIELD_ERROR.NAME_TOO_LONG;
  }

  for (const key of ['startDate', 'endDate']) {
    const value = form?.[key];
    if (typeof value !== 'string' || value === '')
      fieldErrors[key] = SCHEDULE_FIELD_ERROR.DATE_EMPTY;
    else if (!isRealIsoDate(value)) fieldErrors[key] = SCHEDULE_FIELD_ERROR.DATE_INVALID;
  }
  if (!fieldErrors.startDate && !fieldErrors.endDate && form.endDate < form.startDate) {
    fieldErrors.endDate = SCHEDULE_FIELD_ERROR.DATE_BEFORE_START;
  }

  const extra = normalizeAmountInput(form?.expectedExtraSpend);
  if (!extra.empty && !extra.ok) fieldErrors.expectedExtraSpend = extra.error;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const input = {
    eventType: form.eventType,
    eventName: name,
    startDate: form.startDate,
    endDate: form.endDate,
  };
  if (extra.ok) input.expectedExtraSpend = extra.value;
  return { ok: true, input, fieldErrors };
};

const SUBMIT_MESSAGES = {
  [SUBMIT_STATUS.SUCCESS]: '일정을 등록했어요.',
  [SUBMIT_STATUS.UNCONFIRMED]:
    '등록 여부를 확인하지 못했어요. 목록을 새로고침해 이미 등록됐는지 확인한 뒤, 필요할 때만 다시 등록해 주세요.',
};

export const describeSubmitResult = submit => {
  if (!submit) return null;
  if (hasOwn(SUBMIT_MESSAGES, submit.status)) return SUBMIT_MESSAGES[submit.status];
  if (submit.status === SUBMIT_STATUS.REJECTED) {
    return `등록하지 못했어요. ${describeSpendingError(submit.errorType)}`;
  }
  return null;
};

// 응답을 받지 못했거나(타임아웃·연결 끊김) 받은 응답을 해석하지 못한 경우는 서버가 이미 저장했을 수 있다.
const UNCONFIRMED_ERROR_TYPES = new Set([
  T.TIMEOUT,
  T.NETWORK,
  T.SERVER,
  T.INVALID_RESPONSE,
  T.UNKNOWN,
]);

// ── 요청 실행 래퍼 ───────────────────────────────────────────

// 반환: { ok:true, value } | { ok:false, canceled:true } | { ok:false, errorType }
export const runRequest = async fn => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const errorType = getSpendingErrorType(error);
    if (errorType === T.CANCELED) return { ok: false, canceled: true };
    return { ok: false, errorType };
  }
};

// ── 뷰모델 ───────────────────────────────────────────────────

// API-42: 예비비. 0도 정상 값이다.
export const buildEventBufferViewModel = eventBuffer => ({
  amountText: formatWonString(eventBuffer),
  isEmpty: /^0+(?:\.0+)?$/.test(eventBuffer),
});

// API-43: 프로필. 값은 서버가 준 그대로 포맷만 한다.
export const buildProfileViewModel = profile => {
  if (profile === null || typeof profile !== 'object') throw invalidData('profile');
  return {
    avgDailyAmountText: formatWonString(profile.avgDailyAmount),
    peakHourText: `${profile.peakSpendHour}시`,
    topCategoryText:
      profile.topCategory === null || profile.topCategory === '' ? '-' : profile.topCategory,
    riskScoreText: trimDecimalString(profile.riskScoreBaseline),
    lastAnalyzedText: formatServerDateTime(profile.lastAnalyzedAt),
  };
};

export const SCHEDULE_SOURCE_LABEL = Object.freeze({ AUTO: '자동', MANUAL: '직접' });

// 일정 목록 항목(API-20; API-45 모델도 동일하게 처리). key는 정밀도 손실 id 대신 내용 + 목록 내 위치로 만든다.
// isAuto(API-20, 학교 일정 자동 동기화 여부)가 boolean일 때만 sourceLabel을 붙인다. 없으면 출처를 추측하지 않는다.
export const buildScheduleItemViewModel = (item, index) => {
  const viewModel = {
    key: `${item.startDate}|${item.endDate}|${item.eventType}|${item.eventName}|${index}`,
    typeLabel: describeEventType(item.eventType),
    name: item.eventName,
    periodText: periodText(item.startDate, item.endDate),
    extraSpendText: formatWonString(item.expectedExtraSpend),
  };
  if (typeof item.isAuto === 'boolean') {
    viewModel.sourceLabel = item.isAuto ? SCHEDULE_SOURCE_LABEL.AUTO : SCHEDULE_SOURCE_LABEL.MANUAL;
  }
  return viewModel;
};

// ── 학교 일정 자동 동기화 (API-18 학교 목록, API-19 동기화) ───

export const SYNC_STATUS = Object.freeze({
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  REJECTED: 'rejected', // 서버가 명확히 거부(4xx): 반영되지 않았다.
  UNCONFIRMED: 'unconfirmed', // 응답을 확인하지 못함: 서버에는 반영됐을 수도 있다.
});

export const SYNC_REJECT = Object.freeze({
  IN_FLIGHT: 'IN_FLIGHT',
  NO_USER: 'NO_USER',
  NO_UNIVERSITY: 'NO_UNIVERSITY',
  DISPOSED: 'DISPOSED',
});

export const SYNC_CONFIRM_MESSAGE =
  '선택한 학교·학기의 일정으로 같은 기간의 기존 자동 등록 일정을 교체해요. 직접 등록한 일정은 그대로 유지돼요.';
const SYNC_NOT_FOUND_MESSAGE = '선택한 학교·학기의 학사 일정이 아직 준비되지 않았어요.';

// 학교 선택 항목. 서버 이름을 그대로 쓰고 약칭이 있으면 보조로 붙인다.
export const buildUniversityViewModel = university => ({
  universityId: university.universityId,
  name: university.name,
  detail:
    [university.shortName, university.region]
      .filter(text => typeof text === 'string' && text !== '')
      .join(' · ') || null,
});

export const describeSyncResult = sync => {
  if (!sync) return null;
  switch (sync.status) {
    case SYNC_STATUS.SUCCESS:
      return sync.syncedCount === 0
        ? '불러온 일정이 없어요.'
        : `${sync.universityName} 일정 ${sync.syncedCount}건을 불러왔어요.`;
    case SYNC_STATUS.UNCONFIRMED:
      return '동기화 결과를 확인하지 못했어요. 목록을 새로고침해 반영됐는지 확인한 뒤, 필요할 때만 다시 시도해 주세요.';
    case SYNC_STATUS.REJECTED:
      return sync.errorType === T.NOT_FOUND
        ? SYNC_NOT_FOUND_MESSAGE
        : `일정을 불러오지 못했어요. ${describeSpendingError(sync.errorType)}`;
    default:
      return null;
  }
};

// API-46 리포트 라벨. "지출/소비 금액" 표현을 쓰지 않는다(Limit 기준 값이다).
export const REPORT_LABELS = Object.freeze({
  scoreTitle: '종합 점수',
  breakdownTitle: '점수 구성',
  safety: '안전도',
  dailyLimit: 'Daily Limit 준수',
  event: '이벤트 대비',
  regularity: '규칙성',
  limitTitle: 'Daily Limit 기록',
  avgDailyLimit: '평균 하루 한도',
  peakLimit: '하루 한도가 가장 높았던 날',
  lowestLimit: '하루 한도가 가장 낮았던 날',
  complianceRate: '한도 여유가 있었던 날 비율',
  cv: '한도 변동 정도',
  logDays: '한도 기록 일수',
  txCount: '분석된 거래 수',
  peakHour: '거래가 많은 시간대',
  topCategory: '주요 카테고리',
  fdsTitle: '이상거래 탐지',
  fdsTotal: '탐지 건수',
  fdsHigh: '높은 위험',
  fdsMedium: '중간 위험',
  fdsSafety: '안전도 등급',
  fdsReason: '가장 많은 탐지 원인',
  eventsTitle: '학사 이벤트별 한도',
  eventAvgLimit: '기간 평균 하루 한도',
  eventTotalLimit: '기간 한도 합계',
  eventRatio: '평소 대비 한도 배율',
  badgesTitle: '뱃지',
});

const GRADE_NOT_EVALUATED = 'N/A';

// 서버 점수·등급을 그대로 쓴다. "N/A"는 오류가 아니라 미평가다.
export const buildReportViewModel = report => {
  if (report === null || typeof report !== 'object') throw invalidData('report');
  const { spending, fds, events, scoreBreakdown } = report;
  const notEvaluated = report.overallGrade === GRADE_NOT_EVALUATED;

  return {
    periodLabel: report.periodLabel,
    periodText: periodText(report.periodStart, report.periodEnd),
    grade: report.overallGrade,
    gradeText: notEvaluated ? '미평가' : report.overallGrade,
    isNotEvaluated: notEvaluated,
    scoreText: `${report.overallScore}점`,
    summaryMessage: report.summaryMessage,
    badges: report.badges,
    breakdown: [
      {
        key: 'safety',
        label: REPORT_LABELS.safety,
        score: scoreBreakdown.safetyScore,
        max: SCORE_MAX.safety,
      },
      {
        key: 'dailyLimit',
        label: REPORT_LABELS.dailyLimit,
        score: scoreBreakdown.dailyLimitScore,
        max: SCORE_MAX.dailyLimit,
      },
      {
        key: 'event',
        label: REPORT_LABELS.event,
        score: scoreBreakdown.eventScore,
        max: SCORE_MAX.event,
      },
      {
        key: 'regularity',
        label: REPORT_LABELS.regularity,
        score: scoreBreakdown.regularityScore,
        max: SCORE_MAX.regularity,
      },
    ].map(item => ({ ...item, scoreText: `${item.score} / ${item.max}` })),
    limitRows: [
      {
        key: 'avgDailyLimit',
        label: REPORT_LABELS.avgDailyLimit,
        value: formatWonString(spending.avgDailyLimit),
      },
      {
        key: 'peakLimit',
        label: REPORT_LABELS.peakLimit,
        value: `${isoDateOnly(spending.peakLimitDate)} · ${formatWonString(spending.peakLimitAmount)}`,
      },
      {
        key: 'lowestLimit',
        label: REPORT_LABELS.lowestLimit,
        value: `${isoDateOnly(spending.lowestLimitDate)} · ${formatWonString(spending.lowestLimitAmount)}`,
      },
      {
        key: 'complianceRate',
        label: REPORT_LABELS.complianceRate,
        value: `${shareToPercent(spending.dailyLimitComplianceRate)}%`,
      },
      {
        key: 'cv',
        label: REPORT_LABELS.cv,
        value:
          spending.dailyLimitCv === null ? '계산 불가' : trimDecimalString(spending.dailyLimitCv),
      },
      { key: 'logDays', label: REPORT_LABELS.logDays, value: `${spending.totalLogDays}일` },
      { key: 'txCount', label: REPORT_LABELS.txCount, value: `${spending.totalTxCount}건` },
      { key: 'peakHour', label: REPORT_LABELS.peakHour, value: `${spending.peakSpendHour}시` },
      { key: 'topCategory', label: REPORT_LABELS.topCategory, value: spending.topCategory },
    ],
    fdsRows: [
      { key: 'total', label: REPORT_LABELS.fdsTotal, value: `${fds.totalDetected}건` },
      { key: 'high', label: REPORT_LABELS.fdsHigh, value: `${fds.highCount}건` },
      { key: 'medium', label: REPORT_LABELS.fdsMedium, value: `${fds.mediumCount}건` },
      { key: 'safety', label: REPORT_LABELS.fdsSafety, value: fds.safetyGrade },
      { key: 'reason', label: REPORT_LABELS.fdsReason, value: fds.topReason },
    ],
    events: events.map((event, index) => ({
      key: `${event.startDate}|${event.endDate}|${event.eventType}|${event.eventName}|${index}`,
      typeLabel: describeEventType(event.eventType),
      name: event.eventName,
      periodText: `${periodText(event.startDate, event.endDate)} (${event.periodDays}일)`,
      avgLimitText: formatWonString(event.avgDailyLimit),
      totalLimitText: formatWonString(event.totalLimit),
      ratioText: `${trimDecimalString(event.vsNormalRatio)}배`,
    })),
  };
};

// ── 연도 ─────────────────────────────────────────────────────

export const clampYear = year => Math.min(Math.max(year, MIN_YEAR), MAX_YEAR);

// 기본 선택 연도: 기기 날짜의 연도(서버 허용 범위로 보정). 학기는 사용자가 직접 고른다(기본 1학기).
export const getInitialYear = (now = new Date()) => clampYear(now.getFullYear());

// ── 세션 ─────────────────────────────────────────────────────

const S = SPENDING_STATUS;

const idleResource = () =>
  Object.freeze({
    status: S.IDLE,
    scope: null,
    viewModel: null,
    errorType: null,
    retryable: false,
  });

const initialSchedules = () =>
  Object.freeze({
    status: S.IDLE,
    scope: null,
    items: Object.freeze([]),
    hasMore: false,
    loadingMore: false,
    moreErrorType: null,
    errorType: null,
    retryable: false,
  });

const initialSubmit = () => Object.freeze({ status: SUBMIT_STATUS.IDLE, errorType: null });

const RESOURCE_KEYS = ['buffer', 'schedules', 'profile', 'report', 'universities'];

const initialSync = () => Object.freeze({ status: SYNC_STATUS.IDLE, errorType: null });

// 화면이 ref로 들고 있는 React 비의존 스토어(getSnapshot/subscribe). 모듈 전역 상태·저장소·타이머 사용 없음.
export const createSpendingSession = ({
  fetchEventBuffer,
  fetchSpendingProfile,
  createAcademicSchedule,
  fetchCalendarSchedules,
  fetchSemesterReport,
  fetchUniversities,
  syncCalendar,
  now = () => new Date(),
} = {}) => {
  // 일정 목록은 API-20(fetchCalendarSchedules)으로 읽는다. API-45(fetchAcademicSchedules)는 이 세션에서 쓰지 않는다.
  if (
    [
      fetchEventBuffer,
      fetchSpendingProfile,
      createAcademicSchedule,
      fetchCalendarSchedules,
      fetchSemesterReport,
      fetchUniversities,
      syncCalendar,
    ].some(fn => typeof fn !== 'function')
  ) {
    throw new TypeError('API-18~20, 42~44, 46 함수 7개가 모두 필요합니다.');
  }

  const gates = Object.fromEntries(RESOURCE_KEYS.map(key => [key, createRequestGate()]));
  const submitGate = createRequestGate();
  const syncGate = createRequestGate();
  const listeners = new Set();

  let userId = null;
  let disposed = false;
  let activeTab = SPENDING_TAB.SCHEDULES;
  let scheduleYear = getInitialYear(now());
  let reportPeriod = { year: getInitialYear(now()), semester: 1 };
  let form = createEmptyScheduleForm();
  let formErrors = {};
  let submit = initialSubmit();
  let submitToken = null;
  let calendarOpen = false;
  let selectedUniversityId = null;
  let syncPeriod = { year: getInitialYear(now()), semester: 1 };
  let sync = initialSync();
  let syncToken = null;
  let universities = idleResource();
  let buffer = idleResource();
  let schedules = initialSchedules();
  let profile = idleResource();
  let report = idleResource();
  const inFlight = {
    buffer: null,
    schedules: null,
    profile: null,
    report: null,
    universities: null,
  }; // { scope, promise }
  let snapshot = null;

  const isUserValid = () => isValidOnboardingUserId(userId);

  const build = () =>
    Object.freeze({
      userId,
      activeTab,
      scheduleYear,
      reportPeriod: Object.freeze({ ...reportPeriod }),
      buffer,
      schedules,
      profile,
      report,
      form: Object.freeze({ ...form }),
      formErrors: Object.freeze({ ...formErrors }),
      submit,
      isSubmitting: submitToken !== null,
      canSubmit: !disposed && isUserValid() && submitToken === null,
      calendar: Object.freeze({
        open: calendarOpen,
        universities,
        selectedUniversityId,
        year: syncPeriod.year,
        semester: syncPeriod.semester,
        sync,
        isSyncing: syncToken !== null,
        canSync:
          !disposed &&
          isUserValid() &&
          syncToken === null &&
          universities.status === S.READY &&
          selectedUniversityId !== null,
      }),
      canLoadMoreSchedules:
        !disposed &&
        isUserValid() &&
        schedules.status === S.READY &&
        schedules.hasMore &&
        !schedules.loadingMore &&
        inFlight.schedules === null,
    });

  const commit = () => {
    if (disposed) return;
    snapshot = build();
    [...listeners].forEach(listener => listener());
  };

  const getSnapshot = () => snapshot;

  const subscribe = listener => {
    if (disposed) return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const invalidateRequests = () => {
    RESOURCE_KEYS.forEach(key => {
      gates[key].invalidate();
      inFlight[key] = null;
    });
    submitGate.invalidate();
    submitToken = null;
    syncGate.invalidate();
    syncToken = null;
  };

  const failure = errorType =>
    Object.freeze({
      status: S.ERROR,
      errorType,
      retryable: canRetrySpendingError(errorType),
    });

  // 한 자원(예비비/프로필/리포트/일정 첫 페이지)을 GET으로 불러온다.
  // - 같은 scope 요청이 진행 중이면 그 요청을 이어받는다(force가 아니면). 이미 시도한 scope는 다시 요청하지 않는다.
  // - 오류 뒤 재요청은 force(retry)로만 한다. 구간 전환·재진입으로는 자동 재시도하지 않는다.
  // - 새 요청은 게이트 토큰을 새로 받으므로 이전 응답은 폐기된다.
  const loadResource = (
    key,
    scope,
    fetchFn,
    applyOk,
    getCurrent,
    setCurrent,
    { force = false } = {}
  ) => {
    if (disposed || !isUserValid()) return Promise.resolve();

    const current = getCurrent();
    if (!force) {
      if (inFlight[key] && inFlight[key].scope === scope) return inFlight[key].promise;
      // 이미 시도한 요청(성공·실패 모두)은 구간 전환 등으로 다시 보내지 않는다. 다시 요청은 retry()(사용자 탭)뿐이다.
      if (current.scope === scope && current.status !== S.IDLE) return Promise.resolve();
    }

    const token = gates[key].begin(scope);
    setCurrent({
      ...(key === 'schedules' ? initialSchedules() : idleResource()),
      status: S.LOADING,
      scope,
    });
    commit();

    const entry = { scope };
    entry.promise = (async () => {
      const result = await runRequest(() => fetchFn());
      if (inFlight[key] === entry) inFlight[key] = null;
      if (disposed || !gates[key].isCurrent(token)) return; // 사용자 변경·dispose·재요청 뒤의 늦은 응답

      if (result.ok) {
        try {
          setCurrent({ ...applyOk(result.value), scope });
        } catch {
          // API 모듈이 이미 검증한 응답이므로 여기서 변환이 실패하면 모두 응답 해석 오류로 본다.
          setCurrent({
            ...(key === 'schedules' ? initialSchedules() : idleResource()),
            ...failure(T.INVALID_RESPONSE),
            scope,
          });
        }
      } else if (result.canceled) {
        setCurrent(key === 'schedules' ? initialSchedules() : idleResource());
      } else {
        setCurrent({
          ...(key === 'schedules' ? initialSchedules() : idleResource()),
          ...failure(result.errorType),
          scope,
        });
      }
      commit();
    })();
    inFlight[key] = entry;
    return entry.promise;
  };

  const loadBuffer = options =>
    loadResource(
      'buffer',
      'buffer',
      () => fetchEventBuffer(userId),
      value =>
        Object.freeze({
          status: S.READY,
          viewModel: Object.freeze(buildEventBufferViewModel(value)),
          errorType: null,
          retryable: false,
        }),
      () => buffer,
      next => {
        buffer = Object.freeze(next);
      },
      options
    );

  const loadProfile = options =>
    loadResource(
      'profile',
      'profile',
      () => fetchSpendingProfile(userId),
      value =>
        Object.freeze({
          status: S.READY,
          viewModel: Object.freeze(buildProfileViewModel(value)),
          errorType: null,
          retryable: false,
        }),
      () => profile,
      next => {
        profile = Object.freeze(next);
      },
      options
    );

  // API-18. 학교 선택 패널을 처음 펼칠 때 한 번만 읽는다(성공·실패 모두 다시 요청하지 않음, 재시도는 사용자 탭).
  const loadUniversities = options =>
    loadResource(
      'universities',
      'universities',
      () => fetchUniversities(),
      value =>
        Object.freeze({
          status: S.READY,
          viewModel: Object.freeze(value.map(buildUniversityViewModel)),
          errorType: null,
          retryable: false,
        }),
      () => universities,
      next => {
        universities = Object.freeze(next);
      },
      options
    );

  const loadReport = options => {
    const { year, semester } = reportPeriod;
    return loadResource(
      'report',
      `${year}-${semester}`,
      () => fetchSemesterReport(userId, { year, semester }),
      value =>
        Object.freeze({
          status: S.READY,
          viewModel: Object.freeze(buildReportViewModel(value)),
          errorType: null,
          retryable: false,
        }),
      () => report,
      next => {
        report = Object.freeze(next);
      },
      options
    );
  };

  const loadSchedules = options => {
    const year = scheduleYear;
    return loadResource(
      'schedules',
      `${year}`,
      () => fetchCalendarSchedules(userId, { year, limit: SCHEDULE_PAGE_SIZE, offset: 0 }),
      value =>
        Object.freeze({
          ...initialSchedules(),
          status: S.READY,
          items: Object.freeze(value.map((item, index) => buildScheduleItemViewModel(item, index))),
          // 총 개수를 주지 않으므로 받은 개수가 한 페이지를 채웠을 때만 더 있다고 본다.
          hasMore: value.length === SCHEDULE_PAGE_SIZE,
        }),
      () => schedules,
      next => {
        schedules = Object.freeze(next);
      },
      options
    );
  };

  // 일정 '더 보기'. 목록이 READY이고 진행 중 요청이 없을 때만 다음 페이지(offset = 받은 개수)를 요청한다.
  const loadMoreSchedules = () => {
    if (disposed || !isUserValid()) return Promise.resolve();
    if (schedules.status !== S.READY || !schedules.hasMore || schedules.loadingMore) {
      return Promise.resolve();
    }
    if (inFlight.schedules !== null) return inFlight.schedules.promise;

    const scope = schedules.scope;
    const year = scheduleYear;
    const offset = schedules.items.length;
    const token = gates.schedules.begin(scope);
    schedules = Object.freeze({ ...schedules, loadingMore: true, moreErrorType: null });
    commit();

    const entry = { scope };
    entry.promise = (async () => {
      const result = await runRequest(() =>
        fetchCalendarSchedules(userId, { year, limit: SCHEDULE_PAGE_SIZE, offset })
      );
      if (inFlight.schedules === entry) inFlight.schedules = null;
      if (disposed || !gates.schedules.isCurrent(token)) return;

      if (result.ok) {
        const added = result.value.map((item, index) =>
          buildScheduleItemViewModel(item, offset + index)
        );
        schedules = Object.freeze({
          ...schedules,
          items: Object.freeze([...schedules.items, ...added]),
          hasMore: result.value.length === SCHEDULE_PAGE_SIZE,
          loadingMore: false,
          moreErrorType: null,
        });
      } else {
        // 이미 받은 목록은 유지하고 '더 보기' 오류만 표시한다. 취소는 조용히 되돌린다.
        schedules = Object.freeze({
          ...schedules,
          loadingMore: false,
          moreErrorType: result.canceled ? null : result.errorType,
        });
      }
      commit();
    })();
    inFlight.schedules = entry;
    return entry.promise;
  };

  // 현재 구간에 필요한 GET만 요청한다. 이미 불러온 구간은 다시 요청하지 않는다.
  const loadActiveTab = () => {
    if (disposed || !isUserValid()) return Promise.resolve();
    switch (activeTab) {
      case SPENDING_TAB.SCHEDULES:
        return Promise.all([loadBuffer(), loadSchedules()]);
      case SPENDING_TAB.PROFILE:
        return loadProfile();
      case SPENDING_TAB.REPORT:
        return loadReport();
      default:
        return Promise.resolve();
    }
  };

  const resetAll = nextUserId => {
    invalidateRequests();
    userId = nextUserId;
    activeTab = SPENDING_TAB.SCHEDULES;
    scheduleYear = getInitialYear(now());
    reportPeriod = { year: getInitialYear(now()), semester: 1 };
    form = createEmptyScheduleForm();
    formErrors = {};
    submit = initialSubmit();
    calendarOpen = false;
    selectedUniversityId = null;
    syncPeriod = { year: getInitialYear(now()), semester: 1 };
    sync = initialSync();
    universities = idleResource();
    buffer = idleResource();
    schedules = initialSchedules();
    profile = idleResource();
    report = idleResource();
  };

  snapshot = build();

  // 사용자가 바뀌면 이전 사용자의 폼·결과·진행 중 요청을 모두 버린다. 같은 사용자면 아무것도 하지 않는다.
  // 유효한 사용자면 첫 구간(일정)의 GET만 요청한다. POST는 요청하지 않는다.
  const setUser = nextUserId => {
    if (disposed || nextUserId === userId) return Promise.resolve();
    resetAll(nextUserId);
    commit();
    return loadActiveTab();
  };

  const selectTab = tab => {
    if (disposed || !Object.values(SPENDING_TAB).includes(tab) || tab === activeTab) {
      return Promise.resolve();
    }
    activeTab = tab;
    commit();
    return loadActiveTab();
  };

  // 일정 연도 선택: 이전 연도 요청·목록을 버리고 새 연도의 첫 페이지를 요청한다(GET).
  const setScheduleYear = year => {
    if (disposed || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      return Promise.resolve();
    }
    if (year === scheduleYear) return Promise.resolve();
    scheduleYear = year;
    gates.schedules.invalidate();
    inFlight.schedules = null;
    schedules = initialSchedules();
    commit();
    return loadSchedules();
  };

  // 리포트 연도/학기 선택: 이전 선택의 요청·결과를 버리고 새 선택의 리포트를 요청한다(GET).
  const setReportPeriod = ({ year, semester }) => {
    if (disposed) return Promise.resolve();
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return Promise.resolve();
    if (!SEMESTERS.includes(semester)) return Promise.resolve();
    if (reportPeriod.year === year && reportPeriod.semester === semester) return Promise.resolve();
    reportPeriod = { year, semester };
    gates.report.invalidate();
    inFlight.report = null;
    report = idleResource();
    commit();
    return loadReport();
  };

  // 폼 입력. 요청을 만들지 않는다. 입력이 바뀌면 이전 등록 결과 문구는 지운다(등록 중이면 유지).
  const setFormField = (key, text) => {
    if (disposed || !SCHEDULE_FORM_KEYS.includes(key)) return false;
    const next = DATE_KEYS.has(key) ? formatDateInput(text) : text;
    if (form[key] === next) return false;

    form = { ...form, [key]: next };
    if (hasOwn(formErrors, key)) {
      const { [key]: _removed, ...rest } = formErrors;
      formErrors = rest;
    }
    if (key === 'startDate' && hasOwn(formErrors, 'endDate')) {
      const { endDate: _removedEnd, ...rest } = formErrors;
      formErrors = rest;
    }
    if (submitToken === null && submit.status !== SUBMIT_STATUS.IDLE) submit = initialSubmit();
    commit();
    return true;
  };

  const rejected = (reason, extra = {}) => Promise.resolve({ started: false, reason, ...extra });

  // 각 구간의 GET을 사용자가 직접 다시 요청한다. 재시도 가능한 오류에서만 의미가 있다.
  const retry = key => {
    switch (key) {
      case 'buffer':
        return loadBuffer({ force: true });
      case 'schedules':
        return loadSchedules({ force: true });
      case 'profile':
        return loadProfile({ force: true });
      case 'report':
        return loadReport({ force: true });
      case 'universities':
        return loadUniversities({ force: true });
      default:
        return Promise.resolve();
    }
  };

  // 목록·예비비를 서버에서 다시 읽는다(GET만). 등록 성공 직후와 '등록 여부 확인'에서 쓴다.
  const refreshScheduleData = () =>
    Promise.all([loadBuffer({ force: true }), loadSchedules({ force: true })]);

  // API-44. '등록' 버튼 탭에서만 호출한다. 동시 POST 차단, 자동 재시도 없음.
  const submitSchedule = () => {
    if (disposed) return rejected(SUBMIT_REJECT.DISPOSED);
    if (submitToken !== null) return rejected(SUBMIT_REJECT.IN_FLIGHT);
    if (!isUserValid()) return rejected(SUBMIT_REJECT.NO_USER);

    const validation = validateScheduleForm(form);
    if (!validation.ok) {
      formErrors = validation.fieldErrors;
      commit();
      return rejected(SUBMIT_REJECT.INVALID_INPUT);
    }

    formErrors = {};
    const token = submitGate.begin(userId);
    submitToken = token;
    submit = Object.freeze({ status: SUBMIT_STATUS.SUBMITTING, errorType: null });
    commit();

    const targetUserId = userId;
    return (async () => {
      const result = await runRequest(() => createAcademicSchedule(targetUserId, validation.input));
      // 사용자 변경·dispose 뒤의 응답은 화면에 반영하지 않는다(서버 처리는 되돌릴 수 없다).
      if (disposed || !submitGate.isCurrent(token)) return { started: true, discarded: true };
      submitToken = null;

      if (result.ok) {
        form = createEmptyScheduleForm();
        formErrors = {};
        submit = Object.freeze({ status: SUBMIT_STATUS.SUCCESS, errorType: null });
        commit();
        // 서버가 캐시를 지우므로 GET으로 다시 읽는다. 예비비를 프론트에서 더하지 않는다.
        await refreshScheduleData();
        return { started: true, status: SUBMIT_STATUS.SUCCESS };
      }

      if (result.canceled) {
        submit = initialSubmit();
        commit();
        return { started: true, status: SUBMIT_STATUS.IDLE };
      }

      const status = UNCONFIRMED_ERROR_TYPES.has(result.errorType)
        ? SUBMIT_STATUS.UNCONFIRMED
        : SUBMIT_STATUS.REJECTED;
      submit = Object.freeze({ status, errorType: result.errorType });
      commit();
      return { started: true, status, errorType: result.errorType };
    })();
  };

  // 학교 일정 가져오기 패널 열기/닫기. 처음 열 때만 학교 목록(GET)을 요청한다. POST는 요청하지 않는다.
  const toggleCalendarPanel = () => {
    if (disposed || !isUserValid()) return Promise.resolve();
    calendarOpen = !calendarOpen;
    commit();
    return calendarOpen ? loadUniversities() : Promise.resolve();
  };

  const clearSyncResult = () => {
    if (syncToken === null && sync.status !== SYNC_STATUS.IDLE) sync = initialSync();
  };

  // 학교 선택. 불러온 목록에 없는 id는 무시한다. 요청을 만들지 않는다.
  const selectUniversity = universityId => {
    if (disposed || syncToken !== null) return false;
    const known =
      universities.status === S.READY &&
      universities.viewModel.some(item => item.universityId === universityId);
    if (!known || selectedUniversityId === universityId) return false;
    selectedUniversityId = universityId;
    clearSyncResult();
    commit();
    return true;
  };

  // 동기화 학년도/학기 선택. 요청을 만들지 않는다.
  const setSyncPeriod = ({ year, semester }) => {
    if (disposed || syncToken !== null) return false;
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return false;
    if (!SEMESTERS.includes(semester)) return false;
    if (syncPeriod.year === year && syncPeriod.semester === semester) return false;
    syncPeriod = { year, semester };
    clearSyncResult();
    commit();
    return true;
  };

  const syncRejected = (reason, extra = {}) =>
    Promise.resolve({ started: false, reason, ...extra });

  // API-19. '일정 불러오기' 버튼(확인 후)에서만 호출한다. 동시 POST 차단, 자동 재시도 없음.
  // 서버는 같은 기간의 기존 자동 일정을 교체하므로, 완료 후에는 GET으로 목록·예비비를 다시 읽는다(합산하지 않음).
  const syncSchedules = () => {
    if (disposed) return syncRejected(SYNC_REJECT.DISPOSED);
    if (syncToken !== null) return syncRejected(SYNC_REJECT.IN_FLIGHT);
    if (!isUserValid()) return syncRejected(SYNC_REJECT.NO_USER);
    if (universities.status !== S.READY || selectedUniversityId === null) {
      return syncRejected(SYNC_REJECT.NO_UNIVERSITY);
    }

    const token = syncGate.begin(userId);
    syncToken = token;
    sync = Object.freeze({ status: SYNC_STATUS.SYNCING, errorType: null });
    commit();

    const targetUserId = userId;
    const input = {
      universityId: selectedUniversityId,
      year: syncPeriod.year,
      semester: syncPeriod.semester,
    };
    return (async () => {
      const result = await runRequest(() => syncCalendar(targetUserId, input));
      // 사용자 변경·dispose 뒤의 응답은 화면에 반영하지 않는다(서버 처리는 되돌릴 수 없다).
      if (disposed || !syncGate.isCurrent(token)) return { started: true, discarded: true };
      syncToken = null;

      if (result.ok) {
        sync = Object.freeze({
          status: SYNC_STATUS.SUCCESS,
          errorType: null,
          syncedCount: result.value.syncedCount,
          universityName: result.value.universityName,
        });
        // 결과가 보이도록 목록 연도를 동기화한 학년도로 맞춘 뒤 서버에서 다시 읽는다.
        if (input.year !== scheduleYear) scheduleYear = input.year;
        commit();
        await refreshScheduleData();
        return { started: true, status: SYNC_STATUS.SUCCESS };
      }

      if (result.canceled) {
        sync = initialSync();
        commit();
        return { started: true, status: SYNC_STATUS.IDLE };
      }

      const status = UNCONFIRMED_ERROR_TYPES.has(result.errorType)
        ? SYNC_STATUS.UNCONFIRMED
        : SYNC_STATUS.REJECTED;
      sync = Object.freeze({ status, errorType: result.errorType });
      commit();
      return { started: true, status, errorType: result.errorType };
    })();
  };

  // 화면을 떠날 때 호출한다. 이후 도착하는 응답은 상태를 바꾸지 않는다.
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidateRequests();
    listeners.clear();
  };

  return {
    getSnapshot,
    subscribe,
    setUser,
    selectTab,
    setScheduleYear,
    setReportPeriod,
    setFormField,
    loadMoreSchedules,
    retry,
    refreshScheduleData,
    submitSchedule,
    toggleCalendarPanel,
    selectUniversity,
    setSyncPeriod,
    syncSchedules,
    dispose,
  };
};
