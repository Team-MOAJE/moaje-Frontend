// 서버 질문 기반 온보딩 흐름 로직 테스트 (React/화면 없이 컨트롤러 직접 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingFlow.test.mjs
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

const everRequested = [];
for (const [mod, protocol] of [
  [http, 'http'],
  [https, 'https'],
]) {
  const original = mod.request;
  mod.request = function spied(...args) {
    const target = args[0];
    const host =
      typeof target === 'string' ? new URL(target).hostname : (target?.hostname ?? target?.host);
    everRequested.push({ protocol, host });
    return original.apply(this, args);
  };
}

const gateway = new MockGateway();
const baseURL = await gateway.listen();
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const flowModule = await import('../../src/features/onboarding/useWorkOnboardingFlow.js');
const draftModule =
  await import('../../src/features/onboarding/adapters/workOnboardingDraftStorage.js');
const repoModule =
  await import('../../src/features/onboarding/adapters/workOnboardingRepository.js');
const {
  ANSWER_REJECT_REASON,
  DRAFT_ISSUE,
  FLOW_STATUS,
  MAX_FREE_TEXT_LENGTH,
  QUESTION_INVALID_REASON,
  SUBMISSION_ISSUE,
  answersFromServerAnswers,
  checkDraftCompatibility,
  createWorkOnboardingFlow,
  normalizeQuestions,
} = flowModule;
const { getWorkOnboardingDraftStorage, workOnboardingDraftKey } = draftModule;
const { createWorkOnboardingRepository } = repoModule;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345679';
const QUESTIONS_PATH = '/api/v1/work/onboarding/questions';

// API-30 응답(snake_case)과 onboardingApi가 변환한 결과(camelCase) 두 형태의 서버 질문 10개
const CHOICES = {
  1: ['STUDENT', 'JOB_SEEKER', 'EMPLOYED', 'OTHER'],
  2: ['WITH_FAMILY', 'MONTHLY_RENT', 'JEONSE', 'DORM_SHARE'],
  3: ['LARGE_CORP', 'STARTUP', 'FREELANCE'],
  4: ['REWARD', 'SAVING', 'FAMILY', 'DEBT', 'EXPERIENCE'],
  5: ['HOME_REST', 'OUTDOOR', 'CULTURE', 'SOCIAL', 'SELF_DEV'],
  6: ['BUY_NOW', 'COMPARE', 'WAIT', 'BUDGET_CHECK'],
  7: ['HIGH_SALARY', 'WORK_LIFE'],
  8: ['FOOD', 'HOBBY', 'TRAVEL', 'APPEARANCE', 'RELATION', 'LEARNING'],
  10: ['NO_SAVING', 'NO_PLAN', 'UNEXPECTED', 'NO_KNOWLEDGE', 'DEBT_WORRY'],
};
const makeQuestions = () =>
  Array.from({ length: 10 }, (_, i) => {
    const questionNo = i + 1;
    const freeText = questionNo === 9;
    const codes = freeText ? [] : [...CHOICES[questionNo], 'UNKNOWN'];
    return {
      questionNo,
      phase: `단계${questionNo}`,
      text: `질문 ${questionNo}`,
      purpose: '목적',
      freeText,
      options: codes.map(code => ({ code, label: `${code} 라벨` })),
    };
  });
const makeServerQuestions = () =>
  makeQuestions().map(q => ({
    question_no: q.questionNo,
    phase: q.phase,
    text: q.text,
    purpose: q.purpose,
    free_text: q.freeText,
    options: q.options,
  }));

const makeRepo = (userId = UID, questions = makeQuestions()) => ({
  userId,
  draft: getWorkOnboardingDraftStorage(userId),
  loadQuestions: async () => questions,
});

const ready = async (opts = {}, repo = makeRepo()) => {
  const flow = createWorkOnboardingFlow({ repository: repo, ...opts });
  await flow.init();
  return flow;
};

// 첫 선택지로 1~8, 10을 채우고 Q9는 텍스트로 채운다
const answerAll = async (flow, q9 = '작업실 하나') => {
  for (let no = 1; no <= 10; no += 1) {
    if (no === 9) assert.deepEqual(flow.setText(q9), { ok: true });
    else assert.deepEqual(flow.selectOption(CHOICES[no][0]), { ok: true });
    if (no < 10) assert.deepEqual(flow.goNext(), { ok: true });
  }
};

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  // 이전 테스트에서 flush하지 않은 Draft 저장이 끝난 뒤에 저장소를 비운다.
  await new Promise(resolve => setTimeout(resolve, 10));
  gateway.reset();
  __store.clear();
  __resetControl();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 질문 로딩/정렬/거부 ──────────────────────────────────────

test('질문 10개 로딩: ready 상태, 하드코딩 질문이 아닌 서버 질문 사용', async () => {
  const flow = await ready();
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.READY);
  assert.equal(s.totalQuestions, 10);
  assert.equal(s.currentIndex, 0);
  assert.equal(s.currentQuestion.questionNo, 1);
  assert.equal(s.currentQuestion.text, '질문 1');
  assert.equal(s.mode, 'initial');
  assert.equal(s.isFirst, true);
  assert.equal(s.isLast, false);
  assert.equal(s.isComplete, false);
  assert.deepEqual(s.missingQuestionNos, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('질문 정렬: 서버가 순서를 섞어 보내도 questionNo 오름차순', async () => {
  const shuffled = makeQuestions().reverse();
  const result = normalizeQuestions(shuffled);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.questions.map(q => q.questionNo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.ok(Object.isFrozen(result.questions));
  assert.equal(shuffled[0].questionNo, 10, '입력 불변');
});

test('잘못된 질문 데이터 거부: 기본 질문으로 대체하지 않음', async () => {
  const q = makeQuestions;
  const cases = {
    '배열 아님': [{ questions: [] }, QUESTION_INVALID_REASON.NOT_ARRAY],
    '빈 배열': [[], QUESTION_INVALID_REASON.WRONG_COUNT],
    '9개': [q().slice(0, 9), QUESTION_INVALID_REASON.WRONG_COUNT],
    '11개': [[...q(), { ...q()[0], questionNo: 11 }], QUESTION_INVALID_REASON.WRONG_COUNT],
    '번호 중복': [
      q().map(x => (x.questionNo === 5 ? { ...x, questionNo: 4 } : x)),
      QUESTION_INVALID_REASON.DUPLICATE_QUESTION_NO,
    ],
    '번호 누락(11번)': [
      q().map(x => (x.questionNo === 10 ? { ...x, questionNo: 11 } : x)),
      QUESTION_INVALID_REASON.MISSING_QUESTION_NO,
    ],
    '항목 null': [[...q().slice(0, 9), null], QUESTION_INVALID_REASON.INVALID_QUESTION],
    'text 없음': [
      q().map(x => (x.questionNo === 2 ? { ...x, text: ' ' } : x)),
      QUESTION_INVALID_REASON.INVALID_QUESTION,
    ],
    'freeText 문자열': [
      q().map(x => (x.questionNo === 2 ? { ...x, freeText: 'false' } : x)),
      QUESTION_INVALID_REASON.INVALID_QUESTION,
    ],
    '선택지 코드 없음': [
      q().map(x => (x.questionNo === 2 ? { ...x, options: [{ label: 'x' }] } : x)),
      QUESTION_INVALID_REASON.INVALID_OPTIONS,
    ],
    '선택지 label 없음': [
      q().map(x => (x.questionNo === 2 ? { ...x, options: [{ code: 'A', label: '' }] } : x)),
      QUESTION_INVALID_REASON.INVALID_OPTIONS,
    ],
    '선택지 코드 중복': [
      q().map(x =>
        x.questionNo === 2
          ? {
              ...x,
              options: [
                { code: 'A', label: 'a' },
                { code: 'A', label: 'b' },
              ],
            }
          : x
      ),
      QUESTION_INVALID_REASON.DUPLICATE_OPTION_CODE,
    ],
    '선택형인데 선택지 없음': [
      q().map(x => (x.questionNo === 2 ? { ...x, options: [] } : x)),
      QUESTION_INVALID_REASON.UNEXPECTED_QUESTION_TYPE,
    ],
    'Q9가 선택형': [
      q().map(x =>
        x.questionNo === 9 ? { ...x, freeText: false, options: [{ code: 'A', label: 'a' }] } : x
      ),
      QUESTION_INVALID_REASON.UNEXPECTED_QUESTION_TYPE,
    ],
    'Q9가 선택지를 가짐': [
      q().map(x => (x.questionNo === 9 ? { ...x, options: [{ code: 'A', label: 'a' }] } : x)),
      QUESTION_INVALID_REASON.UNEXPECTED_QUESTION_TYPE,
    ],
    '다른 문항이 서술형': [
      q().map(x => (x.questionNo === 3 ? { ...x, freeText: true, options: [] } : x)),
      QUESTION_INVALID_REASON.UNEXPECTED_QUESTION_TYPE,
    ],
  };

  for (const [name, [input, reason]] of Object.entries(cases)) {
    const result = normalizeQuestions(input);
    assert.equal(result.ok, false, name);
    assert.equal(result.reason, reason, name);

    // 컨트롤러도 동일하게 questions_invalid 상태가 되며 답변할 수 없다
    const flow = await ready({}, makeRepo(UID, input));
    const s = flow.getSnapshot();
    assert.equal(s.status, FLOW_STATUS.QUESTIONS_INVALID, name);
    assert.equal(s.error.reason, reason, name);
    assert.equal(s.currentQuestion, undefined, name);
    assert.equal(flow.selectOption('STUDENT').reason, ANSWER_REJECT_REASON.NOT_READY, name);
    assert.equal(flow.prepareSubmission().issue, SUBMISSION_ISSUE.NOT_READY, name);
  }
  assert.equal(__store.size, 0, '잘못된 질문 상태에서는 Draft도 쓰지 않음');
});

test('질문 조회 실패(네트워크 등)는 questions_error, 질문을 만들어내지 않음', async () => {
  const repo = {
    userId: UID,
    draft: getWorkOnboardingDraftStorage(UID),
    loadQuestions: async () => {
      const error = new Error('x');
      error.kind = 'NETWORK';
      throw error;
    },
  };
  const flow = await ready({}, repo);
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.QUESTIONS_ERROR);
  assert.equal(s.error.type, 'NETWORK');
  assert.equal(s.questions, null);

  // 같은 컨트롤러에서 init 재호출로 복구 가능
  repo.loadQuestions = async () => makeQuestions();
  await flow.init();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.READY);
});

test('실제 repository + 모의 Gateway: API-30 응답이 그대로 ready 흐름이 됨 (쓰기 요청 없음)', async () => {
  gateway.route('GET', QUESTIONS_PATH, () => ({ body: makeServerQuestions() }));
  const repo = createWorkOnboardingRepository(UID);
  const flow = await ready({}, repo);

  assert.equal(flow.getSnapshot().status, FLOW_STATUS.READY);
  assert.equal(flow.getSnapshot().totalQuestions, 10);
  assert.ok(gateway.requests.every(r => r.method === 'GET'));
});

// ── 선택형 답변 ──────────────────────────────────────────────

test('선택형: 서버 option.code가 answerCode, answerText는 없음. UNKNOWN도 정상 선택지', async () => {
  const flow = await ready();
  assert.deepEqual(flow.selectOption('STUDENT'), { ok: true });
  assert.deepEqual(flow.getSnapshot().answers, { 1: { answerCode: 'STUDENT' } });
  assert.equal('answerText' in flow.getSnapshot().answers[1], false);
  assert.equal(flow.getSnapshot().isCurrentAnswered, true);

  assert.deepEqual(flow.selectOption('UNKNOWN'), { ok: true });
  assert.deepEqual(flow.getSnapshot().answers[1], { answerCode: 'UNKNOWN' });
});

test('선택형: 서버에 없는 코드/다른 질문의 코드 거부, 상태 불변', async () => {
  const flow = await ready();
  const before = flow.getSnapshot();

  for (const code of ['NOPE', 'JEONSE' /* Q2의 코드 */, '', null, undefined, 'student']) {
    assert.deepEqual(flow.selectOption(code), {
      ok: false,
      reason: ANSWER_REJECT_REASON.UNKNOWN_OPTION,
    });
  }
  assert.equal(flow.getSnapshot(), before, '스냅샷 객체까지 동일(변경 없음)');
  await flow.flushDraft();
  assert.equal(__store.size, 0, 'Draft도 쓰지 않음');
});

test('선택형 질문에는 텍스트/건너뛰기 API 거부, 서술형에는 selectOption 거부', async () => {
  const flow = await ready();
  assert.equal(flow.setText('x').reason, ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);
  assert.equal(flow.skipFreeText().reason, ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);

  flow.selectOption('STUDENT');
  for (let i = 1; i < 9; i += 1) {
    flow.selectOption(CHOICES[i][0]);
    flow.goNext();
  }
  assert.equal(flow.getSnapshot().currentQuestion.questionNo, 9);
  assert.equal(flow.selectOption('UNKNOWN').reason, ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);
});

// ── 이동 / 수정 ──────────────────────────────────────────────

test('이동: 답변 전에는 다음으로 갈 수 없고, 이전 이동·경계 처리', async () => {
  const flow = await ready();
  assert.equal(flow.goNext().reason, ANSWER_REJECT_REASON.NOT_ANSWERED);
  assert.equal(flow.goPrev().reason, ANSWER_REJECT_REASON.AT_BOUNDARY);

  flow.selectOption('STUDENT');
  assert.deepEqual(flow.goNext(), { ok: true });
  assert.equal(flow.getSnapshot().currentIndex, 1);
  assert.equal(flow.getSnapshot().currentQuestion.questionNo, 2);
  assert.equal(flow.getSnapshot().isCurrentAnswered, false);

  assert.deepEqual(flow.goPrev(), { ok: true });
  assert.equal(flow.getSnapshot().currentIndex, 0);
  assert.equal(flow.getSnapshot().currentAnswer.answerCode, 'STUDENT', '이전 답변 유지');

  // 마지막 질문에서 다음 이동 불가
  await answerAll(flow);
  const s = flow.getSnapshot();
  assert.equal(s.isLast, true);
  assert.equal(s.currentQuestion.questionNo, 10);
  assert.equal(flow.goNext().reason, ANSWER_REJECT_REASON.AT_BOUNDARY);
  assert.equal(s.isComplete, true);
  assert.deepEqual(s.missingQuestionNos, []);
});

test('기존 답변 수정: 이전 질문으로 돌아가 바꾸면 해당 문항만 변경', async () => {
  const flow = await ready();
  flow.selectOption('STUDENT');
  flow.goNext();
  flow.selectOption('JEONSE');
  flow.goPrev();
  flow.selectOption('EMPLOYED');

  assert.deepEqual(flow.getSnapshot().answers, {
    1: { answerCode: 'EMPLOYED' },
    2: { answerCode: 'JEONSE' },
  });
});

// ── Q9 ──────────────────────────────────────────────────────

const gotoQ9 = async (opts, repo) => {
  const flow = await ready(opts, repo);
  for (let no = 1; no <= 8; no += 1) {
    flow.selectOption(CHOICES[no][0]);
    flow.goNext();
  }
  assert.equal(flow.getSnapshot().currentQuestion.questionNo, 9);
  return flow;
};

test('Q9 텍스트 입력: { answerCode: UNKNOWN, answerText }', async () => {
  const flow = await gotoQ9();
  assert.deepEqual(flow.setText('서른쯤엔 작업실 하나 두고 싶다'), { ok: true });
  assert.deepEqual(flow.getSnapshot().answers[9], {
    answerCode: 'UNKNOWN',
    answerText: '서른쯤엔 작업실 하나 두고 싶다',
  });
  assert.equal(flow.getSnapshot().isCurrentAnswered, true);
});

test('Q9 아무것도 입력하지 않은 상태는 답변 없음 (자동 UNKNOWN 아님)', async () => {
  const flow = await gotoQ9();
  assert.equal(flow.getSnapshot().currentAnswer, undefined);
  assert.equal(flow.getSnapshot().isCurrentAnswered, false);
  assert.equal(flow.goNext().reason, ANSWER_REJECT_REASON.NOT_ANSWERED);
  assert.deepEqual(flow.getSnapshot().missingQuestionNos, [9, 10]);
});

test('Q9 공백만 입력: EMPTY_TEXT로 거부, 기존 답변과 Draft는 변경하지 않음', async () => {
  const flow = await gotoQ9();
  for (const blank of [' ', '   ', '\n\t ', '　']) {
    assert.deepEqual(flow.setText(blank), { ok: false, reason: ANSWER_REJECT_REASON.EMPTY_TEXT });
    assert.equal(flow.getSnapshot().answers[9], undefined, '답변이 없던 상태 유지(UNKNOWN 아님)');
  }

  // 기존 유효 답변이 있을 때: 거부되어도 답변·스냅샷·Draft 모두 그대로
  flow.setText('abc');
  await flow.flushDraft();
  const snapshotBefore = flow.getSnapshot();
  const storedBefore = __store.get(workOnboardingDraftKey(UID));
  let notifications = 0;
  flow.subscribe(() => {
    notifications += 1;
  });

  for (const blank of [' ', '   ', '\n', '　']) {
    assert.deepEqual(flow.setText(blank), { ok: false, reason: ANSWER_REJECT_REASON.EMPTY_TEXT });
  }
  assert.equal(flow.setText(null).reason, ANSWER_REJECT_REASON.EMPTY_TEXT);
  assert.equal(flow.setText(undefined).reason, ANSWER_REJECT_REASON.EMPTY_TEXT);
  await flow.flushDraft();

  assert.equal(flow.getSnapshot(), snapshotBefore, '스냅샷 참조까지 동일');
  assert.deepEqual(flow.getSnapshot().answers[9], { answerCode: 'UNKNOWN', answerText: 'abc' });
  assert.equal(__store.get(workOnboardingDraftKey(UID)), storedBefore, 'Draft 변경 없음');
  assert.equal(notifications, 0, '구독자 알림도 없음');
});

test('Q9 빈 문자열: 기존 답변 삭제(ok:true, 자동 UNKNOWN 아님), 삭제가 Draft에 반영됨', async () => {
  const flow = await gotoQ9();
  flow.setText('abc');
  assert.deepEqual(flow.setText(''), { ok: true });
  assert.equal(flow.getSnapshot().answers[9], undefined);
  assert.equal(flow.getSnapshot().isCurrentAnswered, false);
  await flow.flushDraft();
  assert.equal(JSON.parse(__store.get(workOnboardingDraftKey(UID))).answers[9], undefined);

  // 답변이 없는 상태에서 빈 문자열: 변경 없음
  const before = flow.getSnapshot();
  assert.deepEqual(flow.setText(''), { ok: true });
  assert.equal(flow.getSnapshot(), before);
});

test('Q9 거부 후에도 기존 답변 수정과 제출 준비가 정상 동작', async () => {
  const flow = await ready();
  await answerAll(flow, '처음 답');
  flow.goPrev(); // 9번
  assert.equal(flow.setText('   ').ok, false);
  assert.equal(
    flow.prepareSubmission().payload[8].answerText,
    '처음 답',
    '거부된 입력은 제출 내용에 영향 없음'
  );

  assert.deepEqual(flow.setText('  수정한 답  '), { ok: true });
  const result = flow.prepareSubmission();
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload[8], {
    questionNo: 9,
    answerCode: 'UNKNOWN',
    answerText: '수정한 답',
  });
});

test('Q9 명시적 건너뛰기: { answerCode: UNKNOWN } (answerText 키 없음), 입력했던 텍스트는 버림', async () => {
  const flow = await gotoQ9();
  flow.setText('먼저 쓴 내용');
  assert.deepEqual(flow.skipFreeText(), { ok: true });
  assert.deepEqual(flow.getSnapshot().answers[9], { answerCode: 'UNKNOWN' });
  assert.equal('answerText' in flow.getSnapshot().answers[9], false);
  assert.deepEqual(flow.goNext(), { ok: true });
});

test('Q9 60자 제한(UI 제한): 60자 허용, 61자 거부하고 기존 값 유지, 이모지는 글자 수로 계산', async () => {
  assert.equal(MAX_FREE_TEXT_LENGTH, 60);
  const flow = await gotoQ9();

  assert.deepEqual(flow.setText('가'.repeat(60)), { ok: true });
  assert.deepEqual(flow.setText('가'.repeat(61)), {
    ok: false,
    reason: ANSWER_REJECT_REASON.TEXT_TOO_LONG,
  });
  assert.equal(flow.getSnapshot().answers[9].answerText, '가'.repeat(60), '거부 시 기존 값 유지');

  assert.deepEqual(flow.setText('😀'.repeat(60)), { ok: true }, '서로게이트 쌍도 1글자');
  assert.equal(flow.setText('😀'.repeat(61)).reason, ANSWER_REJECT_REASON.TEXT_TOO_LONG);
  assert.deepEqual(
    flow.setText(`  ${'가'.repeat(60)}  `),
    { ok: true },
    '앞뒤 공백은 제외하고 센다'
  );
});

// ── Draft ────────────────────────────────────────────────────

test('Draft 저장: 답변·이동 때마다 저장, mode/위치/답변 포함, 정확한 키', async () => {
  const flow = await ready({ mode: 'retake' });
  flow.selectOption('STUDENT');
  flow.goNext();
  flow.selectOption('JEONSE');
  await flow.flushDraft();

  const raw = JSON.parse(__store.get(workOnboardingDraftKey(UID)));
  assert.equal(raw.mode, 'retake');
  assert.equal(raw.currentIndex, 1);
  assert.deepEqual(raw.answers, { 1: { answerCode: 'STUDENT' }, 2: { answerCode: 'JEONSE' } });
  assert.equal(workOnboardingDraftKey(UID), `@financialOnboarding:draftServer:v1:${UID}`);
});

test('Draft 복원: mode가 일치하면 위치/답변/mode를 그대로 자동 복원 (retake)', async () => {
  const first = await ready({ mode: 'retake' });
  first.selectOption('STUDENT');
  first.goNext();
  first.selectOption('JEONSE');
  first.goNext();
  await first.flushDraft();

  const second = await ready({ mode: 'retake', initialAnswers: { 1: { answerCode: 'OTHER' } } });
  const s = second.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.READY);
  assert.equal(s.mode, 'retake');
  assert.equal(s.currentIndex, 2);
  assert.deepEqual(s.answers, { 1: { answerCode: 'STUDENT' }, 2: { answerCode: 'JEONSE' } });
  assert.equal(s.modeMismatch, null);
});

test('Draft 복원: mode가 일치하면 자동 복원 (initial)', async () => {
  const first = await ready({ mode: 'initial' });
  first.selectOption('STUDENT');
  first.goNext();
  await first.flushDraft();

  const second = await ready({ mode: 'initial' });
  assert.equal(second.getSnapshot().status, FLOW_STATUS.READY);
  assert.equal(second.getSnapshot().mode, 'initial');
  assert.equal(second.getSnapshot().currentIndex, 1);
  assert.equal(second.getSnapshot().answers[1].answerCode, 'STUDENT');
});

test('Draft가 없으면 initialAnswers(재검사의 기존 서버 답변)로 시작, 요청 mode 사용', async () => {
  const serverAnswers = [
    { questionNo: 1, answerCode: 'EMPLOYED', answerLabel: 'x', answerText: null, answeredAt: 't' },
    { questionNo: 9, answerCode: 'UNKNOWN', answerLabel: 'x', answerText: '바다', answeredAt: 't' },
  ];
  const initialAnswers = answersFromServerAnswers(serverAnswers);
  assert.deepEqual(initialAnswers, {
    1: { answerCode: 'EMPLOYED' },
    9: { answerCode: 'UNKNOWN', answerText: '바다' },
  });

  const flow = await ready({ mode: 'retake', initialAnswers });
  assert.equal(flow.getSnapshot().mode, 'retake');
  assert.equal(flow.getSnapshot().answers[1].answerCode, 'EMPLOYED');
  await flow.flushDraft();
  assert.equal(__store.size, 0, '초기화만으로는 Draft를 쓰지 않음');
  initialAnswers[1].answerCode = 'X';
  assert.equal(flow.getSnapshot().answers[1].answerCode, 'EMPLOYED', '입력 객체와 분리');
});

test('Draft 사용자별 분리', async () => {
  const a = await ready({}, makeRepo(UID));
  a.selectOption('STUDENT');
  await a.flushDraft();

  const b = await ready({}, makeRepo(OTHER_UID));
  assert.deepEqual(b.getSnapshot().answers, {}, '다른 사용자는 A의 Draft를 보지 못함');
  b.selectOption('EMPLOYED');
  await b.flushDraft();

  const a2 = await ready({}, makeRepo(UID));
  assert.equal(a2.getSnapshot().answers[1].answerCode, 'STUDENT');
  const b2 = await ready({}, makeRepo(OTHER_UID));
  assert.equal(b2.getSnapshot().answers[1].answerCode, 'EMPLOYED');
});

test('Draft 저장 실패는 흐름을 막지 않고 draftError로 알리며 다음 저장 성공 시 해제', async () => {
  const flow = await ready();
  __control.fail.set = 1;
  assert.deepEqual(flow.selectOption('STUDENT'), { ok: true });
  await flow.flushDraft();
  assert.equal(flow.getSnapshot().draftError, true);
  assert.equal(flow.getSnapshot().answers[1].answerCode, 'STUDENT', '화면 상태는 유지');

  flow.selectOption('OTHER');
  await flow.flushDraft();
  assert.equal(flow.getSnapshot().draftError, false);
});

test('Draft 읽기 실패는 draft_error: 임의로 새로 시작하지 않고 Draft를 건드리지 않음', async () => {
  const seeded = await ready();
  seeded.selectOption('STUDENT');
  await seeded.flushDraft();
  const before = __store.get(workOnboardingDraftKey(UID));

  __control.fail.get = 1;
  const flow = await ready();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_ERROR);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), before);

  await flow.init(); // 재시도하면 정상 복원
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.READY);
  assert.equal(flow.getSnapshot().answers[1].answerCode, 'STUDENT');
});

// ── 질문 변경 감지 ───────────────────────────────────────────

const seedDraft = async (draft, userId = UID) => {
  await getWorkOnboardingDraftStorage(userId).save(draft);
  return __store.get(workOnboardingDraftKey(userId));
};

test('질문 변경 감지: 각 유형을 감지하고 이유를 반환', () => {
  const questions = normalizeQuestions(makeQuestions()).questions;
  const base = { mode: 'initial', currentIndex: 2 };
  const check = answers => checkDraftCompatibility(questions, { ...base, answers });

  assert.deepEqual(check({ 1: { answerCode: 'STUDENT' }, 9: { answerCode: 'UNKNOWN' } }), {
    compatible: true,
    issues: [],
  });
  assert.deepEqual(check({ 1: { answerCode: 'REMOVED_CODE' } }).issues, [
    { type: DRAFT_ISSUE.CODE_NOT_IN_OPTIONS, questionNo: 1 },
  ]);
  assert.deepEqual(check({ 2: { answerCode: 'STUDENT' } }).issues, [
    { type: DRAFT_ISSUE.CODE_NOT_IN_OPTIONS, questionNo: 2 },
  ]); // 다른 질문의 코드
  assert.deepEqual(check({ 11: { answerCode: 'A' } }).issues, [
    { type: DRAFT_ISSUE.UNKNOWN_QUESTION, questionNo: 11 },
  ]);
  assert.deepEqual(check({ 9: { answerCode: 'MONTHLY_RENT' } }).issues, [
    { type: DRAFT_ISSUE.TYPE_CHANGED_TO_FREE_TEXT, questionNo: 9 },
  ]); // 선택형 → 서술형
  assert.deepEqual(check({ 3: { answerCode: 'UNKNOWN', answerText: '텍스트' } }).issues, [
    { type: DRAFT_ISSUE.TYPE_CHANGED_TO_CHOICE, questionNo: 3 },
  ]); // 서술형 → 선택형
  assert.deepEqual(check({ 9: { answerCode: 'UNKNOWN', answerText: '가'.repeat(61) } }).issues, [
    { type: DRAFT_ISSUE.TEXT_TOO_LONG, questionNo: 9 },
  ]);
  assert.deepEqual(
    checkDraftCompatibility(questions, { ...base, currentIndex: 10, answers: {} }).issues,
    [{ type: DRAFT_ISSUE.INDEX_OUT_OF_RANGE }]
  );
  assert.equal(
    check({ 1: { answerCode: 'X' }, 2: { answerCode: 'Y' } }).issues.length,
    2,
    '복수 이슈'
  );
});

test('호환되지 않는 Draft는 draft_incompatible: 자동 삭제/수정 없음, 답변 불가, 이슈와 원본 Draft 제공', async () => {
  const raw = await seedDraft({
    mode: 'retake',
    currentIndex: 4,
    answers: { 1: { answerCode: 'STUDENT' }, 2: { answerCode: 'GONE_CODE' } },
  });

  const flow = await ready({ mode: 'retake' });
  await flow.flushDraft();
  const s = flow.getSnapshot();

  assert.equal(s.status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.deepEqual(s.issues, [{ type: DRAFT_ISSUE.CODE_NOT_IN_OPTIONS, questionNo: 2 }]);
  assert.equal(s.incompatibleDraft.mode, 'retake');
  assert.equal(s.incompatibleDraft.fromDraft, true);
  assert.equal(s.incompatibleDraft.answers[1].answerCode, 'STUDENT');
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw, '저장된 Draft 원본 그대로');

  // 이 상태에서는 어떤 입력도 받지 않고 Draft도 쓰지 않는다
  assert.equal(flow.selectOption('STUDENT').reason, ANSWER_REJECT_REASON.NOT_READY);
  assert.equal(flow.goNext().reason, ANSWER_REJECT_REASON.NOT_READY);
  assert.equal(flow.prepareSubmission().issue, SUBMISSION_ISSUE.NOT_READY);
  await flow.flushDraft();
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);

  // init을 다시 호출해도(재진입) 삭제하지 않는다
  await flow.init();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('질문이 선택형↔서술형으로 바뀐 경우도 Draft 보존 + 호환성 오류', async () => {
  const raw = await seedDraft({
    mode: 'initial',
    currentIndex: 0,
    answers: { 3: { answerCode: 'UNKNOWN', answerText: '예전 서술형 답' } },
  });
  const flow = await ready();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.equal(flow.getSnapshot().issues[0].type, DRAFT_ISSUE.TYPE_CHANGED_TO_CHOICE);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('startFresh(호환성 오류): 요청한 mode로 새로 시작, 그때만 서버 Draft 삭제 (다른 사용자·기존 키 불변)', async () => {
  const legacyDraftKey = '@financialOnboarding:draft:v1:' + UID;
  const legacyResultKey = '@financialOnboarding:result:v1:' + UID;
  __store.set(legacyDraftKey, 'legacy-draft');
  __store.set(legacyResultKey, 'legacy-result');
  await seedDraft({ mode: 'retake', currentIndex: 4, answers: { 2: { answerCode: 'GONE' } } });
  await seedDraft(
    { mode: 'initial', currentIndex: 1, answers: { 1: { answerCode: 'OTHER' } } },
    OTHER_UID
  );

  const flow = await ready({ mode: 'retake' });
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.ok(__store.has(workOnboardingDraftKey(UID)), '호출 전에는 삭제되지 않음');

  assert.deepEqual(await flow.startFresh(), { ok: true });
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.READY);
  assert.equal(s.mode, 'retake');
  assert.equal(s.currentIndex, 0);
  assert.deepEqual(s.answers, {});
  assert.deepEqual(s.issues, []);
  assert.equal(s.incompatibleDraft, null);
  assert.equal(__store.has(workOnboardingDraftKey(UID)), false, '이 사용자의 서버 Draft만 삭제');
  assert.ok(__store.has(workOnboardingDraftKey(OTHER_UID)), '다른 사용자 Draft 유지');
  assert.equal(__store.get(legacyDraftKey), 'legacy-draft');
  assert.equal(__store.get(legacyResultKey), 'legacy-result');

  flow.selectOption('STUDENT');
  await flow.flushDraft();
  assert.equal(
    JSON.parse(__store.get(workOnboardingDraftKey(UID))).answers[1].answerCode,
    'STUDENT'
  );

  assert.equal((await flow.startFresh()).reason, ANSWER_REJECT_REASON.NOT_READY);
});

// ── Draft mode 충돌 ──────────────────────────────────────────

const RETAKE_INITIAL = {
  1: { answerCode: 'EMPLOYED' },
  9: { answerCode: 'UNKNOWN', answerText: '바다' },
};

test('mode 불일치(요청 initial, 저장 retake): 자동 복원 금지, draft_mode_mismatch, Draft 보존, 두 mode 구분 제공', async () => {
  const raw = await seedDraft({
    mode: 'retake',
    currentIndex: 3,
    answers: { 1: { answerCode: 'STUDENT' } },
  });

  const flow = await ready({ mode: 'initial' });
  await flow.flushDraft();
  const s = flow.getSnapshot();

  assert.equal(s.status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(s.requestedMode, 'initial');
  assert.equal(s.modeMismatch.requestedMode, 'initial');
  assert.equal(s.modeMismatch.draftMode, 'retake');
  assert.equal(s.modeMismatch.draft.mode, 'retake');
  assert.equal(s.modeMismatch.draft.currentIndex, 3);
  assert.deepEqual(s.modeMismatch.draft.answers, { 1: { answerCode: 'STUDENT' } });
  assert.deepEqual(s.answers, {}, 'Draft 답변이 흐름에 적용되지 않음');
  assert.equal(s.currentQuestion, undefined);

  assert.equal(flow.selectOption('STUDENT').reason, ANSWER_REJECT_REASON.NOT_READY);
  assert.equal(flow.goNext().reason, ANSWER_REJECT_REASON.NOT_READY);
  assert.equal(flow.prepareSubmission().issue, SUBMISSION_ISSUE.NOT_READY);
  await flow.flushDraft();
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw, '자동 삭제/덮어쓰기 없음');

  await flow.init();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('mode 불일치(요청 retake, 저장 initial): 서버 기존 답변(initialAnswers)이 옛 Draft에 가려지지 않음', async () => {
  const raw = await seedDraft({
    mode: 'initial',
    currentIndex: 5,
    answers: { 1: { answerCode: 'STUDENT' } },
  });

  const flow = await ready({ mode: 'retake', initialAnswers: RETAKE_INITIAL });
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(flow.getSnapshot().modeMismatch.draftMode, 'initial');
  assert.deepEqual(flow.getSnapshot().answers, {});
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('startFresh(mode 불일치): 요청 mode 사용, 재검사는 initialAnswers로 시작, 그때만 Draft 삭제', async () => {
  await seedDraft({ mode: 'initial', currentIndex: 5, answers: { 1: { answerCode: 'STUDENT' } } });
  const flow = await ready({ mode: 'retake', initialAnswers: RETAKE_INITIAL });
  assert.ok(__store.has(workOnboardingDraftKey(UID)));

  assert.deepEqual(await flow.startFresh(), { ok: true });
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.READY);
  assert.equal(s.mode, 'retake', 'Draft의 mode(initial)가 아니라 요청 mode');
  assert.equal(s.currentIndex, 0);
  assert.deepEqual(s.answers, RETAKE_INITIAL, '재검사 기존 서버 답변으로 시작');
  assert.equal(s.modeMismatch, null);
  assert.equal(__store.has(workOnboardingDraftKey(UID)), false);

  // initialAnswers는 복사본: 이후 입력해도 원본 객체가 바뀌지 않음
  flow.selectOption('JOB_SEEKER');
  assert.equal(RETAKE_INITIAL[1].answerCode, 'EMPLOYED');
  await flow.flushDraft();
  assert.equal(JSON.parse(__store.get(workOnboardingDraftKey(UID))).mode, 'retake');
});

test('startFresh(mode 불일치, 요청 initial): 빈 답변으로 initial 시작 (initialAnswers 무시)', async () => {
  await seedDraft({ mode: 'retake', currentIndex: 2, answers: { 1: { answerCode: 'STUDENT' } } });
  const flow = await ready({ mode: 'initial', initialAnswers: RETAKE_INITIAL });
  await flow.startFresh();
  assert.equal(flow.getSnapshot().mode, 'initial');
  assert.deepEqual(flow.getSnapshot().answers, {});
});

test('startFresh: 재검사 initialAnswers가 현재 질문과 맞지 않으면 호환성 오류 상태', async () => {
  await seedDraft({ mode: 'initial', currentIndex: 0, answers: { 1: { answerCode: 'STUDENT' } } });
  const flow = await ready({ mode: 'retake', initialAnswers: { 1: { answerCode: 'OLD_CODE' } } });
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);

  assert.deepEqual(await flow.startFresh(), { ok: true });
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.equal(flow.getSnapshot().incompatibleDraft.fromDraft, false);
  assert.equal(flow.getSnapshot().modeMismatch, null);
  assert.equal(
    __store.has(workOnboardingDraftKey(UID)),
    false,
    '사용자가 선택한 Draft 삭제는 수행됨'
  );
});

test('startFresh: Draft 삭제 실패는 성공으로 처리하지 않음 (상태·Draft 그대로, 재시도 가능)', async () => {
  const raw = await seedDraft({
    mode: 'initial',
    currentIndex: 5,
    answers: { 1: { answerCode: 'STUDENT' } },
  });
  const flow = await ready({ mode: 'retake', initialAnswers: RETAKE_INITIAL });
  const before = flow.getSnapshot();

  __control.fail.remove = 1;
  assert.deepEqual(await flow.startFresh(), {
    ok: false,
    reason: ANSWER_REJECT_REASON.DRAFT_CLEAR_FAILED,
  });
  assert.equal(flow.getSnapshot(), before, '상태 불변');
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw, 'Draft 그대로');

  assert.deepEqual(await flow.startFresh(), { ok: true }, '다시 선택하면 성공');
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.READY);
});

test('resumeDraft: serverCompleted(boolean)를 전달하지 않으면 복원하지 않음', async () => {
  const raw = await seedDraft({
    mode: 'retake',
    currentIndex: 2,
    answers: { 1: { answerCode: 'STUDENT' } },
  });
  const flow = await ready({ mode: 'initial' });

  for (const arg of [
    undefined,
    {},
    { serverCompleted: undefined },
    { serverCompleted: 'true' },
    { serverCompleted: null },
  ]) {
    assert.deepEqual(flow.resumeDraft(arg), {
      ok: false,
      reason: ANSWER_REJECT_REASON.SERVER_STATE_UNKNOWN,
    });
  }
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('resumeDraft: 서버 완료 상태와 충돌하는 mode는 거부 (initial Draft + 완료 계정 / retake Draft + 미완료 계정)', async () => {
  const rawInitial = await seedDraft({
    mode: 'initial',
    currentIndex: 4,
    answers: { 1: { answerCode: 'STUDENT' } },
  });
  const retakeFlow = await ready({ mode: 'retake', initialAnswers: RETAKE_INITIAL });
  assert.deepEqual(retakeFlow.resumeDraft({ serverCompleted: true }), {
    ok: false,
    reason: ANSWER_REJECT_REASON.MODE_CONFLICTS_WITH_SERVER,
  });
  assert.equal(retakeFlow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), rawInitial);

  const rawRetake = await seedDraft({
    mode: 'retake',
    currentIndex: 4,
    answers: { 1: { answerCode: 'STUDENT' } },
  });
  const initialFlow = await ready({ mode: 'initial' });
  assert.equal(
    initialFlow.resumeDraft({ serverCompleted: false }).reason,
    ANSWER_REJECT_REASON.MODE_CONFLICTS_WITH_SERVER
  );
  assert.equal(__store.get(workOnboardingDraftKey(UID)), rawRetake);
});

test('resumeDraft: 서버 상태와 맞는 mode면 저장된 mode/위치/답변 복원 (Draft 유지)', async () => {
  const raw = await seedDraft({
    mode: 'retake',
    currentIndex: 2,
    answers: { 1: { answerCode: 'STUDENT' }, 2: { answerCode: 'JEONSE' } },
  });
  const flow = await ready({ mode: 'initial' });

  assert.deepEqual(flow.resumeDraft({ serverCompleted: true }), { ok: true });
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.READY);
  assert.equal(s.mode, 'retake');
  assert.equal(s.currentIndex, 2);
  assert.deepEqual(s.answers, { 1: { answerCode: 'STUDENT' }, 2: { answerCode: 'JEONSE' } });
  assert.equal(s.modeMismatch, null);
  await flow.flushDraft();
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw, '복원만으로는 Draft를 쓰지 않음');

  assert.equal(flow.resumeDraft({ serverCompleted: true }).reason, ANSWER_REJECT_REASON.NOT_READY);
});

test('resumeDraft: mode는 맞지만 질문과 호환되지 않으면 draft_incompatible (Draft 보존)', async () => {
  const raw = await seedDraft({
    mode: 'retake',
    currentIndex: 1,
    answers: { 1: { answerCode: 'GONE' } },
  });
  const flow = await ready({ mode: 'initial' });

  assert.deepEqual(flow.resumeDraft({ serverCompleted: true }), { ok: true });
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.equal(flow.getSnapshot().incompatibleDraft.fromDraft, true);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

test('재검사 초기 답변(initialAnswers)이 현재 질문과 맞지 않으면 incompatible (fromDraft=false), 저장 없음', async () => {
  const flow = await ready({ mode: 'retake', initialAnswers: { 1: { answerCode: 'OLD_CODE' } } });
  const s = flow.getSnapshot();
  assert.equal(s.status, FLOW_STATUS.DRAFT_INCOMPATIBLE);
  assert.equal(s.incompatibleDraft.fromDraft, false);
  await flow.flushDraft();
  assert.equal(__store.size, 0);
});

// ── 제출 전 검증 ─────────────────────────────────────────────

test('제출 전 검증: 10개 완료 시 정렬된 payload 생성 (서술형은 trim, 실제 제출 없음)', async () => {
  const flow = await ready();
  await answerAll(flow, '  작업실 하나  ');

  const result = flow.prepareSubmission();

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.payload.map(a => a.questionNo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.deepEqual(result.payload[0], { questionNo: 1, answerCode: 'STUDENT' });
  assert.deepEqual(result.payload[8], {
    questionNo: 9,
    answerCode: 'UNKNOWN',
    answerText: '작업실 하나',
  });
  assert.ok(Object.isFrozen(result.payload));
  assert.equal(
    result.payload.some(a => a.questionNo !== 9 && 'answerText' in a),
    false,
    '선택형에는 answerText 없음'
  );
  assert.equal(gateway.requests.length, 0, '제출/서버 호출 없음');
});

test('제출 전 검증: Q9 건너뛰기(UNKNOWN만)도 유효 payload', async () => {
  const flow = await ready();
  await answerAll(flow);
  flow.goPrev();
  assert.equal(flow.getSnapshot().currentQuestion.questionNo, 9);
  flow.skipFreeText();

  const result = flow.prepareSubmission();
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload[8], { questionNo: 9, answerCode: 'UNKNOWN' });
});

test('제출 전 검증: 미완료는 payload 없이 거부하고 누락 문항 번호 제공', async () => {
  const flow = await ready();
  assert.deepEqual(flow.prepareSubmission(), {
    ok: false,
    issue: SUBMISSION_ISSUE.MISSING_ANSWERS,
    questionNos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  });

  await answerAll(flow);
  flow.goPrev(); // 9번
  flow.setText(''); // 입력을 모두 지워 9번 답변 제거
  const result = flow.prepareSubmission();
  assert.equal(result.ok, false);
  assert.equal(result.issue, SUBMISSION_ISSUE.MISSING_ANSWERS);
  assert.deepEqual(result.questionNos, [9]);
  assert.equal('payload' in result, false);
});

test('제출 전 검증: initialAnswers로 시작한 완료 상태(Q9 건너뛰기 포함)도 유효 payload', async () => {
  const questions = makeQuestions();
  const flow = createWorkOnboardingFlow({
    repository: makeRepo(UID, questions),
    initialAnswers: Object.fromEntries(
      questions.map(q => [q.questionNo, { answerCode: q.freeText ? 'UNKNOWN' : q.options[0].code }])
    ),
  });
  await flow.init();
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.READY);
  assert.equal(flow.getSnapshot().isComplete, true);
  assert.equal(flow.prepareSubmission().ok, true, 'Q9 건너뛰기 상태로 유효');
});

test('제출 전 검증은 서버 호출/Draft 쓰기를 하지 않고 여러 번 호출해도 같은 결과', async () => {
  const flow = await ready();
  await answerAll(flow);
  await flow.flushDraft();
  const stored = __store.get(workOnboardingDraftKey(UID));

  const first = flow.prepareSubmission();
  const second = flow.prepareSubmission();
  assert.deepEqual(first.payload, second.payload);
  await flow.flushDraft();
  assert.equal(__store.get(workOnboardingDraftKey(UID)), stored);
  assert.equal(gateway.requests.length, 0);
});

// ── 구독 / 기존 데이터 / 서버 미호출 ─────────────────────────

test('구독: 상태가 바뀔 때만 알림, 해제 가능', async () => {
  const flow = await ready();
  let count = 0;
  const unsubscribe = flow.subscribe(() => {
    count += 1;
  });
  flow.selectOption('NOPE'); // 거부 → 알림 없음
  assert.equal(count, 0);
  flow.selectOption('STUDENT');
  assert.equal(count, 1);
  unsubscribe();
  flow.goNext();
  assert.equal(count, 1);
});

test('기존 AsyncStorage 키(기존 온보딩/Auth)는 어떤 흐름에서도 변경되지 않음', async () => {
  const preserved = {
    [`@financialOnboarding:draft:v1:${UID}`]: '{"a":1}',
    [`@financialOnboarding:result:v1:${UID}`]: '{"b":2}',
    '@auth:autoLogin': 'true',
  };
  for (const [k, v] of Object.entries(preserved)) __store.set(k, v);

  const flow = await ready();
  await answerAll(flow);
  flow.prepareSubmission();
  await flow.flushDraft();
  await getWorkOnboardingDraftStorage(UID).clear();

  for (const [k, v] of Object.entries(preserved)) assert.equal(__store.get(k), v, k);
  assert.deepEqual([...__store.keys()].sort(), Object.keys(preserved).sort());
});

test('모든 HTTP 요청은 127.0.0.1 모의 Gateway로만, 쓰기(POST) 요청 없음', () => {
  assert.ok(everRequested.every(r => r.protocol === 'http' && r.host === '127.0.0.1'));
  assert.equal(gateway.requests.filter(r => r.method !== 'GET').length, 0);
});
