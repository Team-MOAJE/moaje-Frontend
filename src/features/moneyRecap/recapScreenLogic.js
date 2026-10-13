// Money Recap 화면 로직 (API-37/38). React / react-native / Redux / AsyncStorage에 의존하지 않는 순수 모듈이다.
// 아직 어떤 화면에도 연결되어 있지 않다(UI는 3부).
//
// 원칙
// - 서버가 준 값만 보여준다. 시간대·요일·기간 비교·등급/점수 같은 서버에 없는 통계는 만들지 않는다
//   (해당 key를 data에 넣지 않으므로 기존 buildMoneyRecapStories가 그 스토리를 생략한다).
// - 요청이 실패하면 값을 만들지 않는다(가짜 0원·0%·별명 없음). 오류 종류만 돌려준다.
// - 금액은 문자열 그대로 다룬다(Number로 바꾸지 않는다). share(0~1)는 표시용 백분율로만 바꾼다.
// - API-38은 조회할 때마다 서버가 RECAP_VIEW 지표를 기록한다. 그래서 월을 고르는 것만으로는 호출하지 않고
//   (selectMonth는 요청 없음), 자동 재시도도 없다. 사용자가 '시작'/'다시 불러오기'를 눌렀을 때만 openRecap/loadMonths를 부른다.
// - 입력은 recapApi.mapRecapResponse가 만든 camelCase 모델이다(서버 원본 snake_case가 아님).
import { createRequestGate, describeErrorType } from '../onboarding/workOnboardingScreenLogic';
import { RECAP_ERROR_TYPE, getRecapErrorType, isValidRecapYearMonth } from './recapApi';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 화면 로직이 받은 모델이 계약과 다를 때. getRecapErrorType이 INVALID_RESPONSE로 분류한다.
const invalidData = field => {
  const error = new Error('Money Recap 데이터를 해석할 수 없습니다.');
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

// ── 표시 변환 ────────────────────────────────────────────────

// 금액: 원 단위 정수 또는 소수 문자열(음수 허용). recapApi의 검증과 같은 형식이며 부호/정수부/소수부로 분리한다.
const AMOUNT_PARTS_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;
// 비율: 0 이상 1 이하의 10진 문자열.
const SHARE_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

// 금액 문자열 → '1,234.5원'. 문자열만 다루므로 큰 금액도 정밀도가 손실되지 않는다.
// - 소수부의 뒤쪽 0만 제거한다("200000.0000" → "200,000원"). 0이 아닌 소수는 반올림·삭제하지 않는다("1234.5678" → "1,234.5678원").
// - 값이 0이면 부호를 버린다("-0", "-0.0000" → "0원").
export const formatWonString = amount => {
  const parts = typeof amount === 'string' ? AMOUNT_PARTS_PATTERN.exec(amount) : null;
  if (!parts) throw invalidData('amount');

  const [, sign, integerPart, fraction = ''] = parts;
  const trimmedFraction = fraction.replace(/0+$/, '');
  const isZero = integerPart === '0' && trimmedFraction === '';
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign && !isZero ? '-' : ''}${grouped}${trimmedFraction ? `.${trimmedFraction}` : ''}원`;
};

// share 문자열(0~1) → 표시용 정수 백분율(0~100). 검증에 실패한 값을 0%로 대체하지 않고 throw한다.
// 부동소수점 오차(0.285 * 100 = 28.499…)를 피하려고 소수 셋째 자리까지만 문자열로 읽어 반올림(half-up)한다.
export const shareToPercent = share => {
  if (typeof share !== 'string' || !SHARE_PATTERN.test(share)) throw invalidData('share');

  const [whole, fraction = ''] = share.split('.');
  if (whole === '1') return 100;

  const digits = `${fraction}000`;
  const percent = Number.parseInt(digits.slice(0, 2), 10);
  return digits[2] >= '5' ? percent + 1 : percent;
};

// '2026-09' → '2026년 9월'. 형식이 맞지 않으면 값을 만들지 않고 null.
export const formatYearMonthLabel = yearMonth => {
  if (!isValidRecapYearMonth(yearMonth)) return null;
  const [year, month] = yearMonth.split('-');
  return `${year}년 ${month.replace(/^0/, '')}월`;
};

// ── 서버 모델 → 기존 스토리 data 매핑 ────────────────────────

const isString = value => typeof value === 'string';

const requireModelString = (model, key, field) => {
  if (!hasOwn(model, key) || !isString(model[key])) throw invalidData(`${field}.${key}`);
  return model[key];
};

// null 또는 문자열이어야 하고 키 자체는 반드시 있어야 한다(필드명 불일치가 undefined로 숨지 않게).
const requireNullableModelString = (model, key, field) => {
  if (!hasOwn(model, key) || (model[key] !== null && !isString(model[key]))) {
    throw invalidData(`${field}.${key}`);
  }
  return model[key];
};

const formatModelAmount = (model, key, field) => {
  const value = requireModelString(model, key, field);
  try {
    return formatWonString(value);
  } catch {
    throw invalidData(`${field}.${key}`);
  }
};

// recapApi.mapRecapResponse가 반환한 모델로 buildMoneyRecapStories(data)에 넘길 data를 만든다.
// data에는 cover / summary / category / insights만 들어간다. hourly, comparison, closing, 등급·점수·요일 키는 만들지 않는다.
// 입력 모델을 변경하지 않는다.
export const buildRecapStoriesData = recap => {
  const field = 'recap';
  if (!isPlainObject(recap)) throw invalidData(field);

  const yearMonth = requireModelString(recap, 'yearMonth', field);
  const period = formatYearMonthLabel(yearMonth);
  if (period === null) throw invalidData(`${field}.yearMonth`);

  const income = formatModelAmount(recap, 'totalIncome', field);
  const expense = formatModelAmount(recap, 'totalExpense', field);
  const transfer = formatModelAmount(recap, 'totalTransfer', field);
  const netSaving = formatModelAmount(recap, 'netSaving', field);

  if (!hasOwn(recap, 'categories') || !Array.isArray(recap.categories)) {
    throw invalidData(`${field}.categories`);
  }
  const categories = recap.categories.map((category, index) => {
    const categoryField = `categories[${index}]`;
    if (!isPlainObject(category)) throw invalidData(categoryField);
    return {
      key: requireModelString(category, 'code', categoryField),
      label: requireModelString(category, 'label', categoryField),
      percent: shareToPercent(requireModelString(category, 'share', categoryField)),
    };
  });

  const nickname = requireNullableModelString(recap, 'nickname', field);
  const nicknameReason = requireNullableModelString(recap, 'nicknameReason', field);

  if (!hasOwn(recap, 'coverage') || !isPlainObject(recap.coverage)) {
    throw invalidData(`${field}.coverage`);
  }
  if (typeof recap.coverage.isReliable !== 'boolean') {
    throw invalidData(`${field}.coverage.isReliable`);
  }
  const note = requireModelString(recap.coverage, 'note', `${field}.coverage`);

  if (
    !hasOwn(recap, 'insights') ||
    !Array.isArray(recap.insights) ||
    !recap.insights.every(isString)
  ) {
    throw invalidData(`${field}.insights`);
  }

  // 별명/이유는 서버가 준 값만 쓴다. null이면 키를 만들지 않는다.
  const cover = { titleLines: ['머니', '리캡'], period };
  if (nickname !== null) cover.badgeLabel = nickname;
  if (nicknameReason !== null) cover.summaryText = nicknameReason;

  const summary = {
    eyebrow: '이달의 소비 요약',
    title: '이런 소비 패턴이었어요',
    metrics: [
      { key: 'income', label: '수입', value: income },
      { key: 'expense', label: '소비 지출', value: expense },
      { key: 'transfer', label: '자금이동', value: transfer },
      { key: 'netSaving', label: '순저축', value: netSaving, accent: true },
    ],
  };
  // 해석이 제한되는 달에만 서버 안내 문구를 원문 그대로 보여준다.
  if (recap.coverage.isReliable === false && note.trim() !== '') summary.safeChipText = note;

  const data = { cover, summary };

  if (categories.length > 0) {
    data.category = {
      eyebrow: '소비 습관 분석',
      titleLines: ['무엇에', '썼을까?'],
      categoryCardLabel: '카테고리 비중',
      categories,
    };
  }

  if (recap.insights.length > 0) {
    data.insights = {
      badgeLabel: '이달의 인사이트',
      title: 'Moaje가 분석했어요',
      insights: recap.insights.map((body, index) => ({ key: `insight-${index}`, body })),
    };
  }

  return data;
};

// MoneyRecapEntry가 읽는 필드를 모두 채운다(배열은 항상 배열). 서버 값은 월 라벨뿐이다.
export const buildRecapEntryViewModel = yearMonth => {
  const label = formatYearMonthLabel(yearMonth);
  return {
    periodLabel: label ?? '',
    titleLines: ['머니 리캡'],
    headlineLines: label ? [`${label} 소비를`, '돌아봐요'] : ['소비를 돌아봐요'],
    subtitleLines: ['월별 소비 요약과 인사이트를', '확인해봐요.'],
    ctaLabel: '리캡 보기',
  };
};

// ── 로딩 결과 / 빈 상태 / 오류 ───────────────────────────────

export const RECAP_EMPTY_REASON = Object.freeze({
  NO_MONTHS: 'NO_MONTHS', // API-37: months []
  NO_RECAP: 'NO_RECAP', // API-38: 404 (해당 월 집계 없음)
});

const failureOf = error => {
  const errorType = getRecapErrorType(error);
  if (errorType === RECAP_ERROR_TYPE.CANCELED) return { ok: false, canceled: true };
  return { ok: false, errorType };
};

// API-37. fetcher는 fetchRecapMonths(userId) 형태의 함수를 주입한다.
// 반환: { ok: true, months } | { ok: false, empty: true, reason } | { ok: false, canceled: true } | { ok: false, errorType }
export const loadRecapMonths = async (userId, { fetcher }) => {
  try {
    const months = await fetcher(userId);
    if (!Array.isArray(months)) throw invalidData('months');
    if (months.length === 0) {
      return { ok: false, empty: true, reason: RECAP_EMPTY_REASON.NO_MONTHS };
    }
    return { ok: true, months };
  } catch (error) {
    return failureOf(error);
  }
};

// API-38. fetcher는 fetchRecap(userId, yearMonth) 형태의 함수를 주입한다.
// 404(해당 월 집계 없음)는 오류가 아니라 빈 상태다. 모델→스토리 data 매핑이 실패하면 INVALID_RESPONSE.
export const loadRecap = async (userId, yearMonth, { fetcher }) => {
  try {
    const recap = await fetcher(userId, yearMonth);
    const storiesData = buildRecapStoriesData(recap);
    return { ok: true, recap, storiesData };
  } catch (error) {
    const result = failureOf(error);
    if (result.errorType === RECAP_ERROR_TYPE.NOT_FOUND) {
      return { ok: false, empty: true, reason: RECAP_EMPTY_REASON.NO_RECAP };
    }
    return result;
  }
};

// ── 오류 재시도·안내 정책 (단일 출처) ────────────────────────
// 재시도는 항상 사용자가 버튼을 눌렀을 때만이다(자동 재시도·폴링 없음).
// 401은 apiClient가 refresh를 이미 1회 시도했고, 실패하면 앱의 세션 만료 처리가 로그인으로 전환한다.
// 이 모듈은 토큰 삭제·로그아웃·이동을 하지 않고 안내와 재시도 여부만 정한다.
// 재시도 불가 유형에는 '다시 시도' 문구를 붙이지 않는다. 문구에 user_id·월·토큰·서버 원문은 넣지 않는다.
const T = RECAP_ERROR_TYPE;
const FORM_ERROR_MESSAGE = '요청 형식이 올바르지 않아 불러올 수 없어요.';

export const RECAP_ERROR_POLICY = Object.freeze({
  [T.NETWORK]: { retryable: true, message: describeErrorType(T.NETWORK) },
  [T.TIMEOUT]: { retryable: true, message: describeErrorType(T.TIMEOUT) },
  [T.SERVER]: { retryable: true, message: describeErrorType(T.SERVER) },
  [T.INVALID_RESPONSE]: { retryable: true, message: describeErrorType(T.INVALID_RESPONSE) },
  [T.UNKNOWN]: { retryable: true, message: describeErrorType(T.UNKNOWN) },
  [T.UNAUTHORIZED]: { retryable: false, message: describeErrorType(T.UNAUTHORIZED) },
  [T.FORBIDDEN]: { retryable: false, message: describeErrorType(T.FORBIDDEN) },
  [T.BAD_REQUEST]: { retryable: false, message: FORM_ERROR_MESSAGE },
  [T.VALIDATION]: { retryable: false, message: FORM_ERROR_MESSAGE },
  [T.CLIENT_ERROR]: { retryable: false, message: '요청을 처리할 수 없어요.' },
  [T.NOT_FOUND]: { retryable: false, message: '요청한 정보를 찾을 수 없어요.' },
  [T.INVALID_REQUEST]: { retryable: false, message: '사용자 정보를 확인할 수 없어요.' },
  [T.CONFIG]: { retryable: false, message: describeErrorType(T.CONFIG) },
});

const policyOf = errorType =>
  hasOwn(RECAP_ERROR_POLICY, errorType) ? RECAP_ERROR_POLICY[errorType] : null;

export const canRetryRecapError = errorType => policyOf(errorType)?.retryable === true;

// 표에 없는 유형은 재시도 불가 + 일반 문구.
export const describeRecapError = errorType =>
  policyOf(errorType)?.message ?? '요청을 처리하지 못했어요.';

const EMPTY_MESSAGES = {
  [RECAP_EMPTY_REASON.NO_MONTHS]: {
    title: '아직 머니 리캡이 없어요',
    message: '거래 내역이 쌓이면 월별 리캡을 볼 수 있어요.',
  },
  [RECAP_EMPTY_REASON.NO_RECAP]: {
    title: '이 달의 리캡이 아직 없어요',
    message: '다른 달을 선택해 보세요.',
  },
};

export const describeRecapEmpty = reason =>
  EMPTY_MESSAGES[reason] ?? EMPTY_MESSAGES[RECAP_EMPTY_REASON.NO_RECAP];

// ── 세션 컨트롤러 ────────────────────────────────────────────
// 화면이 ref로 들고 있는 React 비의존 스토어(getSnapshot/subscribe). 모듈 전역 상태·저장소 사용 없음.
// 규칙: 월 선택은 요청 없음 / 같은 요청 중복 방지 / 사용자·월 변경·닫기 뒤의 늦은 응답 차단 /
//       성공 응답만 사용자+월 키로 메모리 캐시 / 실패·404·취소 결과는 캐시 금지.

export const RECAP_SESSION_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
});

const S = RECAP_SESSION_STATUS;

const RECAP_IDLE_PATCH = Object.freeze({
  recapStatus: S.IDLE,
  recapMonth: null,
  storiesData: null,
  recapErrorType: null,
  recapEmptyReason: null,
  recapRetryable: false,
});

const createInitialSnapshot = userId =>
  Object.freeze({
    userId,
    monthsStatus: S.IDLE,
    months: Object.freeze([]),
    selectedMonth: null,
    monthsErrorType: null,
    monthsRetryable: false,
    ...RECAP_IDLE_PATCH,
  });

const cacheKeyOf = (userId, yearMonth) => `${userId}:${yearMonth}`;

export const createRecapSession = ({ fetchMonths, fetchRecap } = {}) => {
  if (typeof fetchMonths !== 'function' || typeof fetchRecap !== 'function') {
    throw new TypeError('fetchMonths와 fetchRecap 함수가 필요합니다.');
  }

  const monthsGate = createRequestGate();
  const recapGate = createRequestGate();
  const listeners = new Set();
  let cache = new Map(); // `${userId}:${yearMonth}` → { recap, storiesData }. 성공 응답만.
  let monthsInFlight = null; // { promise }
  let recapInFlight = null; // { key, promise }
  let lastRecapError = null; // { key, retryable }
  let snapshot = createInitialSnapshot(null);

  const commit = patch => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    [...listeners].forEach(listener => listener());
  };

  const resetAll = userId => {
    monthsGate.invalidate();
    recapGate.invalidate();
    cache = new Map();
    monthsInFlight = null;
    recapInFlight = null;
    lastRecapError = null;
    snapshot = createInitialSnapshot(userId);
  };

  const getSnapshot = () => snapshot;

  const subscribe = listener => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // 사용자가 바뀌면 이전 사용자의 결과·캐시·진행 중 요청을 모두 버린다. 같은 사용자면 아무것도 하지 않는다.
  const setUser = userId => {
    if (userId === snapshot.userId) return;
    resetAll(userId);
    [...listeners].forEach(listener => listener());
  };

  const loadMonths = () => {
    if (monthsInFlight) return monthsInFlight.promise;
    if (snapshot.monthsStatus === S.READY || snapshot.monthsStatus === S.EMPTY) {
      return Promise.resolve();
    }
    // 재시도 불가 오류(401/403/400/422 등)에서는 같은 요청을 다시 보내지 않는다.
    if (snapshot.monthsStatus === S.ERROR && !snapshot.monthsRetryable) return Promise.resolve();

    const { userId } = snapshot;
    const token = monthsGate.begin(userId);
    commit({ monthsStatus: S.LOADING, monthsErrorType: null, monthsRetryable: false });

    const entry = {};
    entry.promise = (async () => {
      const result = await loadRecapMonths(userId, { fetcher: fetchMonths });
      if (monthsInFlight === entry) monthsInFlight = null;
      if (!monthsGate.isCurrent(token)) return; // 사용자 변경·dispose 뒤의 늦은 응답

      if (result.ok) {
        const keepSelection = result.months.includes(snapshot.selectedMonth);
        commit({
          monthsStatus: S.READY,
          months: Object.freeze([...result.months]),
          selectedMonth: keepSelection ? snapshot.selectedMonth : result.months[0], // 최신 월 기본 선택
          monthsErrorType: null,
          monthsRetryable: false,
        });
      } else if (result.empty) {
        commit({
          monthsStatus: S.EMPTY,
          months: Object.freeze([]),
          selectedMonth: null,
          monthsErrorType: null,
          monthsRetryable: false,
        });
      } else if (result.canceled) {
        commit({ monthsStatus: S.IDLE, monthsErrorType: null, monthsRetryable: false });
      } else {
        commit({
          monthsStatus: S.ERROR,
          monthsErrorType: result.errorType,
          monthsRetryable: canRetryRecapError(result.errorType),
        });
      }
    })();
    monthsInFlight = entry;
    return entry.promise;
  };

  // 월 선택은 선택 상태만 바꾼다. API-38은 호출하지 않는다.
  const selectMonth = yearMonth => {
    if (snapshot.recapStatus === S.LOADING) return false;
    if (!snapshot.months.includes(yearMonth)) return false;
    if (snapshot.selectedMonth === yearMonth) return true;
    commit({ selectedMonth: yearMonth, ...RECAP_IDLE_PATCH });
    return true;
  };

  const openRecap = (yearMonth = snapshot.selectedMonth) => {
    if (!isValidRecapYearMonth(yearMonth)) {
      commit({
        ...RECAP_IDLE_PATCH,
        recapStatus: S.ERROR,
        recapErrorType: RECAP_ERROR_TYPE.INVALID_REQUEST,
      });
      return Promise.resolve();
    }

    const { userId } = snapshot;
    const key = cacheKeyOf(userId, yearMonth);

    // 1) 같은 사용자·월의 성공 캐시가 있으면 요청 없이 보여준다. 진행 중이던 다른 요청은 폐기한다.
    const cached = cache.get(key);
    if (cached) {
      recapGate.invalidate();
      recapInFlight = null;
      lastRecapError = null;
      if (
        snapshot.recapStatus !== S.READY ||
        snapshot.recapMonth !== yearMonth ||
        snapshot.storiesData !== cached.storiesData
      ) {
        commit({
          ...RECAP_IDLE_PATCH,
          recapStatus: S.READY,
          recapMonth: yearMonth,
          storiesData: cached.storiesData,
        });
      }
      return Promise.resolve();
    }

    // 2) 같은 키가 이미 진행 중이면 새 요청을 만들지 않는다(연타·중복 호출 방지).
    if (recapInFlight && recapInFlight.key === key) return recapInFlight.promise;

    // 3) 같은 키의 마지막 오류가 재시도 불가면 같은 요청을 다시 보내지 않는다.
    if (lastRecapError && lastRecapError.key === key && !lastRecapError.retryable) {
      return Promise.resolve();
    }

    // 4) 새 요청. begin()이 이전 토큰(다른 월/닫기 전 요청)을 무효화한다.
    const token = recapGate.begin(key);
    commit({ ...RECAP_IDLE_PATCH, recapStatus: S.LOADING, recapMonth: yearMonth });

    const entry = { key };
    entry.promise = (async () => {
      const result = await loadRecap(userId, yearMonth, { fetcher: fetchRecap });
      if (recapInFlight === entry) recapInFlight = null;
      // 사용자 변경·월 변경·닫기·dispose 뒤의 늦은 응답은 상태·캐시·리스너 모두 건드리지 않는다.
      if (!recapGate.isCurrent(token)) return;

      if (result.ok) {
        cache.set(key, { recap: result.recap, storiesData: result.storiesData });
        lastRecapError = null;
        commit({
          ...RECAP_IDLE_PATCH,
          recapStatus: S.READY,
          recapMonth: yearMonth,
          storiesData: result.storiesData,
        });
      } else if (result.empty) {
        lastRecapError = null;
        commit({
          ...RECAP_IDLE_PATCH,
          recapStatus: S.EMPTY,
          recapMonth: yearMonth,
          recapEmptyReason: result.reason,
        });
      } else if (result.canceled) {
        lastRecapError = null;
        commit({ ...RECAP_IDLE_PATCH });
      } else {
        const retryable = canRetryRecapError(result.errorType);
        lastRecapError = { key, retryable };
        commit({
          ...RECAP_IDLE_PATCH,
          recapStatus: S.ERROR,
          recapMonth: yearMonth,
          recapErrorType: result.errorType,
          recapRetryable: retryable,
        });
      }
    })();
    recapInFlight = entry;
    return entry.promise;
  };

  // 뒤로가기·스토리 닫기·로딩 중 이탈. 진행 중 API-38 요청의 gate를 무효화하고 in-flight를 비운다.
  // 기존 성공 캐시는 유지하며, 취소된 요청의 결과는 도착해도 상태·캐시를 바꾸지 못한다. months(API-37)는 영향 없음.
  const closeRecap = () => {
    recapGate.invalidate();
    recapInFlight = null;
    lastRecapError = null;
    if (snapshot.recapStatus !== S.IDLE) commit({ ...RECAP_IDLE_PATCH });
  };

  // 화면 이탈: 진행 중 요청 무효화, 캐시·in-flight·listener 폐기, 초기 상태로 리셋(재사용 가능).
  const dispose = () => {
    resetAll(null);
    listeners.clear();
  };

  return {
    getSnapshot,
    subscribe,
    setUser,
    loadMonths,
    selectMonth,
    openRecap,
    closeRecap,
    dispose,
  };
};
