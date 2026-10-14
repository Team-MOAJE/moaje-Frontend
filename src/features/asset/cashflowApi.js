// Asset 현금흐름 API 통신 레이어 (API-15 일일 사용 가능 금액, API-16 월별 집계, API-17 카테고리 집계).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf, 백엔드 moaje-asset 소스(DailyCashflowController 등, 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 구성·응답 검증/변환만 담당한다. 화면/Redux를 알지 못한다.
//
// 계약
// - 공통 규칙(직접 응답, 오류 분류)은 assetResponse.js를 따른다. 소유자는 JWT(Principal)로 정해지므로 userId를 보내지 않는다.
// - API-15는 POST이며 계산 입력 4개(expectedIncome, fixedExpenses, eventBuffer, daysUntilNextPayday)를 호출부가 정한다.
//   이 모듈은 값의 출처를 만들지 않고 임의 기본값을 채우지 않는다. 생략 가능한 필드는 undefined이면 본문에서 뺀다(서버 기본값 사용).
//   daysUntilNextPayday는 1 이상 필수다(서버 @Positive). 응답에는 spent/status/formulaItems가 없다(서버가 주지 않는 값은 만들지 않는다).
// - 금액은 서버가 BigDecimal을 JSON 숫자로 내려준다. 원 단위 값이므로 Number로 읽는다.
// - 응답 userId는 사용하지 않는다(소유자 확인은 서버 책임).
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_HEADERS } from '../../constants/apiHeaders';
import {
  ASSET_REQUEST_ERROR,
  ASSET_REQUEST_OPTIONS,
  DATE_PATTERN,
  TRANSACTION_CATEGORIES,
  YEAR_MONTH_PATTERN,
  isDateTimeString,
  isFiniteNumber,
  isNonEmptyString,
  isNonNegativeSafeInteger,
  oneOf,
  requestError,
  requireField,
  requireInputObject,
  requireObject,
} from './assetResponse';

const JSON_BODY_HEADERS = Object.freeze({ [API_HEADERS.CONTENT_TYPE]: 'application/json' });

const isYearMonth = value => typeof value === 'string' && YEAR_MONTH_PATTERN.test(value);
const isDateString = value => typeof value === 'string' && DATE_PATTERN.test(value);
const isAmount = value => isFiniteNumber(value);
const isNonNegativeRevision = value => Number.isSafeInteger(value) && value >= 0;

// ── 응답 검증/변환 ───────────────────────────────────────────

// API-15 응답.
export const mapDailyLimitResponse = body => {
  const field = 'dailyLimit';
  requireObject(body, field);
  requireField(body, 'userId', isNonEmptyString, field);

  return {
    currentBalance: requireField(body, 'currentBalance', isAmount, field),
    expectedIncome: requireField(body, 'expectedIncome', isAmount, field),
    fixedExpenses: requireField(body, 'fixedExpenses', isAmount, field),
    eventBuffer: requireField(body, 'eventBuffer', isAmount, field),
    daysUntilNextPayday: requireField(
      body,
      'daysUntilNextPayday',
      value => Number.isSafeInteger(value) && value >= 1,
      field
    ),
    dailyLimit: requireField(body, 'dailyLimit', isAmount, field),
    snapshotDate: requireField(body, 'snapshotDate', isDateString, field),
  };
};

// API-16 응답.
export const mapMonthlyCashflowResponse = body => {
  const field = 'monthlyCashflow';
  requireObject(body, field);
  requireField(body, 'userId', isNonEmptyString, field);

  return {
    yearMonth: requireField(body, 'yearMonth', isYearMonth, field),
    incomeAmount: requireField(body, 'incomeAmount', isAmount, field),
    expenseAmount: requireField(body, 'expenseAmount', isAmount, field),
    transferAmount: requireField(body, 'transferAmount', isAmount, field),
    revision: requireField(body, 'revision', isNonNegativeRevision, field),
    calculatedAt: requireField(body, 'calculatedAt', isDateTimeString, field),
  };
};

// API-17 응답. 거래가 없는 카테고리도 0원으로 내려온다. 서버 순서를 유지한다.
export const mapCategoryCashflowResponse = body => {
  const field = 'categoryCashflow';
  requireObject(body, field);
  requireField(body, 'userId', isNonEmptyString, field);
  const categoriesRaw = requireField(body, 'categories', Array.isArray, field);

  return {
    yearMonth: requireField(body, 'yearMonth', isYearMonth, field),
    revision: requireField(body, 'revision', isNonNegativeRevision, field),
    categories: categoriesRaw.map((item, index) => {
      const itemField = `${field}.categories[${index}]`;
      requireObject(item, itemField);
      return {
        category: requireField(item, 'category', oneOf(TRANSACTION_CATEGORIES), itemField),
        amount: requireField(item, 'amount', isAmount, itemField),
      };
    }),
    calculatedAt: requireField(body, 'calculatedAt', isDateTimeString, field),
  };
};

// ── 요청 구성/검증 ───────────────────────────────────────────

const requireYearMonth = yearMonth => {
  if (!isYearMonth(yearMonth)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_YEAR_MONTH,
      'yearMonth는 YYYY-MM 형식이어야 합니다.'
    );
  }
  return yearMonth;
};

const requireOptionalAmount = (value, name) => {
  if (value !== undefined && !isNonNegativeSafeInteger(value)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_AMOUNT,
      `${name}은(는) 0 이상의 정수(원)여야 합니다.`
    );
  }
};

// API-15 요청 본문(JSON 문자열). 입력: { daysUntilNextPayday(필수), expectedIncome?, fixedExpenses?, eventBuffer?, snapshotDate?, forceRefresh? }.
// undefined인 선택 필드는 본문에서 뺀다(null로 채우지 않음). userId는 보내지 않는다.
export const buildDailyLimitRequestBody = input => {
  requireInputObject(input, '일일 사용 가능 금액');
  const {
    expectedIncome,
    fixedExpenses,
    eventBuffer,
    daysUntilNextPayday,
    snapshotDate,
    forceRefresh,
  } = input;

  if (!Number.isSafeInteger(daysUntilNextPayday) || daysUntilNextPayday < 1) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_INPUT,
      'daysUntilNextPayday는 1 이상의 정수여야 합니다.'
    );
  }
  requireOptionalAmount(expectedIncome, 'expectedIncome');
  requireOptionalAmount(fixedExpenses, 'fixedExpenses');
  requireOptionalAmount(eventBuffer, 'eventBuffer');
  if (snapshotDate !== undefined && !isDateString(snapshotDate)) {
    throw requestError(
      ASSET_REQUEST_ERROR.INVALID_INPUT,
      'snapshotDate는 YYYY-MM-DD 형식이어야 합니다.'
    );
  }
  if (forceRefresh !== undefined && typeof forceRefresh !== 'boolean') {
    throw requestError(ASSET_REQUEST_ERROR.INVALID_INPUT, 'forceRefresh는 boolean이어야 합니다.');
  }

  const body = {
    expectedIncome,
    fixedExpenses,
    eventBuffer,
    daysUntilNextPayday,
    snapshotDate,
    forceRefresh,
  };
  // JSON.stringify는 undefined 값을 키째로 생략한다.
  return JSON.stringify(body);
};

// ── API 함수 ─────────────────────────────────────────────────

// API-15 POST /api/v1/assets/cashflow/daily-limit
// 자동 재시도·멱등 키 없음. 같은 입력이면 같은 결과를 계산하지만 호출은 화면 동작이 결정한다.
export const calculateDailyLimit = async input => {
  const requestBody = buildDailyLimitRequestBody(input);
  const body = await apiClient.post(API_ENDPOINTS.ASSET.CASHFLOW.DAILY_LIMIT, requestBody, {
    ...ASSET_REQUEST_OPTIONS,
    headers: JSON_BODY_HEADERS,
  });
  return mapDailyLimitResponse(body);
};

// API-16 GET /api/v1/assets/cashflow/monthly?yearMonth=YYYY-MM
export const fetchMonthlyCashflow = async yearMonth => {
  requireYearMonth(yearMonth);
  const body = await apiClient.get(API_ENDPOINTS.ASSET.CASHFLOW.MONTHLY, {
    ...ASSET_REQUEST_OPTIONS,
    params: { yearMonth },
  });
  return mapMonthlyCashflowResponse(body);
};

// API-17 GET /api/v1/assets/cashflow/category?yearMonth=YYYY-MM
export const fetchCategoryCashflow = async yearMonth => {
  requireYearMonth(yearMonth);
  const body = await apiClient.get(API_ENDPOINTS.ASSET.CASHFLOW.CATEGORY, {
    ...ASSET_REQUEST_OPTIONS,
    params: { yearMonth },
  });
  return mapCategoryCashflowResponse(body);
};
