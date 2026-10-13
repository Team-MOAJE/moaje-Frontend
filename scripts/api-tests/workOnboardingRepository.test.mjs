// 서버 온보딩 Repository + 로컬 Draft 저장소 단위 테스트 (상태를 가진 모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingRepository.test.mjs
// user_id·토큰은 모의 서버 전용 가짜 값이다.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

// ── 실제 서버 미호출 검증용 감시 (요청은 그대로 전달) ─────────
const everRequested = [];
const hostOf = target => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return target?.hostname ?? target?.host ?? null;
};
for (const [mod, protocol] of [
  [http, 'http'],
  [https, 'https'],
]) {
  const original = mod.request;
  mod.request = function spiedRequest(...args) {
    everRequested.push({ protocol, host: hostOf(args[0]) });
    return original.apply(this, args);
  };
}

const gateway = new MockGateway();
const baseURL = await gateway.listen();
process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

const tokenService = await import('../../src/services/tokenService.js');
const { ONBOARDING_ERROR_TYPE, OnboardingRequestError, ONBOARDING_REQUEST_ERROR } =
  await import('../../src/features/onboarding/onboardingApi.js');
const repoModule =
  await import('../../src/features/onboarding/adapters/workOnboardingRepository.js');
const draftModule =
  await import('../../src/features/onboarding/adapters/workOnboardingDraftStorage.js');
const {
  SUBMIT_CONFIRMED_BY,
  SUBMIT_ERROR_KIND,
  UNCONFIRMED_REASON,
  WorkOnboardingSubmitError,
  answersMatchPayload,
  buildSubmitPayload,
  createWorkOnboardingRepository,
  getWorkOnboardingRepository,
} = repoModule;
const { getWorkOnboardingDraftStorage, workOnboardingDraftKey } = draftModule;

const UID = '123456789012345678'; // JS Number로 표현할 수 없는 크기
const OTHER_UID = '223456789012345679';

const QUESTIONS_PATH = '/api/v1/work/onboarding/questions';
const answersPath = uid => `/api/v1/work/onboarding/${uid}/answers`;
const progressPath = uid => `/api/v1/work/onboarding/${uid}/progress`;
const profilePath = uid => `/api/v1/work/onboarding/${uid}/profile`;

const Q9_A = '서른쯤엔 작업실 하나 두고 싶다';
const ANSWERS_A = [
  { questionNo: 1, answerCode: 'STUDENT' },
  { questionNo: 2, answerCode: 'MONTHLY_RENT' },
  { questionNo: 3, answerCode: 'LARGE_CORP' },
  { questionNo: 4, answerCode: 'SAVING' },
  { questionNo: 5, answerCode: 'HOME_REST' },
  { questionNo: 6, answerCode: 'COMPARE' },
  { questionNo: 7, answerCode: 'WORK_LIFE' },
  { questionNo: 8, answerCode: 'FOOD' },
  { questionNo: 9, answerCode: 'UNKNOWN', answerText: Q9_A },
  { questionNo: 10, answerCode: 'NO_PLAN' },
];
const ANSWERS_B = [
  { questionNo: 1, answerCode: 'EMPLOYED' },
  { questionNo: 2, answerCode: 'JEONSE' },
  { questionNo: 3, answerCode: 'STARTUP' },
  { questionNo: 4, answerCode: 'FAMILY' },
  { questionNo: 5, answerCode: 'OUTDOOR' },
  { questionNo: 6, answerCode: 'WAIT' },
  { questionNo: 7, answerCode: 'HIGH_SALARY' },
  { questionNo: 8, answerCode: 'TRAVEL' },
  { questionNo: 9, answerCode: 'UNKNOWN', answerText: '바다가 보이는 집' },
  { questionNo: 10, answerCode: 'DEBT_WORRY' },
];

// 서버 선택지 (코드 검증용 최소 질문 목록)
const QUESTIONS = [...ANSWERS_A, ...ANSWERS_B].reduce((list, answer) => {
  let question = list.find(item => item.questionNo === answer.questionNo);
  if (!question) {
    question = {
      questionNo: answer.questionNo,
      phase: 'p',
      text: 't',
      purpose: 'x',
      freeText: answer.questionNo === 9,
      options: [],
    };
    list.push(question);
  }
  if (!question.freeText && !question.options.some(option => option.code === answer.answerCode)) {
    question.options.push({ code: answer.answerCode, label: answer.answerCode });
  }
  return list;
}, []);

const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

// ── 상태를 가진 모의 Work 서버 ────────────────────────────────
// post: 'ok' | 'dropAfterSave'(저장 후 응답 유실) | 'dropBeforeSave'(저장 전 연결 끊김)
//       'timeoutAfterSave' | 'timeoutBeforeSave' | 'status400' | 'status503' | 'notCompletedResponse'
// checks: 'ok' | 'failProgress' | 'failAnswers' (API-34/33 연결 끊김)
const installServer = ({ prior = null, post = 'ok', checks = 'ok' } = {}) => {
  const state = {
    answers: new Map(),
    options: { post, checks },
  };
  for (const answer of prior ?? []) {
    state.answers.set(answer.questionNo, {
      code: answer.answerCode,
      text: answer.answerText ?? null,
    });
  }

  const progressBody = () => {
    const answered = [...state.answers.keys()];
    const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(no => !answered.includes(no));
    return {
      user_id: 123,
      answered_count: answered.length,
      total_questions: 10,
      is_completed: remaining.length === 0,
      remaining,
      unknown_answers: [...state.answers.entries()]
        .filter(([, v]) => v.code === 'UNKNOWN')
        .map(([no]) => no),
      next_question_no: remaining[0] ?? null,
    };
  };

  gateway.route('GET', QUESTIONS_PATH, () => ({
    body: [
      {
        question_no: 1,
        phase: '현재',
        text: '지금 어떤 상태이신가요?',
        purpose: 'x',
        free_text: false,
        options: [{ code: 'STUDENT', label: '학생' }],
      },
    ],
  }));

  gateway.route('POST', answersPath(UID), ({ record }) => {
    const mode = state.options.post;
    const apply = () => {
      for (const answer of record.body.answers) {
        state.answers.set(answer.question_no, {
          code: answer.answer_code,
          text: answer.answer_text ?? null,
        });
      }
    };

    switch (mode) {
      case 'dropBeforeSave':
        return { destroy: true };
      case 'timeoutBeforeSave':
        return { delay: 1200, body: progressBody() };
      case 'status400':
        return { status: 400, body: { detail: '3번 문항의 답변 코드가 올바르지 않습니다.' } };
      case 'status503':
        return { status: 503, body: { code: 'DB_CONNECTION_ERROR', message: 'x' } };
      case 'dropAfterSave':
        apply();
        return { destroy: true };
      case 'timeoutAfterSave':
        apply();
        return { delay: 1200, body: progressBody() };
      case 'notCompletedResponse':
        apply();
        return {
          body: { ...progressBody(), is_completed: false, remaining: [10], next_question_no: 10 },
        };
      default:
        apply();
        return { body: progressBody() };
    }
  });

  gateway.route('GET', answersPath(UID), () => {
    if (state.options.checks === 'failAnswers') return { destroy: true };
    return {
      body: [...state.answers.entries()]
        .sort(([a], [b]) => a - b)
        .map(([no, value]) => ({
          question_no: no,
          answer_code: value.code,
          answer_label: value.code,
          answer_text: value.text,
          answered_at: '2026-10-11T03:00:00',
        })),
    };
  });

  gateway.route('GET', progressPath(UID), () => {
    if (state.options.checks === 'failProgress') return { destroy: true };
    return { body: progressBody() };
  });

  gateway.route('GET', profilePath(UID), () => ({
    body: {
      user_id: 123,
      status_code: 'STUDENT',
      housing_type: null,
      work_env: null,
      value_priority: null,
      must_keep_category: null,
      money_concern: null,
      success_image: null,
      card_title: '미래를 그리는 중',
      card_summary: '질문에 답하면 미래 카드가 채워져요.',
      answered_count: state.answers.size,
      is_completed: state.answers.size >= 10,
      completed_at: null,
    },
  }));

  const serverAnswers = () =>
    [...state.answers.entries()]
      .sort(([a], [b]) => a - b)
      .map(([no, v]) => ({ questionNo: no, answerCode: v.code, answerText: v.text }));

  return (state, { state, serverAnswers });
};

const postCount = () =>
  gateway.requests.filter(r => r.method === 'POST' && r.path === answersPath(UID)).length;
const getCount = path => gateway.requests.filter(r => r.method === 'GET' && r.path === path).length;

const toComparable = answers =>
  answers.map(a => ({
    questionNo: a.questionNo,
    answerCode: a.answerCode,
    answerText: a.answerText ?? null,
  }));

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  __store.clear();
  __resetControl();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// ── 조회 ─────────────────────────────────────────────────────

test('조회: 질문/진행 상태/답변/Future Profile 성공 (API-30/34/33/35)', async () => {
  installServer({ prior: ANSWERS_A });
  const repo = createWorkOnboardingRepository(UID);

  const questions = await repo.loadQuestions();
  assert.equal(questions[0].questionNo, 1);

  const progress = await repo.loadProgress();
  assert.equal(progress.isCompleted, true);
  assert.equal(progress.answeredCount, 10);

  const answers = await repo.loadAnswers();
  assert.equal(answers.length, 10);
  assert.equal(answers.find(a => a.questionNo === 9).answerText, Q9_A);

  const profile = await repo.loadProfile();
  assert.equal(profile.cardTitle, '미래를 그리는 중');
  assert.equal(profile.answeredCount, 10);

  assert.equal(postCount(), 0, '조회는 쓰기 요청을 보내지 않음');
});

test('Repository 생성: 잘못된 user_id는 거부', () => {
  for (const id of ['', '12a', 123, null, undefined]) {
    assert.throws(() => createWorkOnboardingRepository(id), OnboardingRequestError);
  }
  assert.equal(
    getWorkOnboardingRepository(UID),
    getWorkOnboardingRepository(UID),
    '캐시된 인스턴스'
  );
});

// ── 제출 성공 ────────────────────────────────────────────────

test('제출 성공: 10개 일괄 제출(API-31 1회), 응답 is_completed=true → SAVED(RESPONSE), 재확인 호출 없음', async () => {
  const { serverAnswers } = installServer();
  const repo = createWorkOnboardingRepository(UID);

  const result = await repo.submitAnswers(ANSWERS_A, { questions: QUESTIONS });

  assert.equal(result.status, 'SAVED');
  assert.equal(result.confirmedBy, SUBMIT_CONFIRMED_BY.RESPONSE);
  assert.equal(result.progress.isCompleted, true);
  assert.deepEqual(toComparable(result.payload), toComparable(ANSWERS_A));
  assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_A));
  assert.equal(postCount(), 1);
  assert.equal(getCount(progressPath(UID)), 0);
  assert.equal(getCount(answersPath(UID)), 0);

  // 큰 user_id가 경로에 그대로 사용됨
  assert.ok(gateway.requests.every(r => r.path.includes(`/${UID}/`) || r.path === QUESTIONS_PATH));
});

test('제출 응답이 is_completed=false → NOT_COMPLETED (성공으로 처리하지 않음), 재제출 없음', async () => {
  installServer({ post: 'notCompletedResponse' });
  const repo = createWorkOnboardingRepository(UID);

  const error = await rejectionOf(repo.submitAnswers(ANSWERS_A));

  assert.ok(error instanceof WorkOnboardingSubmitError);
  assert.equal(error.kind, SUBMIT_ERROR_KIND.NOT_COMPLETED);
  assert.equal(error.progress.isCompleted, false);
  assert.deepEqual(toComparable(error.retryPayload), toComparable(ANSWERS_A));
  assert.equal(postCount(), 1);
});

// ── 보내기 전 검증 ───────────────────────────────────────────

test('제출 전 검증: 10개 미만/중복/범위 밖/코드 오류는 서버로 보내지 않음', async () => {
  installServer();
  const repo = createWorkOnboardingRepository(UID);

  const withoutQ5 = ANSWERS_A.filter(a => a.questionNo !== 5);
  const bad = {
    '0개': [],
    '배열 아님': 'x',
    '9개(5번 누락)': withoutQ5,
    '11개': [...ANSWERS_A, { questionNo: 10, answerCode: 'NO_PLAN' }],
    '10개지만 중복(5번이 두 번)': [...withoutQ5, { questionNo: 4, answerCode: 'SAVING' }],
    '문항 번호 범위 밖': [...withoutQ5, { questionNo: 11, answerCode: 'X' }],
    'answerCode 없음': ANSWERS_A.map(a => (a.questionNo === 2 ? { questionNo: 2 } : a)),
    'answerText 공백': ANSWERS_A.map(a => (a.questionNo === 9 ? { ...a, answerText: '  ' } : a)),
  };

  for (const [name, answers] of Object.entries(bad)) {
    const error = await rejectionOf(repo.submitAnswers(answers));
    assert.ok(error instanceof OnboardingRequestError, name);
    assert.equal(error.code, ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS, name);
  }

  // 서버 질문 목록을 함께 주면 선택지 밖 코드, Q9 코드 규칙 위반, 선택형의 answerText도 거부
  const withQuestions = mutate =>
    repo.submitAnswers(ANSWERS_A.map(mutate), { questions: QUESTIONS });
  for (const [name, mutate] of Object.entries({
    '선택지에 없는 코드': a => (a.questionNo === 1 ? { ...a, answerCode: 'NOPE' } : a),
    'Q9가 UNKNOWN이 아님': a => (a.questionNo === 9 ? { ...a, answerCode: 'CUSTOM' } : a),
    '선택형에 answerText': a => (a.questionNo === 3 ? { ...a, answerText: 'x' } : a),
  })) {
    const error = await rejectionOf(withQuestions(mutate));
    assert.ok(error instanceof OnboardingRequestError, name);
  }

  assert.equal(gateway.requests.length, 0, '서버로 어떤 요청도 나가지 않음');
});

test('buildSubmitPayload: 정렬·freeze 복사본, 입력 배열은 변경하지 않음', () => {
  const shuffled = [...ANSWERS_A].reverse();
  const payload = buildSubmitPayload(UID, shuffled);
  assert.deepEqual(
    payload.map(a => a.questionNo),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.ok(Object.isFrozen(payload));
  assert.ok(payload.every(item => Object.isFrozen(item)));
  assert.equal(shuffled[0].questionNo, 10, '입력 순서 불변');
});

// ── 저장 결과 불확실성 ───────────────────────────────────────

const UNCERTAIN_MODES = {
  '네트워크 오류(저장 안 됨)': { post: 'dropBeforeSave', saved: false },
  '타임아웃(저장 안 됨)': { post: 'timeoutBeforeSave', saved: false },
  '서버 저장 후 응답 유실': { post: 'dropAfterSave', saved: true },
  '서버 저장 후 타임아웃': { post: 'timeoutAfterSave', saved: true },
};

for (const [name, { post, saved }] of Object.entries(UNCERTAIN_MODES)) {
  test(`${name}: 단정하지 않고 API-34/33으로 재확인, 자동 재제출 없음`, async () => {
    const { serverAnswers } = installServer({ post });
    const repo = createWorkOnboardingRepository(UID);

    if (saved) {
      const result = await repo.submitAnswers(ANSWERS_A);
      assert.equal(result.status, 'SAVED');
      assert.equal(result.confirmedBy, SUBMIT_CONFIRMED_BY.RECONCILE);
      assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_A));
    } else {
      const error = await rejectionOf(repo.submitAnswers(ANSWERS_A));
      assert.equal(error.kind, SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED);
      assert.equal(error.reason, UNCONFIRMED_REASON.NOT_COMPLETED);
      assert.ok(
        [ONBOARDING_ERROR_TYPE.NETWORK, ONBOARDING_ERROR_TYPE.TIMEOUT].includes(
          error.submitErrorType
        )
      );
      assert.deepEqual(toComparable(error.retryPayload), toComparable(ANSWERS_A));
      assert.deepEqual(serverAnswers(), [], '서버에는 아무것도 저장되지 않음');
    }

    assert.equal(postCount(), 1, 'POST는 정확히 1회 (자동 재시도/재제출 없음)');
    assert.equal(getCount(progressPath(UID)), 1);
  });
}

test('재검사 + 응답 유실(저장 안 됨): 이전 답변 10개로 is_completed=true여도 성공으로 보지 않음 (MISMATCH), 기존 답변 보존', async () => {
  const { serverAnswers } = installServer({ prior: ANSWERS_A, post: 'dropBeforeSave' });
  const repo = createWorkOnboardingRepository(UID);

  const error = await rejectionOf(repo.submitAnswers(ANSWERS_B));

  assert.equal(error.kind, SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED);
  assert.equal(error.reason, UNCONFIRMED_REASON.MISMATCH);
  assert.equal(error.progress.isCompleted, true, '서버는 이전 답변 때문에 완료 상태');
  assert.equal(getCount(progressPath(UID)), 1);
  assert.equal(getCount(answersPath(UID)), 1, 'API-33 비교까지 수행');
  assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_A), '기존 서버 답변 보존');
  assert.equal(postCount(), 1);

  // 호출부가 동일 payload로 명시적으로 다시 제출하면 성공
  gateway.reset();
  const { serverAnswers: after2 } = installServer({ prior: ANSWERS_A, post: 'ok' });
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
  const retry = await repo.submitAnswers(error.retryPayload);
  assert.equal(retry.confirmedBy, SUBMIT_CONFIRMED_BY.RESPONSE);
  assert.deepEqual(toComparable(after2()), toComparable(ANSWERS_B));
});

test('재검사 + 응답 유실(저장됨): API-33 10개가 모두 일치하면 SAVED(RECONCILE)', async () => {
  const { serverAnswers } = installServer({ prior: ANSWERS_A, post: 'dropAfterSave' });
  const repo = createWorkOnboardingRepository(UID);

  const result = await repo.submitAnswers(ANSWERS_B);

  assert.equal(result.confirmedBy, SUBMIT_CONFIRMED_BY.RECONCILE);
  assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_B));
  assert.equal(getCount(answersPath(UID)), 1);
  assert.equal(postCount(), 1);
});

test('Q9 answer_text만 다른 경우도 불일치로 판정', async () => {
  const sameButQ9 = ANSWERS_A.map(a =>
    a.questionNo === 9 ? { ...a, answerText: '다른 문장' } : a
  );
  installServer({ prior: ANSWERS_A, post: 'dropBeforeSave' });
  const repo = createWorkOnboardingRepository(UID);

  const error = await rejectionOf(repo.submitAnswers(sameButQ9));
  assert.equal(error.reason, UNCONFIRMED_REASON.MISMATCH);

  assert.equal(
    answersMatchPayload(buildSubmitPayload(UID, ANSWERS_A), toServerShape(ANSWERS_A)),
    true
  );
  assert.equal(
    answersMatchPayload(buildSubmitPayload(UID, sameButQ9), toServerShape(ANSWERS_A)),
    false
  );
});

function toServerShape(answers) {
  return answers.map(a => ({
    questionNo: a.questionNo,
    answerCode: a.answerCode,
    answerLabel: a.answerCode,
    answerText: a.answerText ?? null,
    answeredAt: '2026-10-11T03:00:00',
  }));
}

test('answersMatchPayload: 개수·문항·코드·텍스트 불일치 판정', () => {
  const payload = buildSubmitPayload(UID, ANSWERS_A);
  const server = toServerShape(ANSWERS_A);

  assert.equal(answersMatchPayload(payload, server), true);
  assert.equal(answersMatchPayload(payload, server.slice(1)), false, '문항 누락');
  assert.equal(
    answersMatchPayload(payload, [...server, { ...server[0], questionNo: 11 }]),
    false,
    '초과'
  );
  assert.equal(answersMatchPayload(payload, null), false);
  assert.equal(
    answersMatchPayload(
      payload,
      server.map(a => (a.questionNo === 2 ? { ...a, answerCode: 'JEONSE' } : a))
    ),
    false,
    '코드 불일치'
  );
  assert.equal(
    answersMatchPayload(
      payload,
      server.map(a => (a.questionNo === 2 ? { ...a, answerText: 'x' } : a))
    ),
    false,
    '선택형 텍스트 불일치'
  );
  assert.equal(
    answersMatchPayload(
      payload,
      server.map(a => (a.questionNo === 1 ? { ...a, questionNo: 2 } : a))
    ),
    false,
    '문항 번호 중복'
  );
});

test('재확인 호출 자체가 실패하면 SAVE_UNCONFIRMED(CHECK_FAILED), 재제출 없음', async () => {
  for (const checks of ['failProgress', 'failAnswers']) {
    gateway.reset();
    gateway.validTokens.add('valid');
    installServer({ post: 'dropAfterSave', checks });
    const repo = createWorkOnboardingRepository(UID);

    const error = await rejectionOf(repo.submitAnswers(ANSWERS_A));

    assert.equal(error.kind, SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED, checks);
    assert.equal(error.reason, UNCONFIRMED_REASON.CHECK_FAILED, checks);
    assert.equal(error.checkErrorType, ONBOARDING_ERROR_TYPE.NETWORK, checks);
    assert.deepEqual(toComparable(error.retryPayload), toComparable(ANSWERS_A), checks);
    assert.equal(postCount(), 1, checks);
  }
});

test('503 응답도 반영 여부를 알 수 없으므로 재확인한다', async () => {
  installServer({ post: 'status503' });
  const repo = createWorkOnboardingRepository(UID);

  const error = await rejectionOf(repo.submitAnswers(ANSWERS_A));

  assert.equal(error.kind, SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED);
  assert.equal(error.submitErrorType, ONBOARDING_ERROR_TYPE.SERVER);
  assert.equal(getCount(progressPath(UID)), 1);
  assert.equal(postCount(), 1);
});

test('400(서버가 거부)는 확정 실패: 원래 오류를 그대로 던지고 재확인/재제출 없음, 기존 답변 보존', async () => {
  const { serverAnswers } = installServer({ prior: ANSWERS_A, post: 'status400' });
  const repo = createWorkOnboardingRepository(UID);

  const error = await rejectionOf(repo.submitAnswers(ANSWERS_B));

  assert.equal(error.status, 400);
  assert.equal(error instanceof WorkOnboardingSubmitError, false);
  assert.equal(postCount(), 1);
  assert.equal(getCount(progressPath(UID)), 0);
  assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_A));
});

// ── 중복 제출 방지 ───────────────────────────────────────────

test('동시 중복 제출은 IN_PROGRESS로 거부, POST는 1회뿐이며 끝난 뒤에는 다시 제출 가능', async () => {
  installServer();
  const repo = createWorkOnboardingRepository(UID);

  const first = repo.submitAnswers(ANSWERS_A);
  const second = await rejectionOf(repo.submitAnswers(ANSWERS_A));
  assert.equal(second.kind, SUBMIT_ERROR_KIND.IN_PROGRESS);
  await first;
  assert.equal(postCount(), 1);

  await repo.submitAnswers(ANSWERS_B);
  assert.equal(postCount(), 2, '완료 후의 새 제출(재검사)은 허용');
});

test('실패 후에도 제출 잠금이 풀리고, 어떤 실패에서도 POST는 호출당 1회', async () => {
  for (const post of [
    'dropBeforeSave',
    'timeoutBeforeSave',
    'status400',
    'status503',
    'notCompletedResponse',
  ]) {
    gateway.reset();
    gateway.validTokens.add('valid');
    installServer({ post });
    const repo = createWorkOnboardingRepository(UID);

    await rejectionOf(repo.submitAnswers(ANSWERS_A));
    assert.equal(postCount(), 1, post);

    const again = await rejectionOf(repo.submitAnswers(ANSWERS_A));
    assert.notEqual(again.kind, SUBMIT_ERROR_KIND.IN_PROGRESS, `${post}: 잠금 해제`);
    assert.equal(postCount(), 2, `${post}: 사용자가 다시 호출했을 때만 재전송`);
  }
});

// ── 로컬 Draft 저장소 ────────────────────────────────────────

const DRAFT = {
  mode: 'initial',
  currentIndex: 3,
  answers: {
    1: { answerCode: 'STUDENT' },
    9: { answerCode: 'UNKNOWN', answerText: Q9_A },
  },
};

test('Draft: 저장/조회/삭제와 정확한 저장 키', async () => {
  const draft = getWorkOnboardingDraftStorage(UID);
  assert.equal(workOnboardingDraftKey(UID), `@financialOnboarding:draftServer:v1:${UID}`);
  assert.equal(draft.key, `@financialOnboarding:draftServer:v1:${UID}`);

  assert.equal(await draft.load(), null, '없으면 null');

  await draft.save(DRAFT);
  assert.ok(__store.has(`@financialOnboarding:draftServer:v1:${UID}`));

  const loaded = await draft.load();
  assert.equal(loaded.mode, 'initial');
  assert.equal(loaded.currentIndex, 3);
  assert.deepEqual(loaded.answers, DRAFT.answers);
  assert.equal(typeof loaded.updatedAt, 'string');

  await draft.clear();
  assert.equal(await draft.load(), null);
  assert.equal(__store.has(`@financialOnboarding:draftServer:v1:${UID}`), false);
});

test('Draft: 사용자별 데이터 분리', async () => {
  const a = getWorkOnboardingDraftStorage(UID);
  const b = getWorkOnboardingDraftStorage(OTHER_UID);

  await a.save(DRAFT);
  assert.equal(await b.load(), null, '다른 사용자 Draft는 보이지 않음');

  await b.save({
    ...DRAFT,
    mode: 'retake',
    currentIndex: 0,
    answers: { 2: { answerCode: 'JEONSE' } },
  });
  assert.equal((await a.load()).mode, 'initial');
  assert.equal((await b.load()).mode, 'retake');

  await a.clear();
  assert.equal(await a.load(), null);
  assert.notEqual(await b.load(), null, '다른 사용자 Draft는 삭제되지 않음');
  await b.clear();
});

test('Draft: 잘못된 형식은 저장 거부, 손상된 저장 값은 null 반환하되 삭제하지 않음', async () => {
  const draft = getWorkOnboardingDraftStorage(UID);

  for (const bad of [
    null,
    {},
    { ...DRAFT, mode: 'x' },
    { ...DRAFT, currentIndex: -1 },
    { ...DRAFT, currentIndex: 1.5 },
    { ...DRAFT, answers: [] },
    { ...DRAFT, answers: { 0: { answerCode: 'A' } } },
    { ...DRAFT, answers: { 11: { answerCode: 'A' } } },
    { ...DRAFT, answers: { q1: { answerCode: 'A' } } },
    { ...DRAFT, answers: { 1: { answerCode: '' } } },
    { ...DRAFT, answers: { 1: { answerCode: 'A', answerText: 5 } } },
  ]) {
    await assert.rejects(draft.save(bad), OnboardingRequestError);
  }
  assert.equal(__store.size, 0, '잘못된 Draft는 아무것도 쓰지 않음');

  const key = workOnboardingDraftKey(UID);
  for (const corrupt of ['not json', '{"version":2}', JSON.stringify({ version: 1, mode: 'x' })]) {
    __store.set(key, corrupt);
    assert.equal(await draft.load(), null);
    assert.equal(__store.get(key), corrupt, '손상된 값을 삭제하지 않음');
  }

  assert.throws(() => getWorkOnboardingDraftStorage('12a'), OnboardingRequestError);
});

test('Draft: AsyncStorage 쓰기 실패는 그대로 전달되고 이후 작업은 계속 가능', async () => {
  const draft = getWorkOnboardingDraftStorage(UID);
  __control.fail.set = 1;
  await assert.rejects(draft.save(DRAFT), /AsyncStorage stub/);
  await draft.save(DRAFT);
  assert.notEqual(await draft.load(), null);
  await draft.clear();
});

test('Draft: 연속 저장은 호출 순서대로 직렬화되어 마지막 값이 남음', async () => {
  const draft = getWorkOnboardingDraftStorage(UID);
  __control.delay.set = 20;
  const first = draft.save({ ...DRAFT, currentIndex: 1 });
  const second = draft.save({ ...DRAFT, currentIndex: 2 });
  const third = draft.save({ ...DRAFT, currentIndex: 5 });
  await Promise.all([first, second, third]);
  __control.delay.set = 0;
  assert.equal((await draft.load()).currentIndex, 5);
  await draft.clear();
});

test('Draft는 제출 성공/실패/불확실 어느 경우에도 Repository가 삭제하지 않음 (삭제는 상위 흐름)', async () => {
  for (const post of [
    'ok',
    'dropAfterSave',
    'dropBeforeSave',
    'timeoutBeforeSave',
    'status400',
    'notCompletedResponse',
  ]) {
    gateway.reset();
    gateway.validTokens.add('valid');
    installServer({ post });
    const repo = createWorkOnboardingRepository(UID);
    await repo.draft.save({ ...DRAFT, mode: 'retake' });

    await repo.submitAnswers(ANSWERS_A).catch(() => {});

    const kept = await repo.draft.load();
    assert.notEqual(kept, null, `${post}: Draft 유지`);
    assert.equal(kept.mode, 'retake');
    assert.equal(kept.currentIndex, 3);
    await repo.draft.clear();
  }
});

test('재검사 진행 중(Draft 저장)에는 서버로 쓰기 요청이 없고 기존 서버 답변이 그대로임', async () => {
  const { serverAnswers } = installServer({ prior: ANSWERS_A });
  const repo = createWorkOnboardingRepository(UID);

  await repo.draft.save({
    mode: 'retake',
    currentIndex: 4,
    answers: { 1: { answerCode: 'EMPLOYED' } },
  });
  await repo.draft.save({
    mode: 'retake',
    currentIndex: 5,
    answers: { 1: { answerCode: 'EMPLOYED' } },
  });
  const loaded = await repo.loadAnswers();

  assert.equal(postCount(), 0);
  assert.deepEqual(toComparable(serverAnswers()), toComparable(ANSWERS_A));
  assert.equal(loaded.length, 10);
  await repo.draft.clear();
});

// ── 기존 AsyncStorage 데이터 보존 ────────────────────────────

test('기존 온보딩 로컬 데이터와 Auth 저장 값은 어떤 작업에서도 변경·삭제되지 않음', async () => {
  const preserved = {
    [`@financialOnboarding:draft:v1:${UID}`]: JSON.stringify({
      currentIndex: 2,
      answers: { q1: 'employed' },
    }),
    [`@financialOnboarding:result:v1:${UID}`]: JSON.stringify({
      answers: { q1: 'employed' },
      updatedAt: 't',
    }),
    [`@financialOnboarding:result:v1:${OTHER_UID}`]: JSON.stringify({
      answers: {},
      updatedAt: 't2',
    }),
    '@financialOnboarding:draft:v1:guest': 'guest-draft',
    '@auth:autoLogin': 'true',
    '@auth:onboardingDone': 'true',
  };
  for (const [key, value] of Object.entries(preserved)) __store.set(key, value);

  installServer({ post: 'dropAfterSave' });
  const repo = createWorkOnboardingRepository(UID);

  await repo.draft.save(DRAFT);
  await repo.draft.load();
  await repo.submitAnswers(ANSWERS_A);
  await repo.draft.clear();
  await getWorkOnboardingDraftStorage(OTHER_UID).save(DRAFT);
  await getWorkOnboardingDraftStorage(OTHER_UID).clear();

  for (const [key, value] of Object.entries(preserved)) {
    assert.equal(__store.get(key), value, `${key} 보존`);
  }
  assert.deepEqual(
    [...__store.keys()].sort(),
    Object.keys(preserved).sort(),
    '새 Draft 키는 모두 정리되고 기존 키만 남음'
  );
});

// ── 실제 서버 미호출 ─────────────────────────────────────────

test('모든 HTTP 요청은 127.0.0.1 모의 Gateway로만 전송됨', () => {
  assert.equal(new URL(baseURL).hostname, '127.0.0.1');
  assert.ok(everRequested.length > 0);
  for (const record of everRequested) {
    assert.equal(record.protocol, 'http');
    assert.equal(record.host, '127.0.0.1');
  }
});
