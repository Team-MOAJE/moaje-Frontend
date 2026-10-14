// 미래 자금 시뮬레이션 화면 로직 (API-39/40/41). React / react-native / Redux / AsyncStorage에 의존하지 않는 순수 모듈이다.
// 아직 어떤 화면에도 연결되어 있지 않다(UI는 3부).
//
// 원칙
// - 목표 금액·현금흐름·gap·달성 개월·진행률·advice·message는 모두 서버가 계산한 값이다. 이 모듈은 그 문자열을 표시용으로
//   포맷할 뿐 합산·차감·비율 재계산·연/월 환산을 하지 않는다. 금액은 문자열로만 다루며 Number로 바꾸지 않는다.
// - 요청이 실패하면 값을 만들지 않는다(가짜 0원·기본값 없음). 오류 종류만 돌려준다.
// - API-40/41은 POST이고 서버가 호출할 때마다 지표를 기록한다. 그래서 입력 변경·구독·사용자 변경으로는 요청하지 않고,
//   자동 재시도·타이머·디바운스도 없다. 사용자가 '계산하기'/'조정 계산'을 눌렀을 때만 submit*을 부른다.
// - API-40 결과와 API-41 결과는 독립적으로 관리한다. API-41은 API-40이 제출한 입력을 그대로 전달하고, API-41 응답의
//   base 값으로 API-40 결과를 대체하지 않는다.
// - 입력은 simulatorApi.js의 모델(camelCase)이다. API 함수는 세션 생성 시 주입한다(simulatorApi를 직접 호출하지 않는다).
import { createRequestGate, describeErrorType } from '../onboarding/workOnboardingScreenLogic';
import { isValidOnboardingUserId } from '../onboarding/onboardingApi';
import { describeAssetSource } from './readinessScreenLogic';
import { formatWonString } from '../moneyRecap/recapScreenLogic';
import { SIMULATOR_ERROR_TYPE, getSimulatorErrorType } from './simulatorApi';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 화면 로직이 받은 모델이 계약과 다를 때. getSimulatorErrorType이 INVALID_RESPONSE로 분류한다.
const invalidData = field => {
  const error = new Error('시뮬레이션 데이터를 해석할 수 없습니다.');
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

// ── 입력 폼 ──────────────────────────────────────────────────

// 표시 순서 고정. key는 simulatorApi가 받는 camelCase 입력 키와 같다.
export const SIMULATOR_FIELDS = Object.freeze([
  { key: 'monthlyIncome', label: '세후 월수입', hint: '입력하지 않으면 기본값으로 계산해요.' },
  { key: 'monthlyHousing', label: '월 주거비', hint: '입력하지 않으면 기본값으로 계산해요.' },
  { key: 'monthlyLiving', label: '월 기본 생활비', hint: '입력하지 않으면 기본값으로 계산해요.' },
  { key: 'monthlyLeisure', label: '월 여가비', hint: '입력하지 않으면 기본값으로 계산해요.' },
  { key: 'deposit', label: '보증금', hint: '입력하지 않으면 기본값으로 계산해요.' },
  { key: 'moveInCost', label: '초기 정착 비용', hint: '입력하지 않으면 기본값으로 계산해요.' },
  {
    key: 'currentAsset',
    label: '현재 자산',
    hint: '입력하지 않으면 연결된 계좌 정보를 확인해 계산해요.',
  },
]);

export const createEmptyForm = () =>
  Object.fromEntries(SIMULATOR_FIELDS.map(field => [field.key, '']));

// UI 입력 가드(서버 규칙이 아님). 쉼표 제거 후 자릿수 기준.
export const MAX_AMOUNT_DIGITS = 15;

export const AMOUNT_INPUT_ERROR = Object.freeze({
  BAD_FORMAT: 'BAD_FORMAT', // 공백·쉼표 형식 오류
  NOT_DIGITS: 'NOT_DIGITS', // 숫자 외 문자(음수·소수·지수 포함)
  LEADING_ZERO: 'LEADING_ZERO',
  TOO_LONG: 'TOO_LONG',
});

const PLAIN_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;
// 올바른 천 단위 쉼표: 첫 묶음 1~3자리(선행 0 불가) + 3자리 묶음 1개 이상.
const GROUPED_INTEGER_PATTERN = /^[1-9]\d{0,2}(?:,\d{3})+$/;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const SEPARATOR_PATTERN = /[,\s]/;

// 금액 입력 텍스트 → { empty:true } | { ok:true, value } | { ok:false, error }
// - 앞뒤 공백만 제거한다. 내부 공백("1 2")은 합치지 않고 오류다.
// - 쉼표는 올바른 천 단위 형식일 때만 제거한다("1,000" → "1000"). "1,2"·"1,00" 같은 형식은 오류다.
// - 반환 value는 Number로 바꾸지 않은 문자열이다.
export const normalizeAmountInput = text => {
  if (text === undefined || text === null) return { empty: true };
  if (typeof text !== 'string') return { ok: false, error: AMOUNT_INPUT_ERROR.BAD_FORMAT };

  const trimmed = text.trim();
  if (trimmed === '') return { empty: true };

  let value;
  if (GROUPED_INTEGER_PATTERN.test(trimmed)) {
    value = trimmed.replace(/,/g, '');
  } else if (PLAIN_INTEGER_PATTERN.test(trimmed)) {
    value = trimmed;
  } else if (DIGITS_ONLY_PATTERN.test(trimmed)) {
    return { ok: false, error: AMOUNT_INPUT_ERROR.LEADING_ZERO };
  } else if (SEPARATOR_PATTERN.test(trimmed)) {
    return { ok: false, error: AMOUNT_INPUT_ERROR.BAD_FORMAT };
  } else {
    return { ok: false, error: AMOUNT_INPUT_ERROR.NOT_DIGITS };
  }

  if (value.length > MAX_AMOUNT_DIGITS) return { ok: false, error: AMOUNT_INPUT_ERROR.TOO_LONG };
  return { ok: true, value };
};

const FIELD_ERROR_MESSAGES = {
  [AMOUNT_INPUT_ERROR.BAD_FORMAT]:
    '숫자만 입력해 주세요. 쉼표는 1,000처럼 천 단위로만 쓸 수 있어요.',
  [AMOUNT_INPUT_ERROR.NOT_DIGITS]: '0 이상의 정수만 입력할 수 있어요.',
  [AMOUNT_INPUT_ERROR.LEADING_ZERO]: '앞에 0을 붙이지 않고 입력해 주세요.',
  [AMOUNT_INPUT_ERROR.TOO_LONG]: `${MAX_AMOUNT_DIGITS}자리 이하로 입력해 주세요.`,
  EMPTY: '금액을 입력해 주세요.',
  ZERO: '0원보다 큰 금액을 입력해 주세요.',
  BAD_DIRECTION: '줄이기 또는 늘리기를 선택해 주세요.',
};

export const describeFieldError = code =>
  hasOwn(FIELD_ERROR_MESSAGES, code) ? FIELD_ERROR_MESSAGES[code] : '입력값을 확인해 주세요.';

// 폼(텍스트) → simulatorApi 입력(camelCase 정수 문자열). 빈 항목은 키를 만들지 않는다(서버가 기준값으로 계산).
// 사용자가 명시한 "0"은 유효한 값으로 보낸다. currentAsset도 미입력이면 생략한다.
export const validateSimulatorForm = form => {
  const inputs = {};
  const fieldErrors = {};

  for (const { key } of SIMULATOR_FIELDS) {
    const parsed = normalizeAmountInput(form?.[key]);
    if (parsed.empty) continue;
    if (parsed.ok) inputs[key] = parsed.value;
    else fieldErrors[key] = parsed.error;
  }
  return { ok: Object.keys(fieldErrors).length === 0, inputs, fieldErrors };
};

// 입력 동일성 비교용 키(키 순서와 무관).
export const inputsKey = inputs =>
  JSON.stringify(
    Object.keys(inputs ?? {})
      .sort()
      .map(key => [key, inputs[key]])
  );

export const ADJUST_DIRECTION = Object.freeze({ SAVE: 'SAVE', INCREASE: 'INCREASE' });

// 조건부 시뮬레이션 입력 → monthly_delta 문자열. 부호는 문자열 접두로만 붙인다(산술 없음).
// SAVE(줄이기) → '-금액', INCREASE(늘리기) → '금액'. 0원은 비교 의미가 없어 거부한다.
export const validateAdjustForm = ({ direction, amount } = {}) => {
  if (direction !== ADJUST_DIRECTION.SAVE && direction !== ADJUST_DIRECTION.INCREASE) {
    return { ok: false, error: 'BAD_DIRECTION' };
  }
  const parsed = normalizeAmountInput(amount);
  if (parsed.empty) return { ok: false, error: 'EMPTY' };
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.value === '0') return { ok: false, error: 'ZERO' };

  return {
    ok: true,
    monthlyDelta: direction === ADJUST_DIRECTION.SAVE ? `-${parsed.value}` : parsed.value,
  };
};

// ── 요청 실행 래퍼 ───────────────────────────────────────────

// 반환: { ok:true, value } | { ok:false, canceled:true } | { ok:false, errorType }
// CANCELED(로그아웃·세션 교체로 요청이 취소됨)는 오류 화면으로 보이지 않도록 canceled로 구분한다.
export const runRequest = async fn => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const errorType = getSimulatorErrorType(error);
    if (errorType === SIMULATOR_ERROR_TYPE.CANCELED) return { ok: false, canceled: true };
    return { ok: false, errorType };
  }
};

// ── 오류 정책 ────────────────────────────────────────────────
// 401은 apiClient가 refresh를 이미 1회 시도했고, 실패하면 앱의 세션 만료 처리가 로그인으로 전환한다.
// 이 모듈은 토큰 삭제·로그아웃·이동을 하지 않고 안내와 재시도 여부만 정한다.
// 재시도는 항상 사용자의 버튼 탭이다. 재시도 불가 유형에는 '다시 시도' 문구를 붙이지 않는다.
// 문구에 user_id·토큰·입력 금액·서버 원문은 넣지 않는다.
const T = SIMULATOR_ERROR_TYPE;
const INPUT_ERROR_MESSAGE = '입력한 금액을 확인해 주세요.';

export const SIMULATOR_ERROR_POLICY = Object.freeze({
  [T.NETWORK]: { retryable: true, message: describeErrorType(T.NETWORK) },
  [T.TIMEOUT]: { retryable: true, message: describeErrorType(T.TIMEOUT) },
  [T.SERVER]: { retryable: true, message: describeErrorType(T.SERVER) },
  [T.INVALID_RESPONSE]: { retryable: true, message: describeErrorType(T.INVALID_RESPONSE) },
  [T.UNKNOWN]: { retryable: true, message: describeErrorType(T.UNKNOWN) },
  [T.UNAUTHORIZED]: { retryable: false, message: describeErrorType(T.UNAUTHORIZED) },
  [T.FORBIDDEN]: { retryable: false, message: describeErrorType(T.FORBIDDEN) },
  [T.CONFIG]: { retryable: false, message: describeErrorType(T.CONFIG) },
  [T.BAD_REQUEST]: { retryable: false, message: INPUT_ERROR_MESSAGE },
  [T.VALIDATION]: { retryable: false, message: INPUT_ERROR_MESSAGE },
  [T.INVALID_REQUEST]: { retryable: false, message: INPUT_ERROR_MESSAGE },
  [T.CLIENT_ERROR]: { retryable: false, message: '요청을 처리할 수 없어요.' },
  [T.NOT_FOUND]: { retryable: false, message: '요청한 정보를 찾을 수 없어요.' },
});

const policyOf = errorType =>
  hasOwn(SIMULATOR_ERROR_POLICY, errorType) ? SIMULATOR_ERROR_POLICY[errorType] : null;

export const canRetrySimulatorError = errorType => policyOf(errorType)?.retryable === true;

// 표에 없는 유형은 재시도 불가 + 일반 문구.
export const describeSimulatorError = errorType =>
  policyOf(errorType)?.message ?? '요청을 처리하지 못했어요.';

// ── 표시 변환 ────────────────────────────────────────────────

const SHARE_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

// 0~1 비율 문자열 → 퍼센트 문자열. 소수점을 문자열로 두 칸 옮길 뿐 반올림·부동소수 계산이 없다.
// "0.0685" → "6.85%", "0.158" → "15.8%", "1.0" → "100%". 형식이 맞지 않으면 0% 등으로 대체하지 않고 throw한다.
export const ratioToPercentText = share => {
  if (typeof share !== 'string' || !SHARE_PATTERN.test(share)) throw invalidData('ratio');

  const [whole, fraction = ''] = share.split('.');
  if (whole === '1') return '100%';

  const digits = fraction.padEnd(2, '0');
  const integerPart = digits.slice(0, 2).replace(/^0+(?=\d)/, '');
  const fractionPart = digits.slice(2).replace(/0+$/, '');
  return `${integerPart}${fractionPart ? `.${fractionPart}` : ''}%`;
};

// 소수 뒤쪽 0만 제거한 비교용 문자열("1300000.0" → "1300000", "-0.00" → "0"). 산술이 아니라 표기 정규화다.
const normalizeDecimalString = value => {
  const parts = typeof value === 'string' ? DECIMAL_PATTERN.exec(value) : null;
  if (!parts) return null;
  const [, sign, integerPart, fraction = ''] = parts;
  const trimmed = fraction.replace(/0+$/, '');
  if (integerPart.replace(/^0+/, '') === '' && trimmed === '') return '0';
  return `${sign}${integerPart}${trimmed ? `.${trimmed}` : ''}`;
};

const isNegativeAmount = value => typeof value === 'string' && value.startsWith('-');

const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;

// 달성 개월 수. null(월 저축 가능액이 0 이하라 계산 불가)과 0(이미 달성)과 양수를 서로 바꾸지 않는다.
export const MONTHS_VIEW_KIND = Object.freeze({
  UNREACHABLE: 'UNREACHABLE',
  REACHED: 'REACHED',
  MONTHS: 'MONTHS',
});

export const describeMonthsToGoal = months => {
  if (months === null) {
    return {
      kind: MONTHS_VIEW_KIND.UNREACHABLE,
      months: null,
      text: '달성 시점을 계산할 수 없어요',
    };
  }
  if (!isNonNegativeInteger(months)) throw invalidData('monthsToGoal');
  if (months === 0) {
    return { kind: MONTHS_VIEW_KIND.REACHED, months: 0, text: '이미 목표 금액에 도달했어요' };
  }
  return { kind: MONTHS_VIEW_KIND.MONTHS, months, text: `${months}개월` };
};

// months_saved: 양수 = 앞당겨짐, 0 = 변화 없음, 음수 = 늦어짐, null = 비교 불가.
export const MONTHS_SAVED_KIND = Object.freeze({
  FASTER: 'FASTER',
  SAME: 'SAME',
  SLOWER: 'SLOWER',
  UNKNOWN: 'UNKNOWN',
});

export const describeMonthsSaved = monthsSaved => {
  if (monthsSaved === null) {
    return { kind: MONTHS_SAVED_KIND.UNKNOWN, months: null, text: '비교할 수 없어요' };
  }
  if (!Number.isInteger(monthsSaved)) throw invalidData('monthsSaved');
  if (monthsSaved > 0) {
    return { kind: MONTHS_SAVED_KIND.FASTER, months: monthsSaved, text: `${monthsSaved}개월 단축` };
  }
  if (monthsSaved < 0) {
    const months = Math.abs(monthsSaved);
    return { kind: MONTHS_SAVED_KIND.SLOWER, months, text: `${months}개월 지연` };
  }
  return { kind: MONTHS_SAVED_KIND.SAME, months: 0, text: '변화 없음' };
};

// ── 기준값 표시 모델 (API-39 목록, API-40 응답의 baselines 공용) ──

export const BASELINE_UNIT = Object.freeze({
  WON: 'WON',
  MONTHS: 'MONTHS',
  RATIO: 'RATIO',
  RAW: 'RAW',
});

// 서버가 단위를 주지 않으므로 알려진 key만 단위를 부여한다. 목록에 없는 key는 RAW(원문, 단위 없음).
const MONTHS_KEYS = new Set(['emergency_months']);
const RATIO_KEYS = new Set(['rir_ratio']);
const WON_KEYS = new Set([
  'deposit_reference',
  'leisure_monthly',
  'living_base_monthly',
  'move_in_cost',
  'housing_deposit_with_family',
  'housing_deposit_monthly_rent',
  'housing_deposit_jeonse',
  'housing_deposit_dorm',
  'income_large_corp',
  'income_startup',
  'income_freelance',
]);

const KIND_LABELS = {
  STATISTIC: '공표 통계',
  DERIVED: '통계 기반 계산',
  ASSUMPTION: '모아제 가정(통계 아님)',
};

const describeBaselineAmount = (key, amount) => {
  try {
    if (MONTHS_KEYS.has(key)) return { unit: BASELINE_UNIT.MONTHS, text: `${amount}개월` };
    if (RATIO_KEYS.has(key)) return { unit: BASELINE_UNIT.RATIO, text: ratioToPercentText(amount) };
    if (WON_KEYS.has(key)) return { unit: BASELINE_UNIT.WON, text: formatWonString(amount) };
  } catch {
    // 알려진 key인데 값이 해당 단위로 읽히지 않으면 추측하지 않고 원문을 보여준다.
  }
  return { unit: BASELINE_UNIT.RAW, text: amount };
};

// 서버 순서와 개수를 그대로 유지한다(개수를 가정하지 않는다). 원문 필드는 보존한다.
export const buildBaselineViewModel = baselines =>
  baselines.map(baseline => {
    const { unit, text } = describeBaselineAmount(baseline.key, baseline.amount);
    return {
      key: baseline.key,
      label: baseline.label,
      kind: baseline.kind,
      kindLabel: hasOwn(KIND_LABELS, baseline.kind) ? KIND_LABELS[baseline.kind] : baseline.kind,
      isAssumption: baseline.kind === 'ASSUMPTION',
      unit,
      amountText: text,
      rawAmount: baseline.amount,
      source: baseline.source,
      asOf: baseline.asOf,
      scope: baseline.scope,
      url: baseline.url,
      hasUrl: baseline.url !== '',
    };
  });

// ── 결과 표시 모델 ───────────────────────────────────────────

const TARGET_ROWS = [
  ['deposit', '보증금'],
  ['moveInCost', '초기 정착 비용'],
  ['emergencyFund', '비상금'],
  ['total', '목표 금액'],
];

const CASHFLOW_ROWS = [
  ['income', '월수입'],
  ['housing', '주거비'],
  ['living', '기본 생활비'],
  ['leisure', '여가비'],
  ['expense', '월 지출'],
  ['savable', '월 저축 가능액'],
];

const buildRows = (source, rows) =>
  rows.map(([key, label]) => ({
    key,
    label,
    text: formatWonString(source[key]),
    isNegative: isNegativeAmount(source[key]),
  }));

// API-40 결과(simulatorApi.mapSimulationResponse 모델) → 화면 표시 모델. 서버 값을 포맷만 한다.
export const buildSimulationViewModel = result => {
  const baselineLabels = new Map(result.baselines.map(baseline => [baseline.key, baseline.label]));

  return {
    targetRows: buildRows(result.target, TARGET_ROWS),
    cashflowRows: buildRows(result.cashflow, CASHFLOW_ROWS),
    currentAssetText: formatWonString(result.currentAsset),
    gapText: formatWonString(result.gap),
    months: describeMonthsToGoal(result.monthsToGoal),
    progressText: ratioToPercentText(result.progressRate),
    assetSource: result.assetSource,
    assetNotice: describeAssetSource(result.assetSource),
    // 서버가 가정값으로 계산했다고 알린 key 원문. 라벨은 응답 baselines에서만 찾고 없으면 key를 그대로 쓴다.
    assumedKeys: [...result.assumedKeys],
    assumedItems: result.assumedKeys.map(key => ({ key, label: baselineLabels.get(key) ?? key })),
    advice: [...result.advice],
    baselines: buildBaselineViewModel(result.baselines),
  };
};

const BASE_DIFFERS_NOTICE =
  '계산 시점의 자산 정보 차이로 이 기준 값이 위 계산 결과와 다를 수 있어요.';

// API-41 결과(simulatorApi.mapAdjustmentResponse 모델) → 화면 표시 모델.
// simulationResult를 주면 API-40과 base 값이 다른지 플래그만 알려준다. 어느 쪽 값도 덮어쓰지 않는다.
export const buildAdjustmentViewModel = (adjustment, simulationResult = null) => {
  const baseSavableDiffers =
    simulationResult !== null &&
    normalizeDecimalString(adjustment.baseMonthlySavable) !==
      normalizeDecimalString(simulationResult.cashflow.savable);
  const baseMonthsDiffers =
    simulationResult !== null && adjustment.baseMonthsToGoal !== simulationResult.monthsToGoal;
  const baseDiffersFromSimulation = baseSavableDiffers || baseMonthsDiffers;

  return {
    // 서버 문구 원문. 프론트가 문장을 다시 만들지 않는다.
    message: adjustment.message,
    monthlyDeltaText: formatWonString(adjustment.monthlyDelta),
    baseSavableText: formatWonString(adjustment.baseMonthlySavable),
    adjustedSavableText: formatWonString(adjustment.adjustedMonthlySavable),
    adjustedSavableIsNegative: isNegativeAmount(adjustment.adjustedMonthlySavable),
    baseMonths: describeMonthsToGoal(adjustment.baseMonthsToGoal),
    adjustedMonths: describeMonthsToGoal(adjustment.adjustedMonthsToGoal),
    monthsSaved: describeMonthsSaved(adjustment.monthsSaved),
    baseDiffersFromSimulation,
    baseNotice: baseDiffersFromSimulation ? BASE_DIFFERS_NOTICE : null,
  };
};

// ── 세션 컨트롤러 ────────────────────────────────────────────
// 화면이 ref로 들고 있는 React 비의존 스토어(getSnapshot/subscribe). 모듈 전역 상태·저장소·타이머 사용 없음.
// 규칙: 입력 변경·구독은 요청 없음 / POST는 submit* 호출(버튼 탭)로만 / 동시 POST 차단 /
//       사용자 변경·dispose·재제출·API-41 입력 변경 뒤의 늦은 응답 폐기 / API-40·API-41 결과 독립.

export const SIMULATOR_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export const SUBMIT_REJECT = Object.freeze({
  IN_FLIGHT: 'IN_FLIGHT',
  NO_USER: 'NO_USER',
  INVALID_INPUT: 'INVALID_INPUT',
  BLOCKED: 'BLOCKED',
  NEEDS_SIMULATION: 'NEEDS_SIMULATION',
  STALE: 'STALE',
  DISPOSED: 'DISPOSED',
});

const S = SIMULATOR_STATUS;

const initialBaselines = () =>
  Object.freeze({
    status: S.IDLE,
    items: Object.freeze([]),
    viewModel: Object.freeze([]),
    errorType: null,
    retryable: false,
  });

const initialSimulation = () =>
  Object.freeze({
    status: S.IDLE,
    result: null,
    viewModel: null,
    errorType: null,
    retryable: false,
    submittedInputs: null,
    runId: 0,
  });

const initialAdjustment = () =>
  Object.freeze({
    status: S.IDLE,
    result: null,
    viewModel: null,
    errorType: null,
    retryable: false,
    submittedDelta: null,
  });

const rawFormKey = form => JSON.stringify(SIMULATOR_FIELDS.map(({ key }) => form[key]));
const rawAdjustKey = adjustForm => JSON.stringify([adjustForm.direction, adjustForm.amount]);

export const createSimulatorSession = ({ fetchBaselines, runSimulation, runAdjustment } = {}) => {
  if (
    typeof fetchBaselines !== 'function' ||
    typeof runSimulation !== 'function' ||
    typeof runAdjustment !== 'function'
  ) {
    throw new TypeError('fetchBaselines, runSimulation, runAdjustment 함수가 필요합니다.');
  }

  const baselinesGate = createRequestGate();
  const simulationGate = createRequestGate();
  const adjustmentGate = createRequestGate();
  const listeners = new Set();

  let userId = null;
  let disposed = false;
  let form = createEmptyForm();
  let fieldErrors = {};
  let adjustForm = { direction: ADJUST_DIRECTION.SAVE, amount: '' };
  let adjustFormError = null;
  let baselines = initialBaselines();
  let simulation = initialSimulation();
  let adjustment = initialAdjustment();
  let baselinesInFlight = null; // { promise }
  let simulationToken = null; // 진행 중인 API-40 요청의 gate 토큰
  let adjustmentToken = null; // 진행 중인 API-41 요청의 gate 토큰
  let simulationBlock = null; // 재시도 불가 오류가 난 폼(원문 키). 입력이 바뀌면 해제
  let adjustmentBlock = null; // 재시도 불가 오류가 난 조정 입력(원문 키)
  let runCounter = 0;
  let snapshot = null;

  const isUserValid = () => isValidOnboardingUserId(userId);

  // 시뮬레이션 제출 이후 입력이 바뀌었는지. 폼이 유효하지 않으면 제출 값과 다른 것으로 본다.
  const computeStale = () => {
    if (simulation.status !== S.READY || simulation.submittedInputs === null) return false;
    const current = validateSimulatorForm(form);
    return !current.ok || inputsKey(current.inputs) !== inputsKey(simulation.submittedInputs);
  };

  const build = () => {
    const isBusy = simulationToken !== null || adjustmentToken !== null;
    const simulationStale = computeStale();
    const simulationBlocked = simulationBlock !== null && simulationBlock === rawFormKey(form);
    const adjustmentBlocked =
      adjustmentBlock !== null && adjustmentBlock === rawAdjustKey(adjustForm);

    return Object.freeze({
      userId,
      form: Object.freeze({ ...form }),
      fieldErrors: Object.freeze({ ...fieldErrors }),
      adjustForm: Object.freeze({ ...adjustForm }),
      adjustFormError,
      baselines,
      simulation,
      adjustment,
      isBusy,
      simulationStale,
      canRetryBaselines: baselines.status === S.ERROR && baselines.retryable,
      canSubmitSimulation: !disposed && isUserValid() && !isBusy && !simulationBlocked,
      canSubmitAdjustment:
        !disposed &&
        isUserValid() &&
        !isBusy &&
        simulation.status === S.READY &&
        !simulationStale &&
        !adjustmentBlocked,
    });
  };

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
    baselinesGate.invalidate();
    simulationGate.invalidate();
    adjustmentGate.invalidate();
    baselinesInFlight = null;
    simulationToken = null;
    adjustmentToken = null;
  };

  const resetAll = nextUserId => {
    invalidateRequests();
    userId = nextUserId;
    form = createEmptyForm();
    fieldErrors = {};
    adjustForm = { direction: ADJUST_DIRECTION.SAVE, amount: '' };
    adjustFormError = null;
    baselines = initialBaselines();
    simulation = initialSimulation();
    adjustment = initialAdjustment();
    simulationBlock = null;
    adjustmentBlock = null;
  };

  // API-41 진행 중 요청을 무효화하고 조정 결과를 비운다. API-40 결과(simulation)는 건드리지 않는다.
  const resetAdjustment = () => {
    adjustmentGate.invalidate();
    adjustmentToken = null;
    adjustment = initialAdjustment();
    adjustFormError = null;
    adjustmentBlock = null;
  };

  snapshot = build();

  // 사용자가 바뀌면 이전 사용자의 폼·결과·캐시·진행 중 요청을 모두 버린다. 같은 사용자면 아무것도 하지 않는다.
  const setUser = nextUserId => {
    if (disposed || nextUserId === userId) return;
    resetAll(nextUserId);
    commit();
  };

  // 폼 입력. 요청을 만들지 않는다. API-40 결과는 유지되며 제출 이후 바뀐 입력은 simulationStale로 드러난다.
  const setField = (key, text) => {
    if (disposed || !hasOwn(form, key) || form[key] === text) return false;
    form = { ...form, [key]: text };
    if (hasOwn(fieldErrors, key)) {
      const { [key]: _removed, ...rest } = fieldErrors;
      fieldErrors = rest;
    }
    commit();
    return true;
  };

  // 조정 입력이 실제로 바뀌면 이전 조정 결과를 새 입력의 결과처럼 보이지 않게 비우고, 진행 중 응답은 폐기한다.
  const changeAdjustForm = next => {
    adjustForm = next;
    resetAdjustment();
    commit();
    return true;
  };

  const setAdjustDirection = direction => {
    if (disposed) return false;
    if (direction !== ADJUST_DIRECTION.SAVE && direction !== ADJUST_DIRECTION.INCREASE)
      return false;
    if (adjustForm.direction === direction) return false;
    return changeAdjustForm({ ...adjustForm, direction });
  };

  const setAdjustAmount = amount => {
    if (disposed || adjustForm.amount === amount) return false;
    return changeAdjustForm({ ...adjustForm, amount });
  };

  // API-39 기준값. 지표를 기록하지 않는 GET이지만 화면이 명시적으로 부를 때만 호출한다.
  const loadBaselines = () => {
    if (disposed) return Promise.resolve();
    if (baselinesInFlight) return baselinesInFlight.promise;
    if (baselines.status === S.READY) return Promise.resolve();
    // 재시도 불가 오류(401/403 등)에서는 같은 요청을 다시 보내지 않는다.
    if (baselines.status === S.ERROR && !baselines.retryable) return Promise.resolve();

    const token = baselinesGate.begin(userId);
    baselines = Object.freeze({
      ...baselines,
      status: S.LOADING,
      errorType: null,
      retryable: false,
    });
    commit();

    const entry = {};
    entry.promise = (async () => {
      const result = await runRequest(() => fetchBaselines());
      if (baselinesInFlight === entry) baselinesInFlight = null;
      if (disposed || !baselinesGate.isCurrent(token)) return; // 사용자 변경·dispose 뒤의 늦은 응답

      if (result.ok) {
        let viewModel;
        try {
          viewModel = buildBaselineViewModel(result.value);
        } catch (error) {
          const errorType = getSimulatorErrorType(error);
          baselines = Object.freeze({
            ...initialBaselines(),
            status: S.ERROR,
            errorType,
            retryable: canRetrySimulatorError(errorType),
          });
          commit();
          return;
        }
        baselines = Object.freeze({
          status: S.READY,
          items: Object.freeze([...result.value]),
          viewModel: Object.freeze(viewModel),
          errorType: null,
          retryable: false,
        });
      } else if (result.canceled) {
        baselines = initialBaselines();
      } else {
        baselines = Object.freeze({
          ...initialBaselines(),
          status: S.ERROR,
          errorType: result.errorType,
          retryable: canRetrySimulatorError(result.errorType),
        });
      }
      commit();
    })();
    baselinesInFlight = entry;
    return entry.promise;
  };

  const rejected = (reason, extra = {}) => Promise.resolve({ started: false, reason, ...extra });

  // API-40. '계산하기' 버튼 탭에서만 호출한다.
  const submitSimulation = () => {
    if (disposed) return rejected(SUBMIT_REJECT.DISPOSED);
    if (simulationToken !== null || adjustmentToken !== null) {
      return rejected(SUBMIT_REJECT.IN_FLIGHT);
    }
    if (!isUserValid()) return rejected(SUBMIT_REJECT.NO_USER);
    if (simulationBlock !== null && simulationBlock === rawFormKey(form)) {
      return rejected(SUBMIT_REJECT.BLOCKED);
    }

    const validation = validateSimulatorForm(form);
    if (!validation.ok) {
      fieldErrors = validation.fieldErrors;
      commit();
      return rejected(SUBMIT_REJECT.INVALID_INPUT, { fieldErrors: validation.fieldErrors });
    }

    const inputs = Object.freeze({ ...validation.inputs });
    const token = simulationGate.begin(userId);
    simulationToken = token;
    fieldErrors = {};
    simulationBlock = null;
    runCounter += 1;
    const runId = runCounter;
    // 새 입력으로 다시 계산하므로 이전 조정 결과(이전 base 기준)는 비운다.
    resetAdjustment();
    simulation = Object.freeze({
      ...initialSimulation(),
      status: S.LOADING,
      runId,
    });
    commit();

    const requestUserId = userId;
    return (async () => {
      const result = await runRequest(() => runSimulation(requestUserId, inputs));
      if (simulationToken === token) simulationToken = null;
      if (disposed || !simulationGate.isCurrent(token)) return { started: true, discarded: true };

      if (result.ok) {
        let viewModel;
        try {
          viewModel = buildSimulationViewModel(result.value);
        } catch (error) {
          const errorType = getSimulatorErrorType(error);
          return failSimulation(runId, errorType);
        }
        simulation = Object.freeze({
          status: S.READY,
          result: result.value,
          viewModel,
          errorType: null,
          retryable: false,
          submittedInputs: inputs,
          runId,
        });
        commit();
        return { started: true, status: S.READY };
      }
      if (result.canceled) {
        simulation = Object.freeze({ ...initialSimulation(), runId });
        commit();
        return { started: true, status: S.IDLE };
      }
      return failSimulation(runId, result.errorType);
    })();
  };

  // 실패하면 결과를 비운다(새 입력에 대해 이전 숫자를 현재 값처럼 보이지 않게). 폼 입력은 그대로 둔다.
  const failSimulation = (runId, errorType) => {
    const retryable = canRetrySimulatorError(errorType);
    simulation = Object.freeze({
      ...initialSimulation(),
      status: S.ERROR,
      errorType,
      retryable,
      runId,
    });
    simulationBlock = retryable ? null : rawFormKey(form);
    commit();
    return { started: true, status: S.ERROR, errorType };
  };

  // API-41. '조정 계산' 버튼 탭에서만 호출한다. API-40 제출 때의 입력을 그대로 전달한다.
  const submitAdjustment = () => {
    if (disposed) return rejected(SUBMIT_REJECT.DISPOSED);
    if (simulationToken !== null || adjustmentToken !== null) {
      return rejected(SUBMIT_REJECT.IN_FLIGHT);
    }
    if (!isUserValid()) return rejected(SUBMIT_REJECT.NO_USER);
    if (simulation.status !== S.READY || simulation.submittedInputs === null) {
      return rejected(SUBMIT_REJECT.NEEDS_SIMULATION);
    }
    if (computeStale()) return rejected(SUBMIT_REJECT.STALE);
    if (adjustmentBlock !== null && adjustmentBlock === rawAdjustKey(adjustForm)) {
      return rejected(SUBMIT_REJECT.BLOCKED);
    }

    const validation = validateAdjustForm(adjustForm);
    if (!validation.ok) {
      adjustFormError = validation.error;
      commit();
      return rejected(SUBMIT_REJECT.INVALID_INPUT, { error: validation.error });
    }

    const { monthlyDelta } = validation;
    // API-40이 제출한 검증된 입력을 그대로 쓴다(폼 현재 텍스트가 아님). currentAsset을 생략했다면 여기서도 생략된다.
    const inputs = simulation.submittedInputs;
    const simulationResult = simulation.result;
    const token = adjustmentGate.begin(userId);
    adjustmentToken = token;
    adjustFormError = null;
    adjustmentBlock = null;
    adjustment = Object.freeze({
      ...initialAdjustment(),
      status: S.LOADING,
      submittedDelta: Object.freeze({ direction: adjustForm.direction, monthlyDelta }),
    });
    commit();

    const requestUserId = userId;
    const submittedDelta = adjustment.submittedDelta;
    return (async () => {
      const result = await runRequest(() => runAdjustment(requestUserId, inputs, monthlyDelta));
      if (adjustmentToken === token) adjustmentToken = null;
      // 조정 입력 변경·재계산·사용자 변경·dispose로 무효화된 요청의 응답은 상태를 바꾸지 않는다.
      if (disposed || !adjustmentGate.isCurrent(token)) return { started: true, discarded: true };

      if (result.ok) {
        let viewModel;
        try {
          viewModel = buildAdjustmentViewModel(result.value, simulationResult);
        } catch (error) {
          return failAdjustment(getSimulatorErrorType(error), submittedDelta);
        }
        adjustment = Object.freeze({
          status: S.READY,
          result: result.value,
          viewModel,
          errorType: null,
          retryable: false,
          submittedDelta,
        });
        commit();
        return { started: true, status: S.READY };
      }
      if (result.canceled) {
        adjustment = initialAdjustment();
        commit();
        return { started: true, status: S.IDLE };
      }
      return failAdjustment(result.errorType, submittedDelta);
    })();
  };

  // 조정 실패는 adjustment만 바꾼다. API-40 결과는 그대로다.
  const failAdjustment = (errorType, submittedDelta) => {
    const retryable = canRetrySimulatorError(errorType);
    adjustment = Object.freeze({
      ...initialAdjustment(),
      status: S.ERROR,
      errorType,
      retryable,
      submittedDelta,
    });
    adjustmentBlock = retryable ? null : rawAdjustKey(adjustForm);
    commit();
    return { started: true, status: S.ERROR, errorType };
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
    setField,
    setAdjustDirection,
    setAdjustAmount,
    loadBaselines,
    submitSimulation,
    submitAdjustment,
    dispose,
  };
};
