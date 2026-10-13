// Work 재무 온보딩 API 통신 레이어 (API-30 ~ API-35).
// 기준: docs/moaje-frontend-api-guide-20261011.pdf, 백엔드 moaje-work 소스(2026-10-12 읽기 확인).
//
// 이 모듈은 HTTP 호출·요청 검증·응답 검증/변환만 담당한다. 화면, Redux, AsyncStorage, 기존 온보딩
// Repository를 알지 못하며 아직 앱 흐름에 연결되어 있지 않다(연결은 후속 단계).
//
// 계약
// - 응답은 Envelope 없이 직접 배열(API-30/33) 또는 직접 객체(API-31/32/34/35)다. 모든 요청에
//   responseFormat: 'raw'를 명시하고, 받은 본문을 여기서 구조 검증한 뒤 camelCase 모델로 변환한다.
//   검증에 실패한 응답은 정상 데이터로 돌려주지 않고 invalidResponse 오류로 reject한다.
// - 전송 오류는 apiClient의 ApiError(kind/status/code/traceId)를 그대로 전달한다.
//   getOnboardingErrorType()으로 호출부가 오류 종류를 구분할 수 있다.
// - user_id는 항상 숫자 문자열이다. Auth user_id(≈1.1×10^17)는 JS Number의 안전 정수 범위(2^53)를
//   넘으므로 Number로 변환하지 않는다. 경로에는 문자열을 그대로, API-31 본문에는 숫자 리터럴 원문으로
//   삽입한다(아래 buildBulkAnswersRequestBody). 응답의 user_id는 JSON 파싱 중 정밀도가 이미 손실되므로
//   읽지도 반환하지도 않는다.
// - Q9(서술형) 답변은 서버 스모크 테스트에서 확인된 방식을 따른다: answerCode 'UNKNOWN' + answerText.
//   (서버는 free_text 문항에서 UNKNOWN이면 본문 없이도, 그 외 코드면 비어 있지 않은 본문을 요구한다.)
// - 답변 저장은 서버에서 (user_id, question_no) 기준 upsert라 같은 내용을 다시 보내도 결과가 같다.
//   그래도 이 모듈은 어떤 요청도 자동 재시도하지 않는다. 재확인/재시도 정책은 Repository 단계에서 결정한다.
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { API_HEADERS } from '../../constants/apiHeaders';
import { API_ERROR_KIND, createApiError } from '../../services/apiResponse';

export const UNKNOWN_ANSWER_CODE = 'UNKNOWN';

// 명세: question_no 1~10.
export const MIN_QUESTION_NO = 1;
export const MAX_QUESTION_NO = 10;

// 서버 스키마: answer_code max_length=50.
const MAX_ANSWER_CODE_LENGTH = 50;

// BIGINT 최대값. 19자리 숫자 문자열은 사전식 비교로 범위를 확인한다(BigInt/Number 사용 안 함).
const MAX_USER_ID = '9223372036854775807';
const USER_ID_PATTERN = /^[1-9][0-9]{0,18}$/;

// ── 요청 검증 ────────────────────────────────────────────────

export const ONBOARDING_REQUEST_ERROR = {
  INVALID_USER_ID: 'INVALID_USER_ID',
  INVALID_QUESTION_NO: 'INVALID_QUESTION_NO',
  INVALID_ANSWERS: 'INVALID_ANSWERS',
};

// 요청을 보내기 전에 입력이 잘못된 경우. 네트워크 요청은 발생하지 않는다.
// 메시지에 user_id 등 입력 값은 넣지 않는다(위치 정보만).
export class OnboardingRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OnboardingRequestError';
    this.code = code;
  }
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// 문자열 형식의 양의 정수 ID(1 ~ 2^63-1)만 허용한다. 숫자(Number) 입력은 거부한다.
export const isValidOnboardingUserId = value =>
  typeof value === 'string' &&
  USER_ID_PATTERN.test(value) &&
  (value.length < MAX_USER_ID.length || value <= MAX_USER_ID);

const isValidQuestionNo = value =>
  Number.isInteger(value) && value >= MIN_QUESTION_NO && value <= MAX_QUESTION_NO;

const requireUserId = userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
  return userId;
};

const requireQuestionNo = questionNo => {
  if (!isValidQuestionNo(questionNo)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_QUESTION_NO,
      `question_no는 ${MIN_QUESTION_NO}~${MAX_QUESTION_NO} 사이의 정수여야 합니다.`
    );
  }
  return questionNo;
};

const invalidAnswers = where =>
  new OnboardingRequestError(
    ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS,
    `답변 형식이 올바르지 않습니다. (${where})`
  );

// 앱 내부 답변 { questionNo, answerCode, answerText? } → 서버 필드명.
// answer_text는 값이 있을 때만 포함한다(선택형은 생략, null로 채우지 않음).
const toServerAnswer = (answer, where) => {
  if (!isPlainObject(answer)) throw invalidAnswers(where);

  const { questionNo, answerCode, answerText } = answer;

  if (!isValidQuestionNo(questionNo)) throw invalidAnswers(`${where}.questionNo`);

  if (
    typeof answerCode !== 'string' ||
    answerCode === '' ||
    answerCode !== answerCode.trim() ||
    answerCode.length > MAX_ANSWER_CODE_LENGTH
  ) {
    throw invalidAnswers(`${where}.answerCode`);
  }

  const serverAnswer = { question_no: questionNo, answer_code: answerCode };

  if (answerText !== undefined && answerText !== null) {
    if (typeof answerText !== 'string' || answerText.trim() === '') {
      throw invalidAnswers(`${where}.answerText`);
    }
    serverAnswer.answer_text = answerText;
  }

  return serverAnswer;
};

// API-31 요청 본문(JSON 문자열). user_id는 서버 스키마상 JSON 숫자여야 하지만 JS Number로는 정확히
// 표현할 수 없으므로, 검증된 숫자 문자열을 숫자 리터럴로 그대로 이어 붙인다(숫자만 통과하므로 주입 불가).
// axios는 Content-Type이 application/json이고 data가 유효한 JSON 문자열이면 원문을 그대로 전송한다.
export const buildBulkAnswersRequestBody = (userId, answers) => {
  requireUserId(userId);

  if (!Array.isArray(answers) || answers.length === 0 || answers.length > MAX_QUESTION_NO) {
    throw invalidAnswers('answers');
  }

  const seen = new Set();
  const serverAnswers = answers.map((answer, index) => {
    const serverAnswer = toServerAnswer(answer, `answers[${index}]`);
    if (seen.has(serverAnswer.question_no)) throw invalidAnswers(`answers[${index}].questionNo`);
    seen.add(serverAnswer.question_no);
    return serverAnswer;
  });

  return `{"user_id":${userId},"answers":${JSON.stringify(serverAnswers)}}`;
};

// ── 응답 검증/변환 ───────────────────────────────────────────

// 2xx를 받았지만 본문이 명세와 다를 때. apiClient가 Auth envelope를 해석하지 못했을 때 쓰는 것과 같은
// kind/메시지를 쓰고, 어느 필드가 문제인지(값은 제외)만 invalidField로 남긴다.
const invalidResponse = field => {
  const error = createApiError({
    kind: API_ERROR_KIND.BUSINESS,
    message: '서버 응답 형식을 해석할 수 없습니다.',
  });
  error.invalidResponse = true;
  error.invalidField = field;
  return error;
};

const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
const isPositiveInteger = value => Number.isInteger(value) && value >= 1;
const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';
const isNullableString = value => value === null || typeof value === 'string';
const isPositiveIntegerArray = value => Array.isArray(value) && value.every(isPositiveInteger);

const requireObject = (body, field) => {
  if (!isPlainObject(body)) throw invalidResponse(field);
  return body;
};

const requireArray = (body, field) => {
  if (!Array.isArray(body)) throw invalidResponse(field);
  return body;
};

// 필드가 반드시 존재하고(키 누락 불가) 조건을 만족해야 한다. 없는 값을 기본값으로 채우지 않는다.
const requireField = (object, key, predicate, field) => {
  if (!hasOwn(object, key) || !predicate(object[key])) throw invalidResponse(`${field}.${key}`);
  return object[key];
};

const mapQuestion = (item, index) => {
  const field = `questions[${index}]`;
  const object = requireObject(item, field);

  const options = requireField(object, 'options', Array.isArray, field).map(
    (option, optionIndex) => {
      const optionField = `${field}.options[${optionIndex}]`;
      const optionObject = requireObject(option, optionField);
      return {
        code: requireField(optionObject, 'code', isNonEmptyString, optionField),
        label: requireField(optionObject, 'label', isNonEmptyString, optionField),
      };
    }
  );

  if (new Set(options.map(option => option.code)).size !== options.length) {
    throw invalidResponse(`${field}.options`);
  }

  return {
    questionNo: requireField(object, 'question_no', isPositiveInteger, field),
    phase: requireField(object, 'phase', isNonEmptyString, field),
    text: requireField(object, 'text', isNonEmptyString, field),
    purpose: requireField(object, 'purpose', value => typeof value === 'string', field),
    freeText: requireField(object, 'free_text', value => typeof value === 'boolean', field),
    options,
  };
};

const mapAnswer = (item, index) => {
  const field = `answers[${index}]`;
  const object = requireObject(item, field);

  return {
    questionNo: requireField(object, 'question_no', isPositiveInteger, field),
    answerCode: requireField(object, 'answer_code', isNonEmptyString, field),
    answerLabel: requireField(object, 'answer_label', value => typeof value === 'string', field),
    answerText: requireField(object, 'answer_text', isNullableString, field),
    // 서버 시각 문자열을 그대로 보존한다(수신 시 시간대 변환/자르기 없음).
    answeredAt: requireField(object, 'answered_at', isNonEmptyString, field),
  };
};

const rejectDuplicateQuestionNos = (items, field) => {
  const questionNos = items.map(item => item.questionNo);
  if (new Set(questionNos).size !== questionNos.length) throw invalidResponse(field);
};

// API-30 / API-33 목록 응답. 빈 배열은 형식상 정상이므로 그대로 [] 를 돌려준다
// (질문이 0개일 때의 처리는 상위 계층 책임).
export const mapQuestionsResponse = body => {
  const questions = requireArray(body, 'questions').map(mapQuestion);
  rejectDuplicateQuestionNos(questions, 'questions');
  return questions;
};

export const mapAnswersResponse = body => {
  const answers = requireArray(body, 'answers').map(mapAnswer);
  rejectDuplicateQuestionNos(answers, 'answers');
  return answers;
};

// API-31 / API-32 / API-34 공통 진행 상태. 응답의 user_id는 정밀도 손실 값이므로 사용하지 않는다.
export const mapProgressResponse = body => {
  const field = 'progress';
  const object = requireObject(body, field);

  const progress = {
    answeredCount: requireField(object, 'answered_count', isNonNegativeInteger, field),
    totalQuestions: requireField(object, 'total_questions', isPositiveInteger, field),
    isCompleted: requireField(object, 'is_completed', value => typeof value === 'boolean', field),
    remaining: requireField(object, 'remaining', isPositiveIntegerArray, field),
    unknownAnswers: requireField(object, 'unknown_answers', isPositiveIntegerArray, field),
    nextQuestionNo: requireField(
      object,
      'next_question_no',
      value => value === null || isPositiveInteger(value),
      field
    ),
  };

  // 완료라고 하면서 남은 문항이 있는 응답은 신뢰하지 않는다(완료 판단의 근거가 되는 값이므로).
  if (progress.isCompleted && (progress.remaining.length > 0 || progress.nextQuestionNo !== null)) {
    throw invalidResponse(`${field}.is_completed`);
  }

  return progress;
};

// API-35. 서버가 계산한 값만 담는다(타입/점수/이미지는 서버가 제공하지 않으므로 만들지 않는다).
export const mapProfileResponse = body => {
  const field = 'profile';
  const object = requireObject(body, field);

  return {
    statusCode: requireField(object, 'status_code', isNullableString, field),
    housingType: requireField(object, 'housing_type', isNullableString, field),
    workEnv: requireField(object, 'work_env', isNullableString, field),
    valuePriority: requireField(object, 'value_priority', isNullableString, field),
    mustKeepCategory: requireField(object, 'must_keep_category', isNullableString, field),
    moneyConcern: requireField(object, 'money_concern', isNullableString, field),
    successImage: requireField(object, 'success_image', isNullableString, field),
    cardTitle: requireField(object, 'card_title', isNullableString, field),
    cardSummary: requireField(object, 'card_summary', isNullableString, field),
    answeredCount: requireField(object, 'answered_count', isNonNegativeInteger, field),
    isCompleted: requireField(object, 'is_completed', value => typeof value === 'boolean', field),
    completedAt: requireField(object, 'completed_at', isNullableString, field),
  };
};

// ── API 함수 ─────────────────────────────────────────────────
// (createAsyncThunk가 아닌 일반 async 함수. Redux/화면 연결은 후속 단계에서 한다.)

const RAW = { responseFormat: 'raw' };

// API-30 GET /api/v1/work/onboarding/questions
export const fetchOnboardingQuestions = async () => {
  const body = await apiClient.get(API_ENDPOINTS.WORK.ONBOARDING.QUESTIONS, RAW);
  return mapQuestionsResponse(body);
};

// API-31 POST /api/v1/work/onboarding/{user_id}/answers
// answers: [{ questionNo, answerCode, answerText? }] (1~10개, questionNo 중복 불가)
export const submitOnboardingAnswers = async (userId, answers) => {
  const requestBody = buildBulkAnswersRequestBody(userId, answers);
  const body = await apiClient.post(API_ENDPOINTS.WORK.ONBOARDING.ANSWERS(userId), requestBody, {
    ...RAW,
    headers: { [API_HEADERS.CONTENT_TYPE]: 'application/json' },
  });
  return mapProgressResponse(body);
};

// API-32 POST /api/v1/work/onboarding/{user_id}/answers/{question_no} (보조)
// 본문에는 user_id가 없으므로 정밀도 문제가 없다. 서버 스키마상 body.question_no도 필수다.
export const submitOnboardingAnswer = async (userId, answer) => {
  requireUserId(userId);
  const serverAnswer = toServerAnswer(answer, 'answer');
  const body = await apiClient.post(
    API_ENDPOINTS.WORK.ONBOARDING.ANSWER(userId, serverAnswer.question_no),
    serverAnswer,
    RAW
  );
  return mapProgressResponse(body);
};

// API-33 GET /api/v1/work/onboarding/{user_id}/answers
export const fetchOnboardingAnswers = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.ONBOARDING.ANSWERS(userId), RAW);
  return mapAnswersResponse(body);
};

// API-34 GET /api/v1/work/onboarding/{user_id}/progress
export const fetchOnboardingProgress = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.ONBOARDING.PROGRESS(userId), RAW);
  return mapProgressResponse(body);
};

// API-35 GET /api/v1/work/onboarding/{user_id}/profile (답변이 하나도 없으면 서버가 404)
export const fetchFutureProfile = async userId => {
  requireUserId(userId);
  const body = await apiClient.get(API_ENDPOINTS.WORK.ONBOARDING.PROFILE(userId), RAW);
  return mapProfileResponse(body);
};

// ── 오류 종류 구분 ───────────────────────────────────────────

export const ONBOARDING_ERROR_TYPE = {
  INVALID_REQUEST: 'INVALID_REQUEST', // 보내기 전 입력 검증 실패(요청 안 함)
  NETWORK: 'NETWORK', // 서버 미도달
  TIMEOUT: 'TIMEOUT', // 응답 시간 초과 — 서버 처리 여부 알 수 없음
  UNAUTHORIZED: 'UNAUTHORIZED', // 401 / 토큰 없음·무효·세션 만료
  FORBIDDEN: 'FORBIDDEN', // 403 (경로 user_id가 인증 사용자와 다름 등)
  NOT_FOUND: 'NOT_FOUND', // 404 (API-35: 답변 없음)
  BAD_REQUEST: 'BAD_REQUEST', // 400 (잘못된 answer_code, Q9 본문 누락 등)
  VALIDATION: 'VALIDATION', // 422 (요청 형식/범위 위반)
  CLIENT_ERROR: 'CLIENT_ERROR', // 그 외 4xx
  SERVER: 'SERVER', // 5xx (500/503/504 …)
  INVALID_RESPONSE: 'INVALID_RESPONSE', // 2xx지만 본문이 명세와 다름
  CANCELED: 'CANCELED',
  CONFIG: 'CONFIG', // API 주소 미설정 등
  UNKNOWN: 'UNKNOWN',
};

const HTTP_4XX_STATUS_TYPES = {
  400: ONBOARDING_ERROR_TYPE.BAD_REQUEST,
  401: ONBOARDING_ERROR_TYPE.UNAUTHORIZED,
  403: ONBOARDING_ERROR_TYPE.FORBIDDEN,
  404: ONBOARDING_ERROR_TYPE.NOT_FOUND,
  422: ONBOARDING_ERROR_TYPE.VALIDATION,
};

// 네트워크/타임아웃/5xx를 "온보딩 미완료"로 오인하지 않도록 호출부가 이 값으로 분기한다.
export const getOnboardingErrorType = error => {
  if (error instanceof OnboardingRequestError) return ONBOARDING_ERROR_TYPE.INVALID_REQUEST;
  if (error?.invalidResponse === true) return ONBOARDING_ERROR_TYPE.INVALID_RESPONSE;

  switch (error?.kind) {
    case API_ERROR_KIND.NETWORK:
      return ONBOARDING_ERROR_TYPE.NETWORK;
    case API_ERROR_KIND.TIMEOUT:
      return ONBOARDING_ERROR_TYPE.TIMEOUT;
    case API_ERROR_KIND.CANCELED:
      return ONBOARDING_ERROR_TYPE.CANCELED;
    case API_ERROR_KIND.CONFIG:
      return ONBOARDING_ERROR_TYPE.CONFIG;
    case API_ERROR_KIND.AUTH_REQUIRED:
    case API_ERROR_KIND.TOKEN_INVALID:
    case API_ERROR_KIND.SESSION_EXPIRED:
      return ONBOARDING_ERROR_TYPE.UNAUTHORIZED;
    case API_ERROR_KIND.HTTP_5XX:
      return ONBOARDING_ERROR_TYPE.SERVER;
    case API_ERROR_KIND.HTTP_4XX:
      return HTTP_4XX_STATUS_TYPES[error.status] ?? ONBOARDING_ERROR_TYPE.CLIENT_ERROR;
    default:
      return ONBOARDING_ERROR_TYPE.UNKNOWN;
  }
};
