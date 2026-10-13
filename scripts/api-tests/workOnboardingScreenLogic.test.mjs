// 신규 온보딩 화면(질문/결과)의 판단 로직 테스트. React 렌더러가 없으므로 화면 파일은 import하지 않고,
// 화면이 호출하는 순수 로직 + 실제 Flow 컨트롤러 + 실제 Repository(모의 Gateway)를 검증한다. 실서버 호출 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingScreenLogic.test.mjs
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const logic = await import('../../src/features/onboarding/workOnboardingScreenLogic.js');
const flowModule = await import('../../src/features/onboarding/useWorkOnboardingFlow.js');
const draftModule =
  await import('../../src/features/onboarding/adapters/workOnboardingDraftStorage.js');
const repoModule =
  await import('../../src/features/onboarding/adapters/workOnboardingRepository.js');
const { createApiError, API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { ONBOARDING_ERROR_TYPE } = await import('../../src/features/onboarding/onboardingApi.js');

const {
  FREE_TEXT_STATUS,
  RESULT_STATUS,
  RESUME_STATUS,
  RETAKE_START_REASON,
  SCREEN_STATE,
  SUBMIT_STATE,
  buildOptionViewModels,
  buildProgressViewModel,
  buildResultViewModel,
  countFreeTextLength,
  createOnceNotifier,
  createRequestGate,
  deriveScreenState,
  describeDraftIssues,
  describeSubmitFailure,
  getFreeTextInputState,
  getNavigationGuard,
  getResultActions,
  getResumeAvailability,
  loadResultData,
  loadRetakeInitialAnswers,
  loadServerCompletion,
  pickRandomItem,
  runSubmission,
} = logic;
const { FLOW_STATUS, MAX_FREE_TEXT_LENGTH, createWorkOnboardingFlow, ANSWER_REJECT_REASON } =
  flowModule;
const { getWorkOnboardingDraftStorage, workOnboardingDraftKey } = draftModule;
const { createWorkOnboardingRepository } = repoModule;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345679';
const QUESTIONS_PATH = '/api/v1/work/onboarding/questions';
const answersPath = uid => `/api/v1/work/onboarding/${uid}/answers`;
const progressPath = uid => `/api/v1/work/onboarding/${uid}/progress`;
const profilePath = uid => `/api/v1/work/onboarding/${uid}/profile`;

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
const serverQuestions = () =>
  Array.from({ length: 10 }, (_, i) => {
    const no = i + 1;
    const free = no === 9;
    return {
      question_no: no,
      phase: `단계${no}`,
      text: `질문 ${no}`,
      purpose: '목적',
      free_text: free,
      options: free
        ? []
        : [...CHOICES[no], 'UNKNOWN'].map(code => ({ code, label: `${code} 라벨` })),
    };
  });

// ── 상태를 가진 모의 Work 서버 ────────────────────────────────
const installServer = ({ prior = null, post = 'ok', questions = serverQuestions() } = {}) => {
  const state = { answers: new Map(), post };
  for (const [no, value] of Object.entries(prior ?? {})) {
    state.answers.set(Number(no), { code: value.answerCode, text: value.answerText ?? null });
  }
  const progressBody = () => {
    const have = [...state.answers.keys()];
    const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(no => !have.includes(no));
    return {
      user_id: 1,
      answered_count: have.length,
      total_questions: 10,
      is_completed: remaining.length === 0,
      remaining,
      unknown_answers: [],
      next_question_no: remaining[0] ?? null,
    };
  };

  gateway.route('GET', QUESTIONS_PATH, () => ({ body: questions }));
  gateway.route('POST', answersPath(UID), ({ record }) => {
    const apply = () => {
      for (const answer of record.body.answers) {
        state.answers.set(answer.question_no, {
          code: answer.answer_code,
          text: answer.answer_text ?? null,
        });
      }
    };
    switch (state.post) {
      case 'dropBeforeSave':
        return { destroy: true };
      case 'dropAfterSave':
        apply();
        return { destroy: true };
      case 'status400':
        return { status: 400, body: { detail: '코드가 올바르지 않습니다.' } };
      case 'notCompleted':
        apply();
        return {
          body: { ...progressBody(), is_completed: false, remaining: [10], next_question_no: 10 },
        };
      default:
        apply();
        return { body: progressBody() };
    }
  });
  gateway.route('GET', answersPath(UID), () => ({
    body: [...state.answers.entries()]
      .sort(([a], [b]) => a - b)
      .map(([no, v]) => ({
        question_no: no,
        answer_code: v.code,
        answer_label: `${v.code} 라벨`,
        answer_text: v.text,
        answered_at: '2026-10-11T03:00:00',
      })),
  }));
  gateway.route('GET', progressPath(UID), () => ({ body: progressBody() }));
  gateway.route('GET', profilePath(UID), () => ({
    body: {
      user_id: 1,
      status_code: null,
      housing_type: null,
      work_env: null,
      value_priority: null,
      must_keep_category: null,
      money_concern: null,
      success_image: null,
      card_title: '카드 제목',
      card_summary: '줄1\n줄2',
      answered_count: state.answers.size,
      is_completed: state.answers.size >= 10,
      completed_at: null,
    },
  }));
  return state;
};

const SERVER_ANSWERS = {
  1: { answerCode: 'EMPLOYED' },
  2: { answerCode: 'JEONSE' },
  3: { answerCode: 'STARTUP' },
  4: { answerCode: 'FAMILY' },
  5: { answerCode: 'OUTDOOR' },
  6: { answerCode: 'WAIT' },
  7: { answerCode: 'HIGH_SALARY' },
  8: { answerCode: 'TRAVEL' },
  9: { answerCode: 'UNKNOWN', answerText: '바다가 보이는 집' },
  10: { answerCode: 'DEBT_WORRY' },
};

const postCount = () =>
  gateway.requests.filter(r => r.method === 'POST' && r.path === answersPath(UID)).length;

const newRepo = (uid = UID) => createWorkOnboardingRepository(uid);
const newFlow = async (opts = {}, repo = newRepo()) => {
  const flow = createWorkOnboardingFlow({ repository: repo, ...opts });
  await flow.init();
  return flow;
};

const fillAll = (flow, q9 = '작업실 하나') => {
  for (let no = 1; no <= 10; no += 1) {
    if (no === 9) assert.equal(flow.setText(q9).ok, true);
    else assert.equal(flow.selectOption(CHOICES[no][0]).ok, true);
    if (no < 10) assert.equal(flow.goNext().ok, true);
  }
};

const gotoQ9 = async (opts, repo) => {
  const flow = await newFlow(opts, repo);
  for (let no = 1; no <= 8; no += 1) {
    flow.selectOption(CHOICES[no][0]);
    flow.goNext();
  }
  assert.equal(flow.getSnapshot().currentQuestion.questionNo, 9);
  return flow;
};

const httpError = status =>
  createApiError({
    kind: status >= 500 ? API_ERROR_KIND.HTTP_5XX : API_ERROR_KIND.HTTP_4XX,
    status,
  });

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 10));
  gateway.reset();
  __store.clear();
  __resetControl();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 화면 상태 매핑 / 질문 조회 ───────────────────────────────

test('질문 조회 성공 → loading → ready, 서버 질문/진행률 표시 데이터', async () => {
  installServer();
  const flow = createWorkOnboardingFlow({ repository: newRepo() });
  assert.equal(
    deriveScreenState(flow.getSnapshot()),
    SCREEN_STATE.LOADING,
    'init 전 idle → loading'
  );
  const pending = flow.init();
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.LOADING);
  await pending;

  const snapshot = flow.getSnapshot();
  assert.equal(deriveScreenState(snapshot), SCREEN_STATE.READY);
  assert.deepEqual(buildProgressViewModel(snapshot), {
    current: 1,
    total: 10,
    ratio: 0.1,
    phaseLabel: '단계1',
  });
  assert.equal(snapshot.currentQuestion.text, '질문 1');
});

test('질문 조회 실패(네트워크/503) → questions_error, 질문을 만들지 않음, 재시도(init)로 복구', async () => {
  gateway.route('GET', QUESTIONS_PATH, () => ({ public: true, destroy: true }));
  const flow = await newFlow();
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.QUESTIONS_ERROR);
  assert.equal(flow.getSnapshot().error.type, ONBOARDING_ERROR_TYPE.NETWORK);
  assert.equal(flow.getSnapshot().questions, null);
  assert.match(logic.describeQuestionsError(flow.getSnapshot()), /네트워크/);

  installServer();
  await flow.init();
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.READY);
});

test('잘못된 질문 데이터 → questions_invalid', async () => {
  installServer({ questions: serverQuestions().slice(0, 9) });
  const flow = await newFlow();
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.QUESTIONS_INVALID);
  assert.match(logic.describeQuestionsError(flow.getSnapshot()), /올바르지 않아요/);
});

test('deriveScreenState: 제출 상태는 Flow가 ready일 때만 우선, 나머지 Flow 상태는 그대로', () => {
  const ready = { status: FLOW_STATUS.READY };
  for (const state of Object.values(SUBMIT_STATE)) {
    assert.equal(
      deriveScreenState(ready, state),
      state === SUBMIT_STATE.IDLE ? SCREEN_STATE.READY : state
    );
  }
  for (const [status, expected] of [
    [FLOW_STATUS.LOADING, SCREEN_STATE.LOADING],
    [FLOW_STATUS.QUESTIONS_ERROR, SCREEN_STATE.QUESTIONS_ERROR],
    [FLOW_STATUS.QUESTIONS_INVALID, SCREEN_STATE.QUESTIONS_INVALID],
    [FLOW_STATUS.DRAFT_ERROR, SCREEN_STATE.DRAFT_ERROR],
    [FLOW_STATUS.DRAFT_INCOMPATIBLE, SCREEN_STATE.DRAFT_INCOMPATIBLE],
    [FLOW_STATUS.DRAFT_MODE_MISMATCH, SCREEN_STATE.DRAFT_MODE_MISMATCH],
  ]) {
    assert.equal(deriveScreenState({ status }, SUBMIT_STATE.SUBMITTING), expected);
  }
  assert.equal(deriveScreenState(undefined), SCREEN_STATE.LOADING);
});

// ── 선택지 / 이동 ────────────────────────────────────────────

test('서버 선택지 표시 데이터: 서버 option만, 선택 표시, 서술형은 선택지 없음', async () => {
  installServer();
  const flow = await newFlow();
  let s = flow.getSnapshot();
  let options = buildOptionViewModels(s.currentQuestion, s.currentAnswer);
  assert.deepEqual(
    options.map(o => o.code),
    [...CHOICES[1], 'UNKNOWN']
  );
  assert.ok(options.every(o => o.selected === false && o.label.endsWith('라벨')));
  assert.deepEqual(
    Object.keys(options[0]).sort(),
    ['code', 'label', 'selected'],
    '아이콘 등 임의 필드 없음'
  );

  flow.selectOption('JOB_SEEKER');
  s = flow.getSnapshot();
  options = buildOptionViewModels(s.currentQuestion, s.currentAnswer);
  assert.deepEqual(
    options.filter(o => o.selected).map(o => o.code),
    ['JOB_SEEKER']
  );

  const q9 = await gotoQ9();
  assert.deepEqual(buildOptionViewModels(q9.getSnapshot().currentQuestion, undefined), []);
});

test('이전/다음 이동과 이동 가드: 답변 전 차단, 마지막은 제출 조건', async () => {
  installServer();
  const flow = await newFlow();
  let guard = getNavigationGuard({ snapshot: flow.getSnapshot(), localText: '' });
  assert.equal(guard.canGoNext, false);
  assert.equal(guard.blockedReason, 'NOT_ANSWERED');

  flow.selectOption('STUDENT');
  guard = getNavigationGuard({ snapshot: flow.getSnapshot(), localText: '' });
  assert.equal(guard.canGoNext, true);
  assert.equal(guard.canSubmit, false, '첫 질문은 제출 불가');

  flow.goNext();
  flow.goPrev();
  assert.equal(flow.getSnapshot().currentIndex, 0);
  assert.equal(flow.getSnapshot().currentAnswer.answerCode, 'STUDENT');

  const full = await newFlow({}, newRepo());
  fillAll(full);
  guard = getNavigationGuard({ snapshot: full.getSnapshot(), localText: '' });
  assert.equal(full.getSnapshot().isLast, true);
  assert.equal(guard.canSubmit, true);
  assert.equal(guard.canGoNext, false);

  assert.deepEqual(
    getNavigationGuard({ snapshot: { status: FLOW_STATUS.LOADING }, localText: '' }).blockedReason,
    'NOT_READY'
  );
});

// ── Q9 입력 판정 ─────────────────────────────────────────────

test('Q9 입력 판정: 미답변 / 유효 / 건너뛰기 / 공백 / 61자 / 미동기화', () => {
  const textAnswer = text => ({ answerCode: 'UNKNOWN', answerText: text });
  const cases = [
    [{ localText: '', answer: undefined }, FREE_TEXT_STATUS.UNANSWERED, false],
    [{ localText: '', answer: { answerCode: 'UNKNOWN' } }, FREE_TEXT_STATUS.SKIPPED, true],
    [{ localText: '', answer: textAnswer('남은 답') }, FREE_TEXT_STATUS.UNSYNCED, false],
    [{ localText: '안녕', answer: textAnswer('안녕') }, FREE_TEXT_STATUS.VALID, true],
    [{ localText: '   ', answer: undefined }, FREE_TEXT_STATUS.BLANK, false],
    [{ localText: '\n\t', answer: textAnswer('이전') }, FREE_TEXT_STATUS.BLANK, false],
    [{ localText: '가'.repeat(61), answer: textAnswer('이전') }, FREE_TEXT_STATUS.TOO_LONG, false],
    [{ localText: '새 입력', answer: textAnswer('이전') }, FREE_TEXT_STATUS.UNSYNCED, false],
    [{ localText: '새 입력', answer: undefined }, FREE_TEXT_STATUS.UNSYNCED, false],
    [{ localText: '새 입력', answer: { answerCode: 'UNKNOWN' } }, FREE_TEXT_STATUS.UNSYNCED, false],
  ];
  for (const [input, status, canProceed] of cases) {
    const result = getFreeTextInputState(input);
    assert.equal(result.status, status, JSON.stringify(input).slice(0, 60));
    assert.equal(result.canProceed, canProceed, JSON.stringify(input).slice(0, 60));
  }
  assert.equal(
    getFreeTextInputState({ localText: '  ', answer: undefined }).message,
    '공백만 입력한 답변은 사용할 수 없어요.'
  );
});

test('Q9 공백/초과 입력이 남아 있는 동안 컨트롤러에 이전 유효 답변이 있어도 이동·제출 차단', async () => {
  installServer();
  const flow = await gotoQ9();
  flow.setText('이전 유효 답변');
  const snapshotWith = () => flow.getSnapshot();

  // 화면 입력창이 유효 → 이동 가능
  assert.equal(
    getNavigationGuard({ snapshot: snapshotWith(), localText: '이전 유효 답변' }).canGoNext,
    true
  );

  // 사용자가 공백만 입력: 컨트롤러는 거부하고 이전 답변 유지
  assert.equal(flow.setText('   ').ok, false);
  assert.equal(snapshotWith().currentAnswer.answerText, '이전 유효 답변');
  const blocked = getNavigationGuard({ snapshot: snapshotWith(), localText: '   ' });
  assert.equal(blocked.canGoNext, false);
  assert.equal(blocked.blockedReason, FREE_TEXT_STATUS.BLANK);

  // 61자 입력도 차단
  assert.equal(flow.setText('가'.repeat(61)).reason, ANSWER_REJECT_REASON.TEXT_TOO_LONG);
  assert.equal(
    getNavigationGuard({ snapshot: snapshotWith(), localText: '가'.repeat(61) }).blockedReason,
    FREE_TEXT_STATUS.TOO_LONG
  );

  // 유효 값으로 고치면 다시 진행 가능
  assert.equal(flow.setText('수정한 답').ok, true);
  assert.equal(
    getNavigationGuard({ snapshot: snapshotWith(), localText: '수정한 답' }).canGoNext,
    true
  );
});

test('Q9 명시적 건너뛰기: answerText 없이 UNKNOWN, 진행 가능 / 건너뛰기 후 텍스트로 변경 가능', async () => {
  installServer();
  const flow = await gotoQ9();
  flow.skipFreeText();
  assert.deepEqual(flow.getSnapshot().currentAnswer, { answerCode: 'UNKNOWN' });
  assert.equal(getNavigationGuard({ snapshot: flow.getSnapshot(), localText: '' }).canGoNext, true);

  assert.equal(flow.setText('다시 입력').ok, true);
  assert.deepEqual(flow.getSnapshot().currentAnswer, {
    answerCode: 'UNKNOWN',
    answerText: '다시 입력',
  });
  assert.equal(
    getNavigationGuard({ snapshot: flow.getSnapshot(), localText: '다시 입력' }).canGoNext,
    true
  );
});

// ── Q9 글자 수 패리티 (Flow와 UI 규칙 일치) ──────────────────

test('Q9 글자 수: Flow(setText) 수락/거부와 UI 판정(countFreeTextLength/getFreeTextInputState)이 모든 경계에서 일치', async () => {
  installServer();
  const samples = {
    영문60: 'a'.repeat(60),
    영문61: 'a'.repeat(61),
    한글60: '가'.repeat(60),
    한글61: '가'.repeat(61),
    이모지60: '😀'.repeat(60),
    이모지61: '😀'.repeat(61),
    이모지59한글1: `${'😀'.repeat(59)}가`,
    앞뒤공백60: `  ${'가'.repeat(60)}  `,
    앞뒤공백61: `  ${'가'.repeat(61)}  `,
    ZWJ가족5: '👨‍👩‍👧‍👦'.repeat(5), // 코드포인트 7개 × 5 = 35
    ZWJ가족9: '👨‍👩‍👧‍👦'.repeat(9), // 63 > 60 (코드포인트 기준으로 센다)
    결합문자: 'é'.repeat(30), // 코드포인트 60
    결합문자초과: 'é'.repeat(31), // 62
    한글자: '가',
  };

  assert.equal(MAX_FREE_TEXT_LENGTH, 60);
  assert.equal(countFreeTextLength('😀'.repeat(60)), 60);
  assert.equal(
    '😀'.repeat(60).length,
    120,
    'UTF-16 길이는 120 — RN maxLength=60이면 30개에서 막힘'
  );
  assert.equal(countFreeTextLength(`  ${'가'.repeat(60)}  `), 60);

  for (const [name, text] of Object.entries(samples)) {
    __store.clear(); // 이전 샘플의 Draft가 복원되지 않도록 격리
    const flow = await gotoQ9();
    const result = flow.setText(text);
    const expectedTooLong = countFreeTextLength(text) > 60;

    // Flow의 수락/거부 = 글자 수 규칙
    assert.equal(result.ok, !expectedTooLong, `${name}: Flow 수락 여부`);
    if (expectedTooLong) assert.equal(result.reason, ANSWER_REJECT_REASON.TEXT_TOO_LONG, name);

    // UI 판정 = Flow 상태
    const ui = getFreeTextInputState({ localText: text, answer: flow.getSnapshot().currentAnswer });
    assert.equal(ui.count, countFreeTextLength(text), `${name}: 표시 글자 수`);
    assert.equal(
      ui.status,
      expectedTooLong ? FREE_TEXT_STATUS.TOO_LONG : FREE_TEXT_STATUS.VALID,
      name
    );
    assert.equal(ui.canProceed, !expectedTooLong, name);
    // 수락된 텍스트만 컨트롤러 답변이 된다
    assert.equal(
      flow.getSnapshot().currentAnswer?.answerText === text,
      !expectedTooLong,
      `${name}: 컨트롤러 답변 동기화`
    );
    await flow.flushDraft();
  }
});

// ── Draft / mode 충돌 / 서버 상태 확인 ───────────────────────

test('Draft 복원: 저장된 위치/답변으로 ready, Draft 오류 → draft_error', async () => {
  installServer();
  const first = await newFlow();
  first.selectOption('STUDENT');
  first.goNext();
  first.selectOption('JEONSE');
  await first.flushDraft();

  const second = await newFlow();
  assert.equal(deriveScreenState(second.getSnapshot()), SCREEN_STATE.READY);
  assert.equal(second.getSnapshot().currentIndex, 1);
  assert.equal(second.getSnapshot().answers[2].answerCode, 'JEONSE');

  __control.fail.get = 1;
  const broken = await newFlow();
  assert.equal(deriveScreenState(broken.getSnapshot()), SCREEN_STATE.DRAFT_ERROR);
  assert.match(logic.describeQuestionsError(broken.getSnapshot()), /삭제되지 않았/);
  assert.ok(__store.has(workOnboardingDraftKey(UID)), 'Draft 보존');
});

test('Draft 저장 실패는 draftError 배너 조건으로 노출되고 진행은 가능', async () => {
  installServer();
  const flow = await newFlow();
  __control.fail.set = 1;
  flow.selectOption('STUDENT');
  await flow.flushDraft();
  assert.equal(flow.getSnapshot().draftError, true);
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.READY);
  assert.equal(getNavigationGuard({ snapshot: flow.getSnapshot(), localText: '' }).canGoNext, true);
});

test('호환되지 않는 Draft → draft_incompatible, 이슈 문구, Draft 보존', async () => {
  installServer();
  await getWorkOnboardingDraftStorage(UID).save({
    mode: 'initial',
    currentIndex: 0,
    answers: { 1: { answerCode: 'GONE' }, 3: { answerCode: 'UNKNOWN', answerText: '텍스트' } },
  });
  const raw = __store.get(workOnboardingDraftKey(UID));
  const flow = await newFlow();
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.DRAFT_INCOMPATIBLE);
  const lines = describeDraftIssues(flow.getSnapshot().issues);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => typeof line === 'string' && line.length > 0));
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);
});

const seedRetakeDraft = () =>
  getWorkOnboardingDraftStorage(UID).save({
    mode: 'retake',
    currentIndex: 2,
    answers: { 1: { answerCode: 'STUDENT' } },
  });

test('mode 충돌: draft_mode_mismatch, 서버 상태 조회 전에는 이어하기 차단(checking)', async () => {
  installServer();
  await seedRetakeDraft();
  const flow = await newFlow({ mode: 'initial' });
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.DRAFT_MODE_MISMATCH);

  const availability = getResumeAvailability({
    draftMode: flow.getSnapshot().modeMismatch.draftMode,
    completion: null,
  });
  assert.equal(availability.status, RESUME_STATUS.CHECKING);
  assert.equal(flow.resumeDraft({}).reason, ANSWER_REJECT_REASON.SERVER_STATE_UNKNOWN);
});

test('서버 상태 확인 실패 → 이어하기 차단 + 재시도로 복구 가능', async () => {
  const state = installServer();
  await seedRetakeDraft();
  const repo = newRepo();
  const flow = await newFlow({ mode: 'initial' }, repo);

  gateway.route('GET', progressPath(UID), () => ({
    public: true,
    status: 503,
    body: { code: 'X' },
  }));
  const failed = await loadServerCompletion(repo);
  assert.equal(failed.ok, false);
  assert.equal(failed.errorType, ONBOARDING_ERROR_TYPE.SERVER);
  assert.equal('serverCompleted' in failed, false, '임의 boolean을 만들지 않음');
  const blocked = getResumeAvailability({ draftMode: 'retake', completion: failed });
  assert.equal(blocked.status, RESUME_STATUS.ERROR);
  assert.equal(flow.getSnapshot().status, FLOW_STATUS.DRAFT_MODE_MISMATCH, '이어하기 하지 않음');

  // 재시도: 서버가 정상 응답(완료 상태)
  for (const [no, value] of Object.entries(SERVER_ANSWERS)) {
    state.answers.set(Number(no), { code: value.answerCode, text: value.answerText ?? null });
  }
  installServer({ prior: SERVER_ANSWERS });
  const ok = await loadServerCompletion(repo);
  assert.deepEqual(ok, { ok: true, serverCompleted: true });
  assert.equal(
    getResumeAvailability({ draftMode: 'retake', completion: ok }).status,
    RESUME_STATUS.ALLOWED
  );
});

test('서버 상태와 Draft mode 충돌 시 이어하기 불허 / 일치 시 resumeDraft 성공', async () => {
  const cases = [
    // [draftMode, serverCompleted, 기대 상태]
    ['retake', true, RESUME_STATUS.ALLOWED],
    ['retake', false, RESUME_STATUS.CONFLICT],
    ['initial', false, RESUME_STATUS.ALLOWED],
    ['initial', true, RESUME_STATUS.CONFLICT],
  ];
  for (const [draftMode, serverCompleted, expected] of cases) {
    assert.equal(
      getResumeAvailability({ draftMode, completion: { ok: true, serverCompleted } }).status,
      expected,
      `${draftMode}/${serverCompleted}`
    );
  }

  installServer({ prior: SERVER_ANSWERS });
  await seedRetakeDraft();
  const repo = newRepo();
  const flow = await newFlow({ mode: 'initial' }, repo);
  const completion = await loadServerCompletion(repo);
  assert.equal(completion.serverCompleted, true);
  assert.equal(
    getResumeAvailability({ draftMode: 'retake', completion }).status,
    RESUME_STATUS.ALLOWED
  );
  assert.deepEqual(flow.resumeDraft({ serverCompleted: completion.serverCompleted }), { ok: true });
  assert.equal(flow.getSnapshot().mode, 'retake');
  assert.equal(flow.getSnapshot().currentIndex, 2);
  assert.equal(postCount(), 0);

  // 이어하기만으로는 Draft가 바뀌거나 삭제되지 않는다
  assert.ok(__store.has(workOnboardingDraftKey(UID)));
});

test('새로 시작하기: Draft 삭제 실패는 성공으로 처리하지 않음, 성공 시에만 새 흐름', async () => {
  installServer();
  await seedRetakeDraft();
  const flow = await newFlow({ mode: 'initial' });
  const raw = __store.get(workOnboardingDraftKey(UID));

  __control.fail.remove = 1;
  const failed = await flow.startFresh();
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, ANSWER_REJECT_REASON.DRAFT_CLEAR_FAILED);
  assert.match(logic.describeAnswerReject(failed.reason), /그대로/);
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.DRAFT_MODE_MISMATCH);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), raw);

  assert.deepEqual(await flow.startFresh(), { ok: true });
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.READY);
  assert.equal(flow.getSnapshot().mode, 'initial');
});

// ── 재검사 ───────────────────────────────────────────────────

test('재검사 초기 답변: API-33 10개를 초기값으로 사용, 진행 중 서버 쓰기 없음, 취소해도 서버 답변 유지', async () => {
  const state = installServer({ prior: SERVER_ANSWERS });
  const repo = newRepo();

  const loaded = await loadRetakeInitialAnswers(repo);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.answers, SERVER_ANSWERS);

  const flow = await newFlow({ mode: 'retake', initialAnswers: loaded.answers }, repo);
  assert.equal(deriveScreenState(flow.getSnapshot()), SCREEN_STATE.READY);
  assert.equal(flow.getSnapshot().mode, 'retake');
  assert.deepEqual(flow.getSnapshot().answers, SERVER_ANSWERS);
  assert.equal(flow.getSnapshot().isComplete, true);

  // 사용자가 답변을 바꿔도 제출 전까지 서버는 변하지 않는다
  flow.selectOption('OTHER');
  flow.goNext();
  await flow.flushDraft();
  assert.equal(postCount(), 0, '재검사 진행 중 POST 없음');
  assert.equal(state.answers.get(1).code, 'EMPLOYED', '서버 기존 답변 유지');

  // 취소(화면을 닫음) = 아무 호출도 하지 않음. Draft만 남는다.
  assert.equal(postCount(), 0);
  assert.ok(__store.has(workOnboardingDraftKey(UID)));
  assert.equal(state.answers.get(1).code, 'EMPLOYED');
});

test('재검사 시작 불가: 조회 실패 / 서버 답변 없음 / 10개 미만 → 빈 답변으로 대체하지 않음', async () => {
  const repo = newRepo();

  gateway.route('GET', answersPath(UID), () => ({ public: true, destroy: true }));
  const failed = await loadRetakeInitialAnswers(repo);
  assert.deepEqual(
    { ok: failed.ok, reason: failed.reason, errorType: failed.errorType },
    { ok: false, reason: RETAKE_START_REASON.LOAD_FAILED, errorType: ONBOARDING_ERROR_TYPE.NETWORK }
  );
  assert.equal('answers' in failed, false);

  installServer({ prior: {} });
  const none = await loadRetakeInitialAnswers(repo);
  assert.deepEqual(none, { ok: false, reason: RETAKE_START_REASON.NO_SERVER_ANSWERS });

  installServer({ prior: { 1: { answerCode: 'EMPLOYED' }, 2: { answerCode: 'JEONSE' } } });
  const partial = await loadRetakeInitialAnswers(repo);
  assert.deepEqual(partial, { ok: false, reason: RETAKE_START_REASON.INCOMPLETE_SERVER_ANSWERS });
  assert.equal(postCount(), 0);
});

// ── 제출 ─────────────────────────────────────────────────────

test('제출 성공: prepareSubmission → API-31 1회 → 성공 확인 후에만 Draft 정리', async () => {
  const state = installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow, '작업실 하나');
  await flow.flushDraft();
  assert.ok(__store.has(workOnboardingDraftKey(UID)));

  const result = await runSubmission({ actions: flow, repository: repo });

  assert.deepEqual(result, {
    state: 'completed',
    confirmedBy: 'RESPONSE',
    draftCleanup: 'cleared',
  });
  assert.equal(postCount(), 1);
  assert.equal(state.answers.size, 10);
  assert.equal(state.answers.get(9).text, '작업실 하나');
  assert.equal(__store.has(workOnboardingDraftKey(UID)), false, '성공 확인 후 Draft 삭제');
});

test('제출 전 검증 실패(미완료)는 서버를 호출하지 않음', async () => {
  installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  flow.selectOption('STUDENT');
  const result = await runSubmission({ actions: flow, repository: repo });
  assert.equal(result.state, 'submit_error');
  assert.equal(result.reason, 'INVALID_ANSWERS');
  assert.equal(postCount(), 0);
  assert.match(describeSubmitFailure(result), /다시 확인/);
});

test('제출 실패(400): submit_error, Draft 보존, 자동 재제출 없음, 사용자가 다시 호출하면 재전송', async () => {
  installServer({ post: 'status400' });
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  await flow.flushDraft();
  const stored = __store.get(workOnboardingDraftKey(UID));

  const result = await runSubmission({ actions: flow, repository: repo });
  assert.equal(result.state, 'submit_error');
  assert.equal(result.reason, 'REQUEST_FAILED');
  assert.equal(result.errorType, ONBOARDING_ERROR_TYPE.BAD_REQUEST);
  assert.equal(postCount(), 1);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), stored, 'Draft 보존');
  assert.match(describeSubmitFailure(result), /저장하지 못했어요/);

  await runSubmission({ actions: flow, repository: repo });
  assert.equal(postCount(), 2, '사용자가 다시 눌렀을 때만 재전송');
});

test('서버가 완료로 응답하지 않으면 NOT_COMPLETED 오류, 성공 처리·Draft 삭제 없음', async () => {
  installServer({ post: 'notCompleted' });
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  await flow.flushDraft();

  const result = await runSubmission({ actions: flow, repository: repo });
  assert.equal(result.state, 'submit_error');
  assert.equal(result.reason, 'NOT_COMPLETED');
  assert.ok(__store.has(workOnboardingDraftKey(UID)));
});

test('응답 유실(저장 안 됨): save_unconfirmed, 재확인 1회, 자동 재제출 없음, Draft 보존, retryPayload 동일', async () => {
  const state = installServer({ post: 'dropBeforeSave' });
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow, '작업실 하나');
  await flow.flushDraft();
  const stored = __store.get(workOnboardingDraftKey(UID));

  const result = await runSubmission({ actions: flow, repository: repo });

  assert.equal(result.state, 'save_unconfirmed');
  assert.equal(result.unconfirmedReason, 'NOT_COMPLETED');
  assert.equal(result.retryPayload.length, 10);
  assert.equal(result.retryPayload[8].answerText, '작업실 하나');
  assert.equal(postCount(), 1, '자동 재제출 없음');
  assert.equal(state.answers.size, 0);
  assert.equal(__store.get(workOnboardingDraftKey(UID)), stored);
  assert.match(describeSubmitFailure(result), /확인하지 못했어요/);
});

test('응답 유실(서버는 저장함): 재확인으로 성공 확인(RECONCILE) 후 Draft 정리', async () => {
  installServer({ post: 'dropAfterSave' });
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  await flow.flushDraft();

  const result = await runSubmission({ actions: flow, repository: repo });
  assert.deepEqual(result, {
    state: 'completed',
    confirmedBy: 'RECONCILE',
    draftCleanup: 'cleared',
  });
  assert.equal(postCount(), 1);
  assert.equal(__store.has(workOnboardingDraftKey(UID)), false);
});

test('재검사 제출 후 응답 유실: 이전 답변 10개만으로는 성공 처리하지 않음 (save_unconfirmed/MISMATCH)', async () => {
  const state = installServer({ prior: SERVER_ANSWERS, post: 'dropBeforeSave' });
  const repo = newRepo();
  const flow = await newFlow({ mode: 'retake', initialAnswers: SERVER_ANSWERS }, repo);
  flow.selectOption('OTHER');
  for (let i = 0; i < 9; i += 1) flow.goNext();
  assert.equal(flow.getSnapshot().isLast, true);

  const result = await runSubmission({ actions: flow, repository: repo });
  assert.equal(result.state, 'save_unconfirmed');
  assert.equal(result.unconfirmedReason, 'MISMATCH');
  assert.equal(state.answers.get(1).code, 'EMPLOYED', '기존 서버 답변 보존');
});

test('서버 저장 성공 + 로컬 Draft 삭제 실패 → 저장 실패로 오인하지 않고 completed(draftCleanup:failed)', async () => {
  const state = installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  await flow.flushDraft();

  __control.fail.remove = 1;
  const result = await runSubmission({ actions: flow, repository: repo });

  assert.deepEqual(result, { state: 'completed', confirmedBy: 'RESPONSE', draftCleanup: 'failed' });
  assert.equal(state.answers.size, 10, '서버 저장은 완료');
  assert.ok(__store.has(workOnboardingDraftKey(UID)), '로컬 Draft는 남음');
  assert.equal(deriveScreenState(flow.getSnapshot(), result.state), SCREEN_STATE.COMPLETED);
});

test('실패/불확실 경로에서는 draft.clear를 호출하지 않음', async () => {
  for (const post of ['status400', 'dropBeforeSave', 'notCompleted']) {
    gateway.reset();
    gateway.validTokens.add('valid');
    installServer({ post });
    const repo = newRepo();
    let clears = 0;
    const originalClear = repo.draft.clear;
    repo.draft.clear = (...args) => {
      clears += 1;
      return originalClear(...args);
    };
    const flow = await newFlow({}, repo);
    fillAll(flow);
    await runSubmission({ actions: flow, repository: repo });
    assert.equal(clears, 0, post);
    repo.draft.clear = originalClear;
    await originalClear();
  }
});

test('제출 중복 실행: 동시에 두 번 호출해도 서버 POST는 1회, 두 번째는 in_progress', async () => {
  installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  const [first, second] = await Promise.all([
    runSubmission({ actions: flow, repository: repo }),
    runSubmission({ actions: flow, repository: repo }),
  ]);
  const states = [first.state, second.state].sort();
  assert.deepEqual(states, ['completed', 'in_progress']);
  assert.equal(postCount(), 1);
});

// ── 결과 화면 ────────────────────────────────────────────────

const fakeResultRepo = ({ profile, answers }) => ({
  loadProfile: async () => {
    if (profile instanceof Error) throw profile;
    return profile;
  },
  loadAnswers: async () => {
    if (answers instanceof Error) throw answers;
    return answers;
  },
});

const profileOf = (overrides = {}) => ({
  statusCode: null,
  housingType: null,
  workEnv: null,
  valuePriority: null,
  mustKeepCategory: null,
  moneyConcern: null,
  successImage: null,
  cardTitle: '성장을 택한 사회인',
  cardSummary: '주거: 월세\n\n  3년 뒤의 나: 작업실  \n',
  answeredCount: 10,
  isCompleted: true,
  completedAt: null,
  ...overrides,
});
const answerOf = (questionNo, overrides = {}) => ({
  questionNo,
  answerCode: 'CODE',
  answerLabel: `라벨${questionNo}`,
  answerText: null,
  answeredAt: '2026-10-11T03:00:00',
  ...overrides,
});
const tenAnswers = () =>
  Array.from({ length: 10 }, (_, i) =>
    answerOf(
      i + 1,
      i + 1 === 9
        ? { answerCode: 'UNKNOWN', answerLabel: '아직 모르겠어요', answerText: '작업실' }
        : {}
    )
  ).reverse();

test('결과: 정상 → ready, 서버 값만 변환 (줄 정리, 정렬, Q9는 answer_text)', async () => {
  const result = await loadResultData(
    fakeResultRepo({ profile: profileOf(), answers: tenAnswers() })
  );
  assert.equal(result.status, RESULT_STATUS.READY);
  assert.equal(result.view.title, '성장을 택한 사회인');
  assert.deepEqual(result.view.summaryLines, ['주거: 월세', '3년 뒤의 나: 작업실']);
  assert.deepEqual(
    result.view.answers.map(a => a.questionNo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.equal(result.view.answers[8].text, '작업실', 'Q9는 answer_text');
  assert.equal(result.view.answers[8].isFreeText, true);
  assert.equal(result.view.answers[0].text, '라벨1');
  assert.deepEqual(
    Object.keys(result.view).sort(),
    ['answeredCount', 'answers', 'isCompleted', 'summaryLines', 'title'],
    '점수/프로필 타입/이미지 키를 만들지 않음'
  );
});

test('결과: null 필드 / 빈 요약 / Q9 건너뛰기를 안전하게 처리', () => {
  const view = buildResultViewModel(profileOf({ cardTitle: null, cardSummary: null }), [
    answerOf(9, { answerCode: 'UNKNOWN', answerLabel: '아직 모르겠어요', answerText: null }),
  ]);
  assert.equal(view.title, null);
  assert.deepEqual(view.summaryLines, []);
  assert.equal(view.answers[0].text, '아직 모르겠어요', 'Q9 텍스트가 없으면 서버 라벨');

  const blank = buildResultViewModel(profileOf({ cardTitle: '   ', cardSummary: '\n \n' }), []);
  assert.equal(blank.title, null);
  assert.deepEqual(blank.summaryLines, []);
  assert.deepEqual(blank.answers, []);

  const codeFallback = buildResultViewModel(profileOf(), [answerOf(1, { answerLabel: '' })]);
  assert.equal(codeFallback.answers[0].text, 'CODE');
});

test('결과: 404 + 답변 없음 → empty, 조회 실패 → error, 미완료 → not_completed', async () => {
  assert.deepEqual(await loadResultData(fakeResultRepo({ profile: httpError(404), answers: [] })), {
    status: RESULT_STATUS.EMPTY,
  });

  const networkFail = createApiError({ kind: API_ERROR_KIND.NETWORK });
  const err1 = await loadResultData(
    fakeResultRepo({ profile: networkFail, answers: tenAnswers() })
  );
  assert.deepEqual(err1, { status: RESULT_STATUS.ERROR, errorType: ONBOARDING_ERROR_TYPE.NETWORK });

  const err2 = await loadResultData(
    fakeResultRepo({ profile: profileOf(), answers: httpError(503) })
  );
  assert.equal(err2.status, RESULT_STATUS.ERROR);
  assert.equal(err2.errorType, ONBOARDING_ERROR_TYPE.SERVER);

  // 프로필 404인데 답변은 있는 비정상 조합은 임의로 해석하지 않고 오류
  const odd = await loadResultData(
    fakeResultRepo({ profile: httpError(404), answers: tenAnswers() })
  );
  assert.equal(odd.status, RESULT_STATUS.ERROR);

  // 답변 일부만 저장
  const partial = await loadResultData(
    fakeResultRepo({
      profile: profileOf({ isCompleted: false, answeredCount: 2 }),
      answers: [answerOf(1), answerOf(2)],
    })
  );
  assert.equal(partial.status, RESULT_STATUS.NOT_COMPLETED);
  assert.equal(partial.view.answeredCount, 2);

  // 완료라고 하는데 답변이 비어 있으면 신뢰하지 않음
  const inconsistent = await loadResultData(fakeResultRepo({ profile: profileOf(), answers: [] }));
  assert.equal(inconsistent.status, RESULT_STATUS.ERROR);
});

test('결과: 실제 Repository + 모의 서버 (서버 미보유 → empty / 보유 → ready), 쓰기 요청 없음', async () => {
  const state = installServer({ prior: {} });
  gateway.route('GET', profilePath(UID), () => ({
    public: true,
    status: 404,
    body: { detail: '시작 안 함' },
  }));
  assert.deepEqual(await loadResultData(newRepo()), { status: RESULT_STATUS.EMPTY });

  for (const [no, value] of Object.entries(SERVER_ANSWERS)) {
    state.answers.set(Number(no), { code: value.answerCode, text: value.answerText ?? null });
  }
  installServer({ prior: SERVER_ANSWERS });
  const ready = await loadResultData(newRepo());
  assert.equal(ready.status, RESULT_STATUS.READY);
  assert.deepEqual(ready.view.summaryLines, ['줄1', '줄2']);
  assert.equal(ready.view.answers[8].text, '바다가 보이는 집');
  assert.equal(postCount(), 0);
});

test('결과 화면 버튼 결정: 서버 조회 결과로만 start/retake/home 노출', () => {
  assert.deepEqual(getResultActions(RESULT_STATUS.READY), {
    showStart: false,
    showRetake: true,
    showHome: true,
  });
  assert.deepEqual(getResultActions(RESULT_STATUS.EMPTY), {
    showStart: true,
    showRetake: false,
    showHome: false,
  });
  assert.deepEqual(getResultActions(RESULT_STATUS.NOT_COMPLETED), {
    showStart: true,
    showRetake: false,
    showHome: true,
  });
  for (const status of [RESULT_STATUS.ERROR, 'loading', undefined]) {
    assert.deepEqual(getResultActions(status), {
      showStart: false,
      showRetake: false,
      showHome: false,
    });
  }
  // 서버 결과가 없는 상태에서는 어떤 경우에도 retake가 노출되지 않는다
  assert.equal(getResultActions(RESULT_STATUS.EMPTY).showRetake, false);
});

// ── 비동기 안전성 ────────────────────────────────────────────

test('요청 gate: 연속 재시도 시 오래된 응답은 나중에 도착해도 무시', async () => {
  const gate = createRequestGate();
  const first = deferred();
  const second = deferred();
  const applied = [];

  const run = (scope, promise) => {
    const token = gate.begin(scope);
    promise.then(value => {
      if (gate.isCurrent(token)) applied.push(value);
    });
  };

  run('u1:0', first.promise);
  run('u1:1', second.promise); // 재시도
  second.resolve('새 응답');
  first.resolve('오래된 응답'); // 나중에 도착
  await new Promise(resolve => setTimeout(resolve, 5));

  assert.deepEqual(applied, ['새 응답']);
});

test('요청 gate: 언마운트(invalidate) 후 도착한 응답과 사용자 변경 후 이전 사용자 응답은 무시', async () => {
  const gate = createRequestGate();
  const applied = [];
  const deferredA = deferred();
  const tokenA = gate.begin('userA:0');
  deferredA.promise.then(value => gate.isCurrent(tokenA) && applied.push(value));
  gate.invalidate(); // 언마운트
  deferredA.resolve('A 응답');

  const deferredB = deferred();
  const tokenB1 = gate.begin('userB:0');
  deferredB.promise.then(value => gate.isCurrent(tokenB1) && applied.push(value));
  const tokenC = gate.begin('userC:0'); // 사용자 변경
  deferredB.resolve('B 응답');
  await new Promise(resolve => setTimeout(resolve, 5));

  assert.deepEqual(applied, []);
  assert.equal(gate.isCurrent(tokenC), true);
  assert.equal(gate.isCurrent(tokenB1), false);
  assert.equal(gate.isCurrent(null), false);
  assert.equal(gate.isCurrent(undefined), false);
});

test('gate + 실제 로더: 느린 첫 결과 조회가 재시도 결과 뒤에 도착해도 화면에 반영되지 않음', async () => {
  const gate = createRequestGate();
  const slowProfile = deferred();
  const slowRepo = {
    loadProfile: () => slowProfile.promise,
    loadAnswers: async () => tenAnswers(),
  };
  const fastRepo = fakeResultRepo({
    profile: profileOf({ cardTitle: '새 결과' }),
    answers: tenAnswers(),
  });
  const shown = [];
  const show = (scope, repo) => {
    const token = gate.begin(scope);
    return loadResultData(repo).then(result => {
      if (gate.isCurrent(token)) shown.push(result.view.title);
    });
  };

  const first = show('A:0', slowRepo);
  await show('A:1', fastRepo); // 재시도가 먼저 끝남
  slowProfile.resolve(profileOf({ cardTitle: '오래된 결과' }));
  await first;

  assert.deepEqual(shown, ['새 결과']);
});

test('gate + 실제 로더: 사용자 변경 후 이전 사용자의 서버 상태/재검사 답변 응답은 반영되지 않음', async () => {
  const gate = createRequestGate();
  const slowProgress = deferred();
  const slowAnswers = deferred();
  const oldUserRepo = {
    loadProgress: () => slowProgress.promise,
    loadAnswers: () => slowAnswers.promise,
  };
  const applied = [];

  const tokenOld = gate.begin('old-user:retake:0');
  const pending = Promise.all([
    loadServerCompletion(oldUserRepo).then(
      r => gate.isCurrent(tokenOld) && applied.push(['completion', r])
    ),
    loadRetakeInitialAnswers(oldUserRepo).then(
      r => gate.isCurrent(tokenOld) && applied.push(['retake', r])
    ),
  ]);
  gate.begin('new-user:retake:0'); // 사용자 변경
  slowProgress.resolve({ isCompleted: true });
  slowAnswers.resolve([]);
  await pending;

  assert.deepEqual(applied, []);
});

test('완료 콜백은 한 번만 호출, dispose(언마운트/사용자 변경) 이후에는 호출하지 않음', () => {
  const calls = [];
  const notifier = createOnceNotifier(payload => calls.push(payload));
  assert.equal(notifier.notify({ n: 1 }), true);
  assert.equal(notifier.notify({ n: 2 }), false);
  assert.deepEqual(calls, [{ n: 1 }]);

  const calls2 = [];
  const disposed = createOnceNotifier(payload => calls2.push(payload));
  disposed.dispose();
  assert.equal(disposed.notify({ n: 3 }), false);
  assert.deepEqual(calls2, []);

  assert.doesNotThrow(() => createOnceNotifier(undefined).notify({}));
});

test('제출 결과의 화면 반영과 onComplete: 완료 후 중복 notify 없음, 언마운트 중 끝난 제출은 notify 안 함', async () => {
  installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);

  const gate = createRequestGate();
  const calls = [];
  const notifier = createOnceNotifier(payload => calls.push(payload));

  const token = gate.begin('A:initial:0');
  const result = await runSubmission({ actions: flow, repository: repo });
  // 화면이 언마운트되어 gate가 무효화된 뒤 결과가 도착
  gate.invalidate();
  if (gate.isCurrent(token) && result.state === 'completed') notifier.notify(result);
  assert.deepEqual(calls, []);

  // 정상(마운트 유지) 경로: 결과 반영 시 notify, 이후 버튼으로 다시 notify해도 중복 호출 없음
  const token2 = gate.begin('A:initial:0');
  if (gate.isCurrent(token2)) notifier.notify(result);
  notifier.notify(result);
  assert.equal(calls.length, 1);
});

// ── 기존 데이터 / 서버 미호출 ────────────────────────────────

test('기존 로컬 온보딩 키와 다른 사용자 Draft는 어떤 화면 로직에서도 변경되지 않음', async () => {
  const preserved = {
    [`@financialOnboarding:draft:v1:${UID}`]: 'legacy-draft',
    [`@financialOnboarding:result:v1:${UID}`]: 'legacy-result',
    '@auth:autoLogin': 'true',
  };
  for (const [k, v] of Object.entries(preserved)) __store.set(k, v);
  await getWorkOnboardingDraftStorage(OTHER_UID).save({
    mode: 'initial',
    currentIndex: 0,
    answers: { 1: { answerCode: 'OTHER' } },
  });
  const otherRaw = __store.get(workOnboardingDraftKey(OTHER_UID));

  installServer();
  const repo = newRepo();
  const flow = await newFlow({}, repo);
  fillAll(flow);
  await runSubmission({ actions: flow, repository: repo });

  for (const [k, v] of Object.entries(preserved)) assert.equal(__store.get(k), v, k);
  assert.equal(__store.get(workOnboardingDraftKey(OTHER_UID)), otherRaw);
});

test('모든 HTTP 요청은 127.0.0.1 모의 Gateway로만 전송됨', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(r => r.protocol === 'http' && r.host === '127.0.0.1'));
});

// ── 4단계 안정성 보완 (문제 A·B) ─────────────────────────────

test('알림기 effect 재실행 시뮬레이션: dispose 후 새 인스턴스는 정상 동작하고, 이전 인스턴스는 계속 무시됨', () => {
  const calls = [];
  const onComplete = payload => calls.push(payload);

  // effect 1회차 setup → cleanup(StrictMode/Fast Refresh) → setup 2회차
  const first = createOnceNotifier(onComplete);
  first.dispose();
  const second = createOnceNotifier(onComplete);

  assert.equal(first.notify({ n: 'old' }), false, '폐기된 인스턴스는 계속 무시');
  assert.equal(second.notify({ n: 'new' }), true, '새 인스턴스는 정상 호출');
  assert.deepEqual(calls, [{ n: 'new' }]);
});

test('완료 콜백 중복 방지: 재실행 후에도 인스턴스당 1회, 두 번째 notify는 무시', () => {
  const calls = [];
  const onComplete = payload => calls.push(payload);
  createOnceNotifier(onComplete).dispose();
  const active = createOnceNotifier(onComplete);

  assert.equal(active.notify({ via: 'submit' }), true);
  assert.equal(active.notify({ via: 'continue-button' }), false);
  assert.equal(active.notify({ via: 'hardware-back' }), false);
  assert.deepEqual(calls, [{ via: 'submit' }]);

  // 최신 onComplete를 ref로 읽는 구조: 알림기 생성 이후 바뀐 콜백이 호출된다
  const ref = { current: () => calls.push('old-callback') };
  const viaRef = createOnceNotifier(payload => ref.current?.(payload));
  ref.current = payload => calls.push(`latest:${payload}`);
  viaRef.notify('p');
  assert.equal(calls.at(-1), 'latest:p');
});

// 화면 렌더러가 없으므로 completed 상태의 뒤로가기/알림기 구조는 화면 소스를 정적으로 분석해 확인한다.
// (실제 Android 하드웨어 뒤로가기 동작은 미검증 — 에뮬레이터/실기기 확인 필요)
const screenSource = readFileSync(
  new URL('../../src/screens/onboarding/WorkFinancialOnboardingScreen.js', import.meta.url),
  'utf8'
);
const functionBody = (source, startMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} 를 찾을 수 없음`);
  let depth = 0;
  let begun = false;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
      begun = true;
    } else if (source[i] === '}') {
      depth -= 1;
      if (begun && depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail('함수 본문 끝을 찾지 못함');
};

test('[정적 분석] 알림기는 렌더 중이 아니라 effect setup에서 만들고 cleanup에서 폐기, 호출부는 null 안전', () => {
  const effect = functionBody(
    screenSource,
    'useEffect(() => {\n    const notifier = createOnceNotifier'
  );
  assert.match(effect, /createOnceNotifier\(/);
  assert.match(effect, /notifierRef\.current = notifier/);
  assert.match(effect, /notifier\.dispose\(\)/);
  assert.match(effect, /screenGate\.invalidate\(\)/);
  assert.match(effect, /notifierRef\.current = null/);

  // 렌더 본문에서 createOnceNotifier를 직접 만들지 않는다(effect 안의 1곳뿐)
  assert.equal(screenSource.match(/createOnceNotifier\(/g).length, 1);
  assert.doesNotMatch(screenSource, /notifierRef\.current\.notify/, '널 비안전 호출 없음');
  assert.equal(
    screenSource.match(/notifierRef\.current\?\.notify|notifyCompletion\(/g).length >= 3,
    true
  );
});

test('[정적 분석] completed 상태의 뒤로가기는 완료 처리(notify)만 하고 onCancel을 호출하지 않음', () => {
  const handleBack = functionBody(screenSource, 'const handleBack = useCallback(() => {');
  const completedBranch = handleBack.slice(
    handleBack.indexOf('SCREEN_STATE.COMPLETED'),
    handleBack.indexOf('SCREEN_STATE.READY')
  );
  assert.ok(completedBranch.length > 0, 'COMPLETED 분기가 READY 분기보다 앞에 있어야 함');
  assert.match(completedBranch, /notifierRef\.current\?\.notify\(submit\)/);
  assert.match(completedBranch, /return true/);
  assert.doesNotMatch(completedBranch, /onCancel/, 'completed 분기에서 onCancel 미호출');

  // onCancel 호출은 COMPLETED 분기 이후에만 존재
  assert.ok(handleBack.indexOf('onCancel()') > handleBack.indexOf('SCREEN_STATE.COMPLETED'));
  // 제출 중(isBusy)에는 가장 먼저 이벤트를 삼킨다
  assert.ok(
    handleBack.indexOf('if (isBusy) return true') < handleBack.indexOf('SCREEN_STATE.COMPLETED')
  );
});

test('[정적 분석] "계속" 버튼과 제출 성공 경로가 같은 notifyCompletion을 사용(중복 호출은 알림기가 차단)', () => {
  assert.match(
    screenSource,
    /<PanelButton label="계속" onPress=\{\(\) => notifyCompletion\(submit\)\}/
  );
  assert.match(screenSource, /draftCleanup === 'cleared'\) \{\s*notifyCompletion\(result\)/);
  const helper = functionBody(screenSource, 'const notifyCompletion = payload => {');
  assert.match(helper, /notifierRef\.current\?\.notify\(payload\)/);
});

test('[정적 분석] 기존 제출/Draft 처리 유지: Draft 정리는 화면이 아니라 runSubmission에서, 취소·이탈은 Draft 삭제 안 함', () => {
  assert.match(
    screenSource,
    /runSubmission\(\{\s*actions,\s*repository,\s*imageKeys: Object\.keys\(FUTURE_PROFILE_IMAGES\),?\s*\}\)/
  );
  assert.doesNotMatch(screenSource, /draft\.clear\(/, '화면이 직접 Draft를 지우지 않음');
  assert.match(screenSource, /submitLockRef\.current/);
  assert.match(screenSource, /screenGate\.isCurrent\(token\)/);
});

test('pickRandomItem: 경계값/빈 배열/6개 전체 도달', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(
    pickRandomItem(items, () => 0),
    'a'
  );
  assert.equal(
    pickRandomItem(items, () => 0.999999),
    'f'
  );
  assert.equal(
    pickRandomItem(items, () => 1),
    'f'
  );
  assert.equal(
    pickRandomItem(items, () => -0.5),
    'a'
  );
  assert.equal(
    pickRandomItem([], () => 0.5),
    null
  );
  assert.equal(pickRandomItem(undefined), null);
  const reached = new Set([0, 1, 2, 3, 4, 5].map(i => pickRandomItem(items, () => (i + 0.5) / 6)));
  assert.equal(reached.size, 6);
  assert.ok(items.includes(pickRandomItem(items)));
});
