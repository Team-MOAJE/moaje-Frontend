// Work 미래 자금 시뮬레이션 API 통신 레이어 (API-39 기준값 목록, API-40 시뮬레이션, API-41 조건부 시뮬레이션).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf p.41~44, 백엔드 moaje-work 소스(읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 본문 구성·응답 검증/변환만 담당한다. 화면/Redux/AsyncStorage를 알지 못하며 아직 앱 흐름에
// 연결되어 있지 않다(연결은 후속 단계).
//
// 계약
// - 세 API 모두 Envelope 없는 직접 응답(API-39는 배열, API-40/41은 객체)이므로 responseFormat: 'raw'를 명시하고
//   이 모듈에서 구조를 검증한 뒤 camelCase 모델로 변환한다. 검증에 실패한 응답은 정상 데이터로 돌려주지 않고
//   invalidResponse로 reject한다(값 보정·항목 제외·기본값 대입 없음).
// - 모든 금액·비율은 서버가 str(Decimal)로 직렬화한 문자열이다. 이 모듈은 Number로 변환하지 않고 문자열 그대로
//   전달한다(표시 변환은 화면 로직의 책임). 목표 금액·현금흐름·gap·달성 개월·진행률·advice·message는 모두 서버가
//   계산한 값이며 프론트에서 재계산·보정·기본값 채움을 하지 않는다.
// - 기준값(baselines) 개수는 서버가 정한다. 개수를 가정하지 않으며 서버가 준 순서를 그대로 유지한다.
//   amount에는 금액뿐 아니라 개월 수·비율(예: emergency_months, rir_ratio)도 들어 있으므로 의미를 해석하지 않는다.
// - 요청 입력은 전부 선택이다. 비어 있는 항목은 키 자체를 보내지 않는다(서버가 온보딩 답변·기준값·Asset 조회로 대신
//   계산하고 assumed_keys/asset_source로 알려준다). 프론트가 계좌 잔액 합계 등을 current_asset으로 채우지 않는다.
//   값은 0 이상 정수 문자열만 허용한다(명세 예시 "2500000"). monthly_delta는 API-41에서 필수이며 부호 있는 정수
//   문자열이다(음수 = 절약, 양수 = 지출 증가).
// - user_id는 숫자 문자열이다(Auth user_id는 JS 안전 정수 범위 초과). 경로에만 문자열 그대로 넣고 본문에는 넣지
//   않는다. 응답의 user_id는 JSON 파싱 중 정밀도가 손실되므로 읽지도 반환하지도 않는다.
// - API-40/41은 POST이지만 조회성 계산이며 서버가 호출할 때마다 지표(SIMULATE/SIMULATE_ADJUST)를 기록한다. 그래서
//   어떤 요청도 자동 재시도하지 않고 멱등 키도 쓰지 않는다. 다시 계산할지는 호출부(사용자 동작)가 결정한다.
// - months_to_goal 등 달성 개월 수의 null은 오류가 아니라 "월 저축 가능액이 0 이하라 계산 불가"인 정상 응답이다.
//   Asset 조회 실패·계좌 미연동도 오류가 아니라 200 + asset_source(UNAVAILABLE/NOT_LINKED)로 내려온다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';
import {
  ONBOARDING_ERROR_TYPE,
  ONBOARDING_REQUEST_ERROR,
  OnboardingRequestError,
  getOnboardingErrorType,
  isValidOnboardingUserId,
} from '../onboarding/onboardingApi';
import { ASSET_SOURCE } from './readinessApi';

// asset_source 값은 사회인 준비도(API-36)와 같은 서버 규격이다. 알 수 없는 문자열이 오더라도 응답을 거부하지 않는다.
export { ASSET_SOURCE };

// 명세: baselines[].kind 값. 알 수 없는 문자열이 오더라도 응답을 거부하지 않고 그대로 전달한다.
export const BASELINE_KIND = Object.freeze({
  STATISTIC: 'STATISTIC',
  DERIVED: 'DERIVED',
  ASSUMPTION: 'ASSUMPTION',
});

// 요청을 보내기 전 검증 실패 코드(userId는 ONBOARDING_REQUEST_ERROR.INVALID_USER_ID를 그대로 쓴다).
export const SIMULATOR_REQUEST_ERROR = Object.freeze({
  INVALID_INPUTS: 'INVALID_INPUTS',
  UNKNOWN_INPUT_KEY: 'UNKNOWN_INPUT_KEY',
  INVALID_INPUT_VALUE: 'INVALID_INPUT_VALUE',
  INVALID_MONTHLY_DELTA: 'INVALID_MONTHLY_DELTA',
});

// 호출부 입력 키(camelCase) → 명세 요청 키(snake_case). 명세 순서를 따르며 이 7개만 허용한다.
const INPUT_KEY_TO_REQUEST_KEY = Object.freeze({
  monthlyIncome: 'monthly_income',
  monthlyHousing: 'monthly_housing',
  monthlyLiving: 'monthly_living',
  monthlyLeisure: 'monthly_leisure',
  deposit: 'deposit',
  moveInCost: 'move_in_cost',
  currentAsset: 'current_asset',
});

// 요청 값: 0 이상 정수 문자열. 선행 0·공백·쉼표·소수·지수 표기·부호는 불허("0"은 허용).
const NON_NEGATIVE_INTEGER_STRING_PATTERN = /^(?:0|[1-9]\d*)$/;
// monthly_delta: 부호 있는 정수 문자열. "-0"은 불허.
const SIGNED_INTEGER_STRING_PATTERN = /^(?:0|-?[1-9]\d*)$/;
// 응답 금액: 원 단위 정수 또는 소수 문자열(음수 허용). 선행 0·공백·쉼표·지수 표기·'+' 부호·'1.' '.5' 불허.
const AMOUNT_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
// 비율: 0 이상 1 이하의 10진 문자열. "0", "0.0685", "1", "1.0"만 허용.
const SHARE_PATTERN = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

// ── 응답 검증/변환 ───────────────────────────────────────────

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 2xx를 받았지만 본문이 명세와 다를 때. 어느 필드가 문제인지(값은 제외)만 invalidField로 남긴다.
const invalidResponse = field => {
  const error = createApiError({
    kind: API_ERROR_KIND.BUSINESS,
    message: '서버 응답 형식을 해석할 수 없습니다.',
  });
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

const isString = value => typeof value === 'string';
const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';
const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isInteger = value => Number.isInteger(value);
const isAmountString = value => typeof value === 'string' && AMOUNT_PATTERN.test(value);
const isShareString = value => typeof value === 'string' && SHARE_PATTERN.test(value);
const isStringArray = value => Array.isArray(value) && value.every(isString);
const isNullableNonNegativeInteger = value => value === null || isNonNegativeInteger(value);
const isNullableInteger = value => value === null || isInteger(value);

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

// baselines[] 공통 항목(API-39 응답, API-40 응답의 baselines). amount는 문자열 그대로 보존한다.
const mapBaseline = (baseline, field) => {
  if (!isPlainObject(baseline)) throw invalidResponse(field);

  return {
    key: requireField(baseline, 'key', isNonEmptyString, field),
    label: requireField(baseline, 'label', isNonEmptyString, field),
    amount: requireField(baseline, 'amount', isAmountString, field),
    kind: requireField(baseline, 'kind', isNonEmptyString, field),
    source: requireField(baseline, 'source', isString, field),
    asOf: requireField(baseline, 'as_of', isString, field),
    scope: requireField(baseline, 'scope', isString, field),
    // 출처 링크가 없는 기준값(모아제 가정 등)은 빈 문자열이다.
    url: requireField(baseline, 'url', isString, field),
  };
};

// 기준값 배열 검증. 개수는 가정하지 않는다(빈 배열도 정상). key 중복만 거부한다.
const mapBaselineList = (list, field) => {
  if (!Array.isArray(list)) throw invalidResponse(field);

  const baselines = list.map((baseline, index) => mapBaseline(baseline, `${field}[${index}]`));
  if (new Set(baselines.map(baseline => baseline.key)).size !== baselines.length) {
    throw invalidResponse(field);
  }
  return baselines;
};

// API-39 응답. 서버가 준 순서 그대로 반환한다.
export const mapBaselinesResponse = body => mapBaselineList(body, 'simulatorBaselines');

const mapTarget = (target, field) => {
  if (!isPlainObject(target)) throw invalidResponse(field);

  return {
    deposit: requireField(target, 'deposit', isAmountString, field),
    moveInCost: requireField(target, 'move_in_cost', isAmountString, field),
    emergencyFund: requireField(target, 'emergency_fund', isAmountString, field),
    total: requireField(target, 'total', isAmountString, field),
  };
};

const mapCashflow = (cashflow, field) => {
  if (!isPlainObject(cashflow)) throw invalidResponse(field);

  return {
    income: requireField(cashflow, 'income', isAmountString, field),
    housing: requireField(cashflow, 'housing', isAmountString, field),
    living: requireField(cashflow, 'living', isAmountString, field),
    leisure: requireField(cashflow, 'leisure', isAmountString, field),
    expense: requireField(cashflow, 'expense', isAmountString, field),
    // 월 지출이 수입보다 크면 음수일 수 있다.
    savable: requireField(cashflow, 'savable', isAmountString, field),
  };
};

// API-40 응답. 응답의 user_id는 정밀도 손실 값이므로 사용하지 않는다. 명세에 없는 필드는 읽지 않는다.
export const mapSimulationResponse = body => {
  const field = 'simulation';
  if (!isPlainObject(body)) throw invalidResponse(field);

  return {
    target: mapTarget(requireField(body, 'target', isPlainObject, field), 'target'),
    cashflow: mapCashflow(requireField(body, 'cashflow', isPlainObject, field), 'cashflow'),
    currentAsset: requireField(body, 'current_asset', isAmountString, field),
    gap: requireField(body, 'gap', isAmountString, field),
    // null = 월 저축 가능액이 0 이하라 계산 불가(오류 아님). 0 = 이미 달성.
    monthsToGoal: requireField(body, 'months_to_goal', isNullableNonNegativeInteger, field),
    progressRate: requireField(body, 'progress_rate', isShareString, field),
    // 알려진 값(ASSET_SOURCE)이 아니어도 거부하지 않고 그대로 전달한다.
    assetSource: requireField(body, 'asset_source', isNonEmptyString, field),
    assumedKeys: requireField(body, 'assumed_keys', isStringArray, field),
    baselines: mapBaselineList(requireField(body, 'baselines', Array.isArray, field), 'baselines'),
    advice: requireField(body, 'advice', isStringArray, field),
  };
};

// API-41 응답. months_saved는 늦어진 경우 음수일 수 있다. message는 서버 문구 그대로 전달한다.
export const mapAdjustmentResponse = body => {
  const field = 'adjustment';
  if (!isPlainObject(body)) throw invalidResponse(field);

  return {
    monthlyDelta: requireField(body, 'monthly_delta', isAmountString, field),
    baseMonthlySavable: requireField(body, 'base_monthly_savable', isAmountString, field),
    adjustedMonthlySavable: requireField(body, 'adjusted_monthly_savable', isAmountString, field),
    baseMonthsToGoal: requireField(
      body,
      'base_months_to_goal',
      isNullableNonNegativeInteger,
      field
    ),
    adjustedMonthsToGoal: requireField(
      body,
      'adjusted_months_to_goal',
      isNullableNonNegativeInteger,
      field
    ),
    monthsSaved: requireField(body, 'months_saved', isNullableInteger, field),
    message: requireField(body, 'message', isNonEmptyString, field),
  };
};

// ── 요청 본문 구성 ───────────────────────────────────────────

const requestError = (code, message) => new OnboardingRequestError(code, message);

const requireUserId = userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw requestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
};

// 선택 입력 → 명세 요청 본문. undefined/null/빈 문자열('')은 키를 보내지 않는다.
// 허용 키 외의 입력, 정수 문자열이 아닌 값(number 포함)은 요청 전에 거부한다. 거부 메시지에 입력 값은 싣지 않는다.
export const buildSimulationRequestBody = inputs => {
  if (inputs === undefined || inputs === null) return {};
  if (!isPlainObject(inputs)) {
    throw requestError(
      SIMULATOR_REQUEST_ERROR.INVALID_INPUTS,
      '시뮬레이션 입력은 객체여야 합니다.'
    );
  }

  const unknownKey = Object.keys(inputs).find(key => !hasOwn(INPUT_KEY_TO_REQUEST_KEY, key));
  if (unknownKey !== undefined) {
    throw requestError(
      SIMULATOR_REQUEST_ERROR.UNKNOWN_INPUT_KEY,
      '허용되지 않는 시뮬레이션 입력 항목입니다.'
    );
  }

  const body = {};
  for (const [inputKey, requestKey] of Object.entries(INPUT_KEY_TO_REQUEST_KEY)) {
    const value = inputs[inputKey];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !NON_NEGATIVE_INTEGER_STRING_PATTERN.test(value)) {
      throw requestError(
        SIMULATOR_REQUEST_ERROR.INVALID_INPUT_VALUE,
        `${requestKey}는 0 이상의 정수 문자열이어야 합니다.`
      );
    }
    body[requestKey] = value;
  }
  return body;
};

// API-41 본문 = 시뮬레이션 입력 + 필수 monthly_delta(부호 있는 정수 문자열).
export const buildAdjustmentRequestBody = (inputs, monthlyDelta) => {
  const body = buildSimulationRequestBody(inputs);

  if (typeof monthlyDelta !== 'string' || !SIGNED_INTEGER_STRING_PATTERN.test(monthlyDelta)) {
    throw requestError(
      SIMULATOR_REQUEST_ERROR.INVALID_MONTHLY_DELTA,
      'monthly_delta는 정수 문자열이어야 합니다(음수 = 절약, 양수 = 지출 증가).'
    );
  }
  return { ...body, monthly_delta: monthlyDelta };
};

// ── API 함수 ─────────────────────────────────────────────────

// API-39 GET /api/v1/work/simulator/baselines → 기준값 배열(서버 순서 유지). user_id·쿼리·본문 없음.
export const fetchSimulatorBaselines = async () => {
  const body = await apiClient.get(API_ENDPOINTS.WORK.SIMULATOR_BASELINES, {
    responseFormat: 'raw',
  });
  return mapBaselinesResponse(body);
};

// API-40 POST /api/v1/work/simulator/{user_id}/simulate
// inputs 예: { monthlyIncome: '2500000', deposit: '10000000' } — 비운 항목은 서버가 기준값으로 계산한다.
export const runSimulation = async (userId, inputs) => {
  requireUserId(userId);
  const requestBody = buildSimulationRequestBody(inputs);

  const body = await apiClient.post(API_ENDPOINTS.WORK.SIMULATE(userId), requestBody, {
    responseFormat: 'raw',
  });
  return mapSimulationResponse(body);
};

// API-41 POST /api/v1/work/simulator/{user_id}/adjust
// monthlyDelta: 월 지출 변화량 정수 문자열(음수 = 절약, 양수 = 지출 증가). 필수.
export const runAdjustment = async (userId, inputs, monthlyDelta) => {
  requireUserId(userId);
  const requestBody = buildAdjustmentRequestBody(inputs, monthlyDelta);

  const body = await apiClient.post(API_ENDPOINTS.WORK.ADJUST(userId), requestBody, {
    responseFormat: 'raw',
  });
  return mapAdjustmentResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────
// Work 서비스 공통 분류를 그대로 쓴다. 네트워크·타임아웃·5xx를 "계산 결과 없음"으로 오인하지 않도록
// 호출부가 이 값으로 분기한다. 서버 오류 본문({detail} / {code,message})은 상태 코드로만 분류한다.

export const SIMULATOR_ERROR_TYPE = ONBOARDING_ERROR_TYPE;
export const getSimulatorErrorType = getOnboardingErrorType;
