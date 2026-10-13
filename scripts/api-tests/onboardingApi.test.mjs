// Work 재무 온보딩 API 통신 레이어(API-30~35) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/onboardingApi.test.mjs
// user_id·토큰은 모의 서버 전용 가짜 값이다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';

// ── 실제 서버 미호출 검증용 감시 ─────────────────────────────
// axios(follow-redirects)가 쓰는 http/https.request를 감싸 목적지와 전송 바이트를 기록한다.
// 요청은 그대로 전달하므로 동작은 바뀌지 않는다. apiClient를 import하기 전에 설치한다.
const outbound = []; // 테스트마다 비움
const everRequested = []; // 비우지 않음 (마지막에 전체 목적지 검사)

const hostOf = target => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return target?.hostname ?? target?.host ?? null;
};

const toBuffer = chunk => Buffer.from(chunk);

const installRequestSpy = (mod, protocol) => {
  const original = mod.request;
  mod.request = function spiedRequest(...args) {
    const record = { protocol, host: hostOf(args[0]), chunks: [] };
    outbound.push(record);
    everRequested.push(record);

    const request = original.apply(this, args);
    const originalWrite = request.write;
    const originalEnd = request.end;

    request.write = function spiedWrite(chunk, ...rest) {
      if (chunk != null && typeof chunk !== 'function') record.chunks.push(toBuffer(chunk));
      return originalWrite.call(this, chunk, ...rest);
    };
    request.end = function spiedEnd(chunk, ...rest) {
      if (chunk != null && typeof chunk !== 'function') record.chunks.push(toBuffer(chunk));
      return originalEnd.call(this, chunk, ...rest);
    };
    return request;
  };
};

installRequestSpy(http, 'http');
installRequestSpy(https, 'https');

const rawBodyOf = record => Buffer.concat(record.chunks).toString('utf8');

// ── 환경 ─────────────────────────────────────────────────────
const gateway = new MockGateway();
const baseURL = await gateway.listen();

// apiClient/tokenService는 모듈 로드 시점에 env를 읽으므로 import 전에 설정한다.
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { default: apiClient } = await import('../../src/services/apiClient.js');
const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const api = await import('../../src/features/onboarding/onboardingApi.js');
const {
  ONBOARDING_ERROR_TYPE,
  ONBOARDING_REQUEST_ERROR,
  OnboardingRequestError,
  UNKNOWN_ANSWER_CODE,
  buildBulkAnswersRequestBody,
  fetchFutureProfile,
  fetchOnboardingAnswers,
  fetchOnboardingProgress,
  fetchOnboardingQuestions,
  getOnboardingErrorType,
  isValidOnboardingUserId,
  submitOnboardingAnswer,
  submitOnboardingAnswers,
} = api;

// JS Number로는 정확히 표현할 수 없는 크기의 user_id (Number('123456789012345678') === 123456789012345680)
const BIG_UID = '123456789012345678';
const QUESTIONS_PATH = '/api/v1/work/onboarding/questions';
const answersPath = uid => `/api/v1/work/onboarding/${uid}/answers`;
const answerPath = (uid, no) => `/api/v1/work/onboarding/${uid}/answers/${no}`;
const progressPath = uid => `/api/v1/work/onboarding/${uid}/progress`;
const profilePath = uid => `/api/v1/work/onboarding/${uid}/profile`;

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

const jsonRoute = body => () => ({ body });
const rawRoute = rawBody => () => ({ rawBody });

const questionFixture = (overrides = {}) => ({
  question_no: 1,
  phase: '현재',
  text: '지금 어떤 상태이신가요?',
  purpose: '목표 기간의 초기 가정',
  free_text: false,
  options: [
    { code: 'STUDENT', label: '학생' },
    { code: 'UNKNOWN', label: '아직 모르겠어요' },
  ],
  ...overrides,
});

const freeTextQuestionFixture = () =>
  questionFixture({
    question_no: 9,
    phase: '미래',
    text: "3년 뒤, 내가 생각하는 '성공한 내 모습'은?",
    free_text: true,
    options: [],
  });

const progressFixture = (overrides = {}) => ({
  user_id: 123,
  answered_count: 1,
  total_questions: 10,
  is_completed: false,
  remaining: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  unknown_answers: [],
  next_question_no: 2,
  ...overrides,
});

const completedProgressFixture = () =>
  progressFixture({
    answered_count: 10,
    is_completed: true,
    remaining: [],
    next_question_no: null,
    unknown_answers: [9],
  });

const profileFixture = (overrides = {}) => ({
  user_id: 123,
  status_code: 'STUDENT',
  housing_type: null,
  work_env: 'STARTUP',
  value_priority: 'WORK_LIFE',
  must_keep_category: 'FOOD',
  money_concern: 'NO_PLAN',
  success_image: null,
  card_title: '성장을 택한 균형을 지키는 사회인',
  card_summary: '지키고 싶은 소비: 먹는 것\n3년 뒤의 나: 작업실',
  answered_count: 10,
  is_completed: true,
  completed_at: '2026-10-11T03:00:00',
  ...overrides,
});

const answerFixture = (overrides = {}) => ({
  question_no: 1,
  answer_code: 'STUDENT',
  answer_label: '학생',
  answer_text: null,
  answered_at: '2026-10-11T03:00:00',
  ...overrides,
});

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  outbound.length = 0;
  await tokenService.clearTokens();
  // 기본: 유효한 Access Token으로 로그인된 상태
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// 6개 API 함수를 같은 조건으로 순회하기 위한 목록 (응답 검증/오류 분류 공통 테스트용)
const callAll = {
  'API-30 questions': () => fetchOnboardingQuestions(),
  'API-31 bulk answers': () =>
    submitOnboardingAnswers(BIG_UID, [{ questionNo: 1, answerCode: 'STUDENT' }]),
  'API-32 single answer': () =>
    submitOnboardingAnswer(BIG_UID, { questionNo: 1, answerCode: 'STUDENT' }),
  'API-33 answers': () => fetchOnboardingAnswers(BIG_UID),
  'API-34 progress': () => fetchOnboardingProgress(BIG_UID),
  'API-35 profile': () => fetchFutureProfile(BIG_UID),
};

const callAllPaths = {
  'API-30 questions': ['GET', QUESTIONS_PATH],
  'API-31 bulk answers': ['POST', answersPath(BIG_UID)],
  'API-32 single answer': ['POST', answerPath(BIG_UID, 1)],
  'API-33 answers': ['GET', answersPath(BIG_UID)],
  'API-34 progress': ['GET', progressPath(BIG_UID)],
  'API-35 profile': ['GET', profilePath(BIG_UID)],
};

const routeAll = handler => {
  for (const [method, path] of Object.values(callAllPaths)) gateway.route(method, path, handler);
};

// ── API-30 질문 목록 ─────────────────────────────────────────

test('API-30: 질문 목록 정상 응답을 camelCase 모델로 변환 (GET, Bearer 첨부, 본문 없음)', async () => {
  gateway.route('GET', QUESTIONS_PATH, jsonRoute([questionFixture(), freeTextQuestionFixture()]));

  const questions = await fetchOnboardingQuestions();

  assert.deepEqual(questions, [
    {
      questionNo: 1,
      phase: '현재',
      text: '지금 어떤 상태이신가요?',
      purpose: '목표 기간의 초기 가정',
      freeText: false,
      options: [
        { code: 'STUDENT', label: '학생' },
        { code: 'UNKNOWN', label: '아직 모르겠어요' },
      ],
    },
    {
      questionNo: 9,
      phase: '미래',
      text: "3년 뒤, 내가 생각하는 '성공한 내 모습'은?",
      purpose: '목표 기간의 초기 가정',
      freeText: true,
      options: [],
    },
  ]);

  const [request] = gateway.requestsTo(QUESTIONS_PATH);
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], undefined, 'GET에는 Content-Type 없음');
  assert.equal(request.body, undefined);
});

test('API-30: 빈 배열은 형식상 정상 → [] 그대로 반환 (가짜 질문을 만들지 않음)', async () => {
  gateway.route('GET', QUESTIONS_PATH, jsonRoute([]));
  assert.deepEqual(await fetchOnboardingQuestions(), []);
});

test('API-30: 잘못된 응답은 정상 데이터로 처리하지 않음 (INVALID_RESPONSE)', async () => {
  const q = questionFixture();
  const badBodies = {
    '배열이 아닌 객체': { questions: [q] },
    'Auth envelope 형태(raw 모드는 unwrap 안 함)': { success: true, data: [q], code: 'X' },
    '객체 한 개': q,
    '문자열 JSON': '"questions"',
    '숫자 JSON': '123',
    'null JSON': 'null',
    '빈 본문': '',
    'HTML 본문': '<html><body>Bad Gateway</body></html>',
    '항목이 null': [null],
    '항목이 문자열': ['q1'],
    'question_no가 문자열': [questionFixture({ question_no: '1' })],
    'question_no가 0': [questionFixture({ question_no: 0 })],
    'question_no가 소수': [questionFixture({ question_no: 1.5 })],
    'text 누락': [(({ text, ...rest }) => rest)(q)],
    'text가 빈 문자열': [questionFixture({ text: ' ' })],
    'phase가 숫자': [questionFixture({ phase: 1 })],
    'free_text 누락': [(({ free_text, ...rest }) => rest)(q)],
    'free_text가 문자열': [questionFixture({ free_text: 'false' })],
    'options 누락': [(({ options, ...rest }) => rest)(q)],
    'options가 객체': [questionFixture({ options: { code: 'A', label: 'B' } })],
    'option.label 누락': [questionFixture({ options: [{ code: 'A' }] })],
    'option.code가 빈 문자열': [questionFixture({ options: [{ code: '', label: 'B' }] })],
    'option 코드 중복': [
      questionFixture({
        options: [
          { code: 'A', label: '가' },
          { code: 'A', label: '나' },
        ],
      }),
    ],
    'question_no 중복': [q, questionFixture()],
  };

  for (const [name, body] of Object.entries(badBodies)) {
    gateway.route(
      'GET',
      QUESTIONS_PATH,
      typeof body === 'string' ? rawRoute(body) : jsonRoute(body)
    );
    const error = await rejectionOf(fetchOnboardingQuestions());
    assert.equal(error.invalidResponse, true, `${name}: invalidResponse`);
    assert.equal(error.kind, API_ERROR_KIND.BUSINESS, `${name}: kind`);
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.INVALID_RESPONSE, name);
    assert.ok(typeof error.invalidField === 'string' && error.invalidField, `${name}: 위치 정보`);
  }
});

// ── API-31 요청 구성 / user_id 원문 보존 ─────────────────────

const Q9_TEXT = '서른쯤엔 작업실 하나 두고 싶다';
const SAMPLE_ANSWERS = [
  { questionNo: 1, answerCode: 'STUDENT' },
  { questionNo: 9, answerCode: UNKNOWN_ANSWER_CODE, answerText: Q9_TEXT },
  { questionNo: 10, answerCode: 'NO_PLAN', answerText: null },
];

test('API-31: 큰 user_id가 요청 본문 원문(전송 바이트)에 숫자 리터럴 그대로 들어감', async () => {
  assert.notEqual(String(Number(BIG_UID)), BIG_UID, '전제: Number 변환 시 정밀도 손실');
  gateway.route('POST', answersPath(BIG_UID), jsonRoute(progressFixture()));

  const progress = await submitOnboardingAnswers(BIG_UID, SAMPLE_ANSWERS);

  const posts = outbound.filter(record => record.chunks.length > 0);
  assert.equal(posts.length, 1);
  const sentBody = rawBodyOf(posts[0]);
  assert.equal(
    sentBody,
    `{"user_id":${BIG_UID},"answers":[` +
      '{"question_no":1,"answer_code":"STUDENT"},' +
      `{"question_no":9,"answer_code":"UNKNOWN","answer_text":"${Q9_TEXT}"},` +
      '{"question_no":10,"answer_code":"NO_PLAN"}' +
      ']}'
  );
  assert.ok(sentBody.includes(`"user_id":${BIG_UID},`), 'user_id 숫자 원문 보존');
  assert.ok(!sentBody.includes('123456789012345680'), 'Number 변환된 값이 섞이지 않음');
  assert.ok(
    !sentBody.includes(`"user_id":"`),
    'user_id를 문자열로 보내지 않음(서버 스키마는 정수)'
  );

  // 모의 서버가 받은 요청 구성
  const [request] = gateway.requestsTo(answersPath(BIG_UID));
  assert.equal(request.method, 'POST');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['idempotency-key'], undefined, '명세에 없는 Idempotency-Key 미사용');
  assert.deepEqual(
    request.body.answers,
    [
      { question_no: 1, answer_code: 'STUDENT' },
      { question_no: 9, answer_code: 'UNKNOWN', answer_text: Q9_TEXT },
      { question_no: 10, answer_code: 'NO_PLAN' },
    ],
    '선택형은 answer_text 키를 생략(null로 채우지 않음), Q9는 UNKNOWN + answer_text'
  );

  // 응답 변환: 응답의 user_id는 반환하지 않는다
  assert.deepEqual(progress, {
    answeredCount: 1,
    totalQuestions: 10,
    isCompleted: false,
    remaining: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    unknownAnswers: [],
    nextQuestionNo: 2,
  });
  assert.ok(!('userId' in progress) && !('user_id' in progress));
});

test('API-31: 토큰 만료 후 refresh 재전송에서도 본문 원문이 동일하게 유지됨', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0'); // gateway.validTokens에 없음
  gateway.route('POST', answersPath(BIG_UID), jsonRoute(progressFixture()));

  await submitOnboardingAnswers(BIG_UID, SAMPLE_ANSWERS);

  assert.equal(gateway.refreshCount, 1, 'refresh는 1회');
  const requests = gateway.requestsTo(answersPath(BIG_UID));
  assert.equal(requests.length, 2, '최초 + 재전송 1회');
  assert.equal(requests[1].headers.authorization, 'Bearer access-1', '새 토큰으로 재전송');

  const bodies = outbound
    .filter(record => record.chunks.length > 0)
    .map(record => rawBodyOf(record))
    .filter(body => body.startsWith('{"user_id":'));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.ok(bodies[1].startsWith(`{"user_id":${BIG_UID},`));
});

test('API-31: 특수문자·줄바꿈이 있는 Q9 본문이 JSON으로 올바르게 이스케이프됨', () => {
  const text = '그는 "작업실"을\n원한다 \\ 끝';
  const body = buildBulkAnswersRequestBody(BIG_UID, [
    { questionNo: 9, answerCode: UNKNOWN_ANSWER_CODE, answerText: text },
  ]);
  const parsed = JSON.parse(body);
  assert.equal(parsed.answers[0].answer_text, text);
  assert.ok(body.startsWith(`{"user_id":${BIG_UID},`));
});

test('API-31: 서버가 주는 진행 상태 응답 구조를 검증 (정상/비정상)', async () => {
  gateway.route('POST', answersPath(BIG_UID), jsonRoute(completedProgressFixture()));
  const progress = await submitOnboardingAnswers(BIG_UID, SAMPLE_ANSWERS);
  assert.equal(progress.isCompleted, true);
  assert.deepEqual(progress.remaining, []);
  assert.equal(progress.nextQuestionNo, null);
  assert.deepEqual(progress.unknownAnswers, [9]);
});

// ── API-32 보조 단건 저장 ────────────────────────────────────

test('API-32: 단건 저장 요청 구성 (경로의 question_no, 본문에 question_no 포함, user_id 없음)', async () => {
  gateway.route('POST', answerPath(BIG_UID, 9), jsonRoute(progressFixture({ answered_count: 2 })));

  const progress = await submitOnboardingAnswer(BIG_UID, {
    questionNo: 9,
    answerCode: UNKNOWN_ANSWER_CODE,
    answerText: Q9_TEXT,
  });

  const [request] = gateway.requestsTo(answerPath(BIG_UID, 9));
  assert.equal(request.method, 'POST');
  assert.match(request.headers['content-type'], /^application\/json/);
  assert.deepEqual(request.body, {
    question_no: 9,
    answer_code: 'UNKNOWN',
    answer_text: Q9_TEXT,
  });
  assert.equal(progress.answeredCount, 2);
});

test('API-32: 선택형 답변은 answer_text 키를 보내지 않음', async () => {
  gateway.route('POST', answerPath(BIG_UID, 3), jsonRoute(progressFixture()));
  await submitOnboardingAnswer(BIG_UID, { questionNo: 3, answerCode: 'STARTUP' });
  const [request] = gateway.requestsTo(answerPath(BIG_UID, 3));
  assert.deepEqual(request.body, { question_no: 3, answer_code: 'STARTUP' });
});

// ── API-33 / 34 / 35 응답 구조 ───────────────────────────────

test('API-33: 답변 목록 정상/빈 배열/Q9 텍스트, answered_at은 문자열 그대로 보존', async () => {
  gateway.route(
    'GET',
    answersPath(BIG_UID),
    jsonRoute([
      answerFixture(),
      answerFixture({
        question_no: 9,
        answer_code: 'UNKNOWN',
        answer_label: '아직 모르겠어요',
        answer_text: Q9_TEXT,
        answered_at: '2026-10-11T03:00:01',
      }),
    ])
  );

  assert.deepEqual(await fetchOnboardingAnswers(BIG_UID), [
    {
      questionNo: 1,
      answerCode: 'STUDENT',
      answerLabel: '학생',
      answerText: null,
      answeredAt: '2026-10-11T03:00:00',
    },
    {
      questionNo: 9,
      answerCode: 'UNKNOWN',
      answerLabel: '아직 모르겠어요',
      answerText: Q9_TEXT,
      answeredAt: '2026-10-11T03:00:01',
    },
  ]);

  const [request] = gateway.requestsTo(answersPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.body, undefined);

  gateway.route('GET', answersPath(BIG_UID), jsonRoute([]));
  assert.deepEqual(await fetchOnboardingAnswers(BIG_UID), [], '빈 배열은 정상');
});

test('API-33: 잘못된 응답은 INVALID_RESPONSE', async () => {
  const badBodies = {
    객체: { answers: [answerFixture()] },
    null: 'null',
    '항목 null': [null],
    'question_no 문자열': [answerFixture({ question_no: '1' })],
    'answer_code 빈 문자열': [answerFixture({ answer_code: '' })],
    'answer_label 누락': [(({ answer_label, ...rest }) => rest)(answerFixture())],
    'answer_text 키 누락': [(({ answer_text, ...rest }) => rest)(answerFixture())],
    'answer_text 숫자': [answerFixture({ answer_text: 5 })],
    'answered_at 누락': [(({ answered_at, ...rest }) => rest)(answerFixture())],
    'question_no 중복': [answerFixture(), answerFixture()],
  };

  for (const [name, body] of Object.entries(badBodies)) {
    gateway.route(
      'GET',
      answersPath(BIG_UID),
      typeof body === 'string' ? rawRoute(body) : jsonRoute(body)
    );
    const error = await rejectionOf(fetchOnboardingAnswers(BIG_UID));
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.INVALID_RESPONSE, name);
  }
});

test('API-34: 진행 상태 정상 응답 (응답 user_id가 정밀도 손실 값이어도 사용하지 않음)', async () => {
  gateway.route(
    'GET',
    progressPath(BIG_UID),
    rawRoute(
      `{"user_id":${BIG_UID},"answered_count":10,"total_questions":10,"is_completed":true,` +
        '"remaining":[],"unknown_answers":[],"next_question_no":null}'
    )
  );

  const progress = await fetchOnboardingProgress(BIG_UID);

  assert.deepEqual(progress, {
    answeredCount: 10,
    totalQuestions: 10,
    isCompleted: true,
    remaining: [],
    unknownAnswers: [],
    nextQuestionNo: null,
  });
  const [request] = gateway.requestsTo(progressPath(BIG_UID));
  assert.equal(request.method, 'GET');
  assert.equal(request.body, undefined);
});

test('API-34: 답변이 없는 사용자의 진행 상태도 정상 (is_completed=false)', async () => {
  gateway.route(
    'GET',
    progressPath(BIG_UID),
    jsonRoute(
      progressFixture({
        answered_count: 0,
        remaining: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        next_question_no: 1,
      })
    )
  );
  const progress = await fetchOnboardingProgress(BIG_UID);
  assert.equal(progress.isCompleted, false);
  assert.equal(progress.nextQuestionNo, 1);
});

test('API-34: 잘못된 응답은 INVALID_RESPONSE (완료 판단의 근거가 되므로 엄격히 검증)', async () => {
  const done = completedProgressFixture();
  const without = key => {
    const copy = { ...progressFixture() };
    delete copy[key];
    return copy;
  };
  const badBodies = {
    배열: [progressFixture()],
    '빈 객체': {},
    null: 'null',
    '빈 본문': '',
    'answered_count 누락': without('answered_count'),
    'answered_count 문자열': progressFixture({ answered_count: '1' }),
    'answered_count 음수': progressFixture({ answered_count: -1 }),
    'total_questions 0': progressFixture({ total_questions: 0 }),
    'is_completed 누락': without('is_completed'),
    'is_completed 문자열': progressFixture({ is_completed: 'true' }),
    'is_completed 숫자': progressFixture({ is_completed: 1 }),
    'remaining 누락': without('remaining'),
    'remaining에 문자열': progressFixture({ remaining: ['2'] }),
    'unknown_answers 누락': without('unknown_answers'),
    'next_question_no 키 누락': without('next_question_no'),
    'next_question_no 문자열': progressFixture({ next_question_no: '2' }),
    '완료인데 remaining이 남아있음': { ...done, remaining: [3] },
    '완료인데 next_question_no가 있음': { ...done, next_question_no: 3 },
  };

  for (const [name, body] of Object.entries(badBodies)) {
    gateway.route(
      'GET',
      progressPath(BIG_UID),
      typeof body === 'string' ? rawRoute(body) : jsonRoute(body)
    );
    const error = await rejectionOf(fetchOnboardingProgress(BIG_UID));
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.INVALID_RESPONSE, name);
  }
});

test('API-35: Future Profile 정상 응답 (null 필드 허용, 서버가 주지 않는 값은 만들지 않음)', async () => {
  gateway.route('GET', profilePath(BIG_UID), jsonRoute(profileFixture()));

  const profile = await fetchFutureProfile(BIG_UID);

  assert.deepEqual(profile, {
    statusCode: 'STUDENT',
    housingType: null,
    workEnv: 'STARTUP',
    valuePriority: 'WORK_LIFE',
    mustKeepCategory: 'FOOD',
    moneyConcern: 'NO_PLAN',
    successImage: null,
    cardTitle: '성장을 택한 균형을 지키는 사회인',
    cardSummary: '지키고 싶은 소비: 먹는 것\n3년 뒤의 나: 작업실',
    answeredCount: 10,
    isCompleted: true,
    completedAt: '2026-10-11T03:00:00',
  });
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
      'answeredCount',
      'cardSummary',
      'cardTitle',
      'completedAt',
      'housingType',
      'isCompleted',
      'moneyConcern',
      'mustKeepCategory',
      'statusCode',
      'successImage',
      'valuePriority',
      'workEnv',
    ],
    '서버가 준 필드만 반환 (프로필 타입/점수/이미지 키와 userId를 임의로 추가하지 않음)'
  );

  const [request] = gateway.requestsTo(profilePath(BIG_UID));
  assert.equal(request.method, 'GET');
});

test('API-35: 잘못된 응답은 INVALID_RESPONSE', async () => {
  const without = key => {
    const copy = { ...profileFixture() };
    delete copy[key];
    return copy;
  };
  const badBodies = {
    배열: [profileFixture()],
    null: 'null',
    'card_title 키 누락': without('card_title'),
    'card_summary 숫자': profileFixture({ card_summary: 1 }),
    'status_code 객체': profileFixture({ status_code: {} }),
    'answered_count 문자열': profileFixture({ answered_count: '10' }),
    'is_completed 누락': without('is_completed'),
    'completed_at 숫자': profileFixture({ completed_at: 1760151600 }),
    'completed_at 키 누락': without('completed_at'),
  };

  for (const [name, body] of Object.entries(badBodies)) {
    gateway.route(
      'GET',
      profilePath(BIG_UID),
      typeof body === 'string' ? rawRoute(body) : jsonRoute(body)
    );
    const error = await rejectionOf(fetchFutureProfile(BIG_UID));
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.INVALID_RESPONSE, name);
  }
});

test('모든 조회 API의 경로에 큰 user_id 문자열이 그대로 사용됨', async () => {
  gateway.route('GET', answersPath(BIG_UID), jsonRoute([]));
  gateway.route('GET', progressPath(BIG_UID), jsonRoute(progressFixture()));
  gateway.route('GET', profilePath(BIG_UID), jsonRoute(profileFixture()));

  await fetchOnboardingAnswers(BIG_UID);
  await fetchOnboardingProgress(BIG_UID);
  await fetchFutureProfile(BIG_UID);

  assert.equal(gateway.requests.length, 3);
  for (const request of gateway.requests) {
    assert.ok(request.path.includes(`/${BIG_UID}/`), request.path);
    assert.ok(!request.path.includes('123456789012345680'));
  }
});

// ── 요청 검증 (요청을 보내기 전에 거부) ──────────────────────

test('user_id 검증: 숫자 문자열(1 ~ 2^63-1)만 허용, Number 등은 거부', () => {
  const valid = ['1', '123', BIG_UID, '9223372036854775807', '1000000000000000000'];
  const invalid = [
    '',
    '0',
    '00',
    '007',
    '-1',
    '+1',
    '1.5',
    '12a',
    ' 12',
    '12 ',
    '１２',
    '9223372036854775808', // 2^63
    '10000000000000000000', // 20자리
    123, // Number
    123n, // BigInt
    null,
    undefined,
    {},
    [],
    true,
  ];

  for (const value of valid) assert.equal(isValidOnboardingUserId(value), true, String(value));
  for (const value of invalid) assert.equal(isValidOnboardingUserId(value), false, String(value));
});

test('잘못된 user_id는 어떤 API에서도 요청 없이 OnboardingRequestError', async () => {
  const badIds = ['', '12a', '0', 123, null, undefined, '9223372036854775808'];
  const callers = [
    id => submitOnboardingAnswers(id, [{ questionNo: 1, answerCode: 'STUDENT' }]),
    id => submitOnboardingAnswer(id, { questionNo: 1, answerCode: 'STUDENT' }),
    id => fetchOnboardingAnswers(id),
    id => fetchOnboardingProgress(id),
    id => fetchFutureProfile(id),
  ];

  for (const id of badIds) {
    for (const call of callers) {
      const error = await rejectionOf(call(id));
      assert.ok(error instanceof OnboardingRequestError);
      assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_USER_ID);
      assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.INVALID_REQUEST);
      assert.ok(!String(error.message).includes('12a'), '입력 값을 메시지에 넣지 않음');
    }
  }

  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
  assert.equal(outbound.length, 0);
});

test('잘못된 answers는 요청 없이 INVALID_ANSWERS', async () => {
  const ok = { questionNo: 1, answerCode: 'STUDENT' };
  const badAnswers = {
    '배열 아님': 'answers',
    '빈 배열': [],
    '11개 초과': Array.from({ length: 11 }, (_, i) => ({
      questionNo: (i % 10) + 1,
      answerCode: 'A',
    })),
    '항목 null': [null],
    '항목 문자열': ['q1'],
    'questionNo 중복': [ok, { ...ok }],
    'questionNo 0': [{ ...ok, questionNo: 0 }],
    'questionNo 11': [{ ...ok, questionNo: 11 }],
    'questionNo 문자열': [{ ...ok, questionNo: '1' }],
    'questionNo 소수': [{ ...ok, questionNo: 1.5 }],
    'answerCode 누락': [{ questionNo: 1 }],
    'answerCode 빈 문자열': [{ ...ok, answerCode: '' }],
    'answerCode 공백 포함': [{ ...ok, answerCode: ' STUDENT' }],
    'answerCode 51자': [{ ...ok, answerCode: 'A'.repeat(51) }],
    'answerCode 숫자': [{ ...ok, answerCode: 1 }],
    'answerText 빈 문자열': [{ ...ok, answerText: '' }],
    'answerText 공백만': [{ ...ok, answerText: '   ' }],
    'answerText 숫자': [{ ...ok, answerText: 5 }],
  };

  for (const [name, answers] of Object.entries(badAnswers)) {
    const error = await rejectionOf(submitOnboardingAnswers(BIG_UID, answers));
    assert.ok(error instanceof OnboardingRequestError, name);
    assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS, name);
  }

  // 경계값은 허용: 50자 코드, 10개 답변, answerText undefined/null
  const maxCode = 'A'.repeat(50);
  assert.doesNotThrow(() =>
    buildBulkAnswersRequestBody(
      BIG_UID,
      Array.from({ length: 10 }, (_, i) => ({
        questionNo: i + 1,
        answerCode: maxCode,
        answerText: i % 2 ? null : undefined,
      }))
    )
  );

  // API-32의 questionNo 범위
  for (const questionNo of [0, 11, '1', 1.5, undefined]) {
    const error = await rejectionOf(
      submitOnboardingAnswer(BIG_UID, { questionNo, answerCode: 'STUDENT' })
    );
    assert.ok(error instanceof OnboardingRequestError);
    assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS);
  }

  assert.equal(gateway.requests.length, 0, '서버로 요청이 나가지 않음');
  assert.equal(outbound.length, 0);
});

// ── 오류 상태 구분 ───────────────────────────────────────────

const HTTP_ERROR_CASES = [
  {
    status: 400,
    body: { detail: '3번 문항의 답변 코드가 올바르지 않습니다.' },
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.BAD_REQUEST,
    code: null,
  },
  {
    status: 401,
    body: { code: 'UNAUTHENTICATED' },
    kind: API_ERROR_KIND.AUTH_REQUIRED,
    type: ONBOARDING_ERROR_TYPE.UNAUTHORIZED,
    code: 'UNAUTHENTICATED',
  },
  {
    status: 401,
    body: { detail: 'X-Authenticated-User-Id 헤더가 없습니다.' }, // Work 서비스 자체 401
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.UNAUTHORIZED,
    code: null,
  },
  {
    status: 403,
    body: { detail: '다른 사용자의 데이터에는 접근할 수 없습니다.' },
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.FORBIDDEN,
    code: null,
  },
  {
    status: 404,
    body: { detail: '아직 온보딩을 시작하지 않았습니다.' },
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.NOT_FOUND,
    code: null,
  },
  {
    status: 422,
    body: {
      code: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      service: 'moaje-work-service',
    },
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.VALIDATION,
    code: 'VALIDATION_ERROR',
  },
  {
    status: 409,
    body: { detail: 'conflict' },
    kind: API_ERROR_KIND.HTTP_4XX,
    type: ONBOARDING_ERROR_TYPE.CLIENT_ERROR,
    code: null,
  },
  {
    status: 500,
    body: { code: 'INTERNAL_SERVER_ERROR', message: '서버 내부 오류가 발생했습니다.' },
    kind: API_ERROR_KIND.HTTP_5XX,
    type: ONBOARDING_ERROR_TYPE.SERVER,
    code: 'INTERNAL_SERVER_ERROR',
  },
  {
    status: 503,
    body: { code: 'DB_CONNECTION_ERROR', message: '데이터베이스 연결에 실패했습니다.' },
    kind: API_ERROR_KIND.HTTP_5XX,
    type: ONBOARDING_ERROR_TYPE.SERVER,
    code: 'DB_CONNECTION_ERROR',
  },
  {
    status: 503, // Gateway 등이 본문 없이 돌려주는 경우
    rawBody: '',
    kind: API_ERROR_KIND.HTTP_5XX,
    type: ONBOARDING_ERROR_TYPE.SERVER,
    code: null,
  },
];

for (const errorCase of HTTP_ERROR_CASES) {
  const label = `${errorCase.status} ${errorCase.rawBody === '' ? '(본문 없음)' : JSON.stringify(errorCase.body).slice(0, 40)}`;

  test(`HTTP ${label} → ${errorCase.type}, 6개 API 모두 동일하게 구분`, async () => {
    routeAll(() => ({
      public: true,
      status: errorCase.status,
      ...(errorCase.rawBody !== undefined
        ? { rawBody: errorCase.rawBody }
        : { body: errorCase.body }),
    }));

    for (const [name, call] of Object.entries(callAll)) {
      const error = await rejectionOf(call());
      assert.equal(error.status, errorCase.status, `${name}: status`);
      assert.equal(error.kind, errorCase.kind, `${name}: kind`);
      assert.equal(error.code, errorCase.code, `${name}: code`);
      assert.equal(error.traceId, 'trace-header', `${name}: traceId 보존`);
      assert.equal(getOnboardingErrorType(error), errorCase.type, `${name}: type`);
      assert.notEqual(error.invalidResponse, true, `${name}: 검증 실패와 구분`);
    }
  });
}

test('토큰 없이 호출하면 AUTH_REQUIRED(401), refresh 시도 없음', async () => {
  await tokenService.clearTokens();
  routeAll(jsonRoute({}));

  for (const [name, call] of Object.entries(callAll)) {
    const error = await rejectionOf(call());
    assert.equal(error.kind, API_ERROR_KIND.AUTH_REQUIRED, name);
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.UNAUTHORIZED, name);
  }
  assert.equal(gateway.refreshCount, 0);
});

test('토큰 만료(INVALID_TOKEN) 시 refresh 후 1회 재시도로 성공 (API-34)', async () => {
  await tokenService.setTokens('expired-access', 'refresh-0');
  gateway.route('GET', progressPath(BIG_UID), jsonRoute(progressFixture()));

  const progress = await fetchOnboardingProgress(BIG_UID);

  assert.equal(progress.answeredCount, 1);
  assert.equal(gateway.refreshCount, 1);
  assert.equal(gateway.requestsTo(progressPath(BIG_UID)).length, 2);
});

test('네트워크 연결 끊김 → NETWORK (HTTP 오류와 구분)', async () => {
  routeAll(() => ({ public: true, destroy: true }));

  for (const [name, call] of Object.entries(callAll)) {
    const error = await rejectionOf(call());
    assert.equal(error.kind, API_ERROR_KIND.NETWORK, name);
    assert.equal(error.status, null, name);
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.NETWORK, name);
  }
});

test('응답 지연 → TIMEOUT (서버 처리 여부 불명, 네트워크 오류와 구분)', async () => {
  routeAll(() => ({ public: true, delay: 1200, body: {} }));

  for (const [name, call] of Object.entries(callAll)) {
    const error = await rejectionOf(call());
    assert.equal(error.kind, API_ERROR_KIND.TIMEOUT, name);
    assert.equal(getOnboardingErrorType(error), ONBOARDING_ERROR_TYPE.TIMEOUT, name);
  }
});

test('자동 재시도 없음: 실패한 요청은 1회만 전송', async () => {
  routeAll(() => ({ public: true, status: 503, body: { code: 'DB_CONNECTION_ERROR' } }));

  for (const [name, call] of Object.entries(callAll)) {
    const before = gateway.requests.length;
    await rejectionOf(call());
    assert.equal(gateway.requests.length - before, 1, name);
  }
});

test('getOnboardingErrorType: 분류표', () => {
  const type = getOnboardingErrorType;
  const T = ONBOARDING_ERROR_TYPE;
  const make = (kind, status = null) => createApiError({ kind, status });

  assert.equal(type(make(API_ERROR_KIND.NETWORK)), T.NETWORK);
  assert.equal(type(make(API_ERROR_KIND.TIMEOUT)), T.TIMEOUT);
  assert.equal(type(make(API_ERROR_KIND.CANCELED)), T.CANCELED);
  assert.equal(type(make(API_ERROR_KIND.CONFIG)), T.CONFIG);
  assert.equal(type(make(API_ERROR_KIND.AUTH_REQUIRED, 401)), T.UNAUTHORIZED);
  assert.equal(type(make(API_ERROR_KIND.TOKEN_INVALID, 401)), T.UNAUTHORIZED);
  assert.equal(type(make(API_ERROR_KIND.SESSION_EXPIRED, 401)), T.UNAUTHORIZED);
  assert.equal(type(make(API_ERROR_KIND.HTTP_5XX, 502)), T.SERVER);
  assert.equal(type(make(API_ERROR_KIND.HTTP_4XX, 429)), T.CLIENT_ERROR);
  assert.equal(
    type(make(API_ERROR_KIND.BUSINESS, 200)),
    T.UNKNOWN,
    'invalidResponse 표시가 없으면 UNKNOWN'
  );
  assert.equal(type(new OnboardingRequestError('X', 'x')), T.INVALID_REQUEST);
  assert.equal(type(new Error('boom')), T.UNKNOWN);
  assert.equal(type(undefined), T.UNKNOWN);
  assert.equal(type(null), T.UNKNOWN);
});

// ── 실제 서버 미호출 / 기존 앱 흐름 비연결 ────────────────────

test('apiClient 대상은 로컬 모의 Gateway(127.0.0.1)뿐', () => {
  assert.equal(apiClient.defaults.baseURL, baseURL);
  assert.equal(new URL(baseURL).hostname, '127.0.0.1');
});

test('이 테스트에서 발생한 모든 HTTP 요청은 127.0.0.1 모의 Gateway로만 전송됨 (https·외부 호스트 없음)', () => {
  assert.ok(everRequested.length > 0, '감시 장치가 요청을 관찰했는지 확인');
  for (const record of everRequested) {
    assert.equal(record.protocol, 'http');
    assert.equal(record.host, '127.0.0.1');
  }
  assert.ok(everRequested.length >= gateway.requests.length);
});
