// 서버 질문(API-30) 기반 재무 온보딩 진행 상태 관리.
// 기존 useOnboardingFlow.js / 하드코딩 질문 / 기존 Repository와 무관하며, 아직 어떤 화면에도 연결되어 있지 않다.
//
// 구성
// - 순수 함수(normalizeQuestions, 답변 검증, Draft 호환성 검사 등): 테스트 가능하도록 모두 export
// - createWorkOnboardingFlow(): React 없이 동작하는 컨트롤러(상태 + 구독). 테스트는 이것을 직접 사용한다.
// - useWorkOnboardingFlow(): 컨트롤러를 useSyncExternalStore로 감싼 얇은 Hook
//
// 답변 구조: { [questionNo]: { answerCode, answerText? } }
// - 선택형: 서버 options의 code만 허용(UNKNOWN도 서버가 준 선택지일 때만). answerText는 넣지 않는다.
// - Q9(서술형): 텍스트 입력 → { answerCode: 'UNKNOWN', answerText }, 명시적 건너뛰기 → { answerCode: 'UNKNOWN' }.
//   아무것도 입력하지 않은 상태는 답변 없음이며 자동으로 UNKNOWN 처리하지 않는다.
// - 서술형 최대 60자는 프론트 UI 제한일 뿐 서버의 길이 제한이 아니다(서버는 Text 컬럼, 길이 검증 없음).
//
// Draft는 workOnboardingDraftStorage(@financialOnboarding:draftServer:v1:{userId})만 사용한다. 질문과 호환되지
// 않는 Draft는 삭제하지 않고 'draft_incompatible' 상태로 알리며, startFresh()를 명시적으로 호출했을 때만 새로 시작한다.
// 이 모듈은 제출(API-31)을 수행하지 않는다. prepareSubmission()은 검증된 payload만 만든다.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  MAX_QUESTION_NO,
  MIN_QUESTION_NO,
  UNKNOWN_ANSWER_CODE,
  getOnboardingErrorType,
} from './onboardingApi';
import {
  buildSubmitPayload,
  getWorkOnboardingRepository,
} from './adapters/workOnboardingRepository';

export const FREE_TEXT_QUESTION_NO = 9;
// 프론트 UI 제한(서버 제한 아님). 공백 제거 후 글자 수 기준.
export const MAX_FREE_TEXT_LENGTH = 60;

export const FLOW_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  QUESTIONS_ERROR: 'questions_error', // 질문 조회 실패(네트워크/서버 등)
  QUESTIONS_INVALID: 'questions_invalid', // 질문 데이터가 서버 계약(Q1~Q10)과 다름
  DRAFT_ERROR: 'draft_error', // 저장된 Draft를 읽지 못함(삭제하지 않음)
  DRAFT_INCOMPATIBLE: 'draft_incompatible', // Draft가 현재 서버 질문과 호환되지 않음
  DRAFT_MODE_MISMATCH: 'draft_mode_mismatch', // 저장된 Draft의 mode가 요청한 mode와 다름(자동 복원 안 함)
};

export const QUESTION_INVALID_REASON = {
  NOT_ARRAY: 'NOT_ARRAY',
  WRONG_COUNT: 'WRONG_COUNT',
  INVALID_QUESTION: 'INVALID_QUESTION',
  DUPLICATE_QUESTION_NO: 'DUPLICATE_QUESTION_NO',
  MISSING_QUESTION_NO: 'MISSING_QUESTION_NO',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  DUPLICATE_OPTION_CODE: 'DUPLICATE_OPTION_CODE',
  UNEXPECTED_QUESTION_TYPE: 'UNEXPECTED_QUESTION_TYPE',
};

export const ANSWER_REJECT_REASON = {
  NOT_READY: 'NOT_READY',
  WRONG_QUESTION_TYPE: 'WRONG_QUESTION_TYPE',
  UNKNOWN_OPTION: 'UNKNOWN_OPTION',
  EMPTY_TEXT: 'EMPTY_TEXT',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  NOT_ANSWERED: 'NOT_ANSWERED',
  AT_BOUNDARY: 'AT_BOUNDARY',
  DRAFT_CLEAR_FAILED: 'DRAFT_CLEAR_FAILED', // startFresh에서 Draft 삭제 실패
  SERVER_STATE_UNKNOWN: 'SERVER_STATE_UNKNOWN', // resumeDraft에 서버 완료 상태가 전달되지 않음
  MODE_CONFLICTS_WITH_SERVER: 'MODE_CONFLICTS_WITH_SERVER', // Draft mode가 서버 완료 상태와 충돌
};

export const DRAFT_ISSUE = {
  UNKNOWN_QUESTION: 'UNKNOWN_QUESTION', // Draft의 문항 번호가 서버 질문에 없음
  CODE_NOT_IN_OPTIONS: 'CODE_NOT_IN_OPTIONS', // 저장된 answerCode가 현재 선택지에 없음
  TYPE_CHANGED_TO_FREE_TEXT: 'TYPE_CHANGED_TO_FREE_TEXT', // 선택형이던 문항이 서술형이 됨
  TYPE_CHANGED_TO_CHOICE: 'TYPE_CHANGED_TO_CHOICE', // 서술형이던 문항이 선택형이 됨
  TEXT_TOO_LONG: 'TEXT_TOO_LONG', // 저장된 서술 답변이 UI 제한(60자)을 넘음
  INDEX_OUT_OF_RANGE: 'INDEX_OUT_OF_RANGE', // 저장된 질문 위치가 현재 질문 수를 벗어남
};

export const SUBMISSION_ISSUE = {
  NOT_READY: 'NOT_READY',
  MISSING_ANSWERS: 'MISSING_ANSWERS',
  INVALID_ANSWER: 'INVALID_ANSWER',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';
const textLength = text => Array.from(text).length;

// ── 질문 데이터 ──────────────────────────────────────────────

// API-30 결과(또는 동일 형태)를 검증하고 questionNo 오름차순으로 정렬한 불변 목록을 돌려준다.
// 잘못된 데이터는 기본 질문으로 대체하지 않고 { ok:false, reason, questionNo? }로 거부한다.
export const normalizeQuestions = raw => {
  const fail = (reason, questionNo) => ({
    ok: false,
    reason,
    ...(questionNo !== undefined ? { questionNo } : {}),
  });

  if (!Array.isArray(raw)) return fail(QUESTION_INVALID_REASON.NOT_ARRAY);
  if (raw.length !== MAX_QUESTION_NO) return fail(QUESTION_INVALID_REASON.WRONG_COUNT);

  const seen = new Set();
  const questions = [];

  for (const item of raw) {
    if (
      !isPlainObject(item) ||
      !Number.isInteger(item.questionNo) ||
      !isNonEmptyString(item.text) ||
      !isNonEmptyString(item.phase) ||
      typeof item.freeText !== 'boolean' ||
      !Array.isArray(item.options)
    ) {
      return fail(QUESTION_INVALID_REASON.INVALID_QUESTION);
    }
    if (seen.has(item.questionNo)) {
      return fail(QUESTION_INVALID_REASON.DUPLICATE_QUESTION_NO, item.questionNo);
    }
    seen.add(item.questionNo);

    const codes = new Set();
    const options = [];
    for (const option of item.options) {
      if (
        !isPlainObject(option) ||
        !isNonEmptyString(option.code) ||
        !isNonEmptyString(option.label)
      ) {
        return fail(QUESTION_INVALID_REASON.INVALID_OPTIONS, item.questionNo);
      }
      if (codes.has(option.code)) {
        return fail(QUESTION_INVALID_REASON.DUPLICATE_OPTION_CODE, item.questionNo);
      }
      codes.add(option.code);
      options.push(Object.freeze({ code: option.code, label: option.label }));
    }

    // 서버 계약: Q9만 서술형(선택지 없음), 나머지는 선택지가 1개 이상인 선택형.
    const expectFree = item.questionNo === FREE_TEXT_QUESTION_NO;
    if (
      item.freeText !== expectFree ||
      (expectFree ? options.length !== 0 : options.length === 0)
    ) {
      return fail(QUESTION_INVALID_REASON.UNEXPECTED_QUESTION_TYPE, item.questionNo);
    }

    questions.push(
      Object.freeze({
        questionNo: item.questionNo,
        phase: item.phase,
        text: item.text,
        freeText: item.freeText,
        options: Object.freeze(options),
      })
    );
  }

  for (let no = MIN_QUESTION_NO; no <= MAX_QUESTION_NO; no += 1) {
    if (!seen.has(no)) return fail(QUESTION_INVALID_REASON.MISSING_QUESTION_NO, no);
  }

  questions.sort((a, b) => a.questionNo - b.questionNo);
  return { ok: true, questions: Object.freeze(questions) };
};

// ── 답변 검증 ────────────────────────────────────────────────

// 현재 질문에 대해 유효한 답변인지 판정한다. 유효하면 null, 아니면 사유 문자열.
export const getAnswerProblem = (question, answer) => {
  if (!question || !isPlainObject(answer) || typeof answer.answerCode !== 'string') {
    return ANSWER_REJECT_REASON.UNKNOWN_OPTION;
  }

  if (question.freeText) {
    if (answer.answerCode !== UNKNOWN_ANSWER_CODE) return ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE;
    if (answer.answerText === undefined || answer.answerText === null) return null; // 명시적 건너뛰기
    if (typeof answer.answerText !== 'string' || answer.answerText.trim() === '') {
      return ANSWER_REJECT_REASON.EMPTY_TEXT;
    }
    if (textLength(answer.answerText.trim()) > MAX_FREE_TEXT_LENGTH) {
      return ANSWER_REJECT_REASON.TEXT_TOO_LONG;
    }
    return null;
  }

  if (answer.answerText !== undefined && answer.answerText !== null) {
    return ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE;
  }
  return question.options.some(option => option.code === answer.answerCode)
    ? null
    : ANSWER_REJECT_REASON.UNKNOWN_OPTION;
};

// ── Draft 호환성 ─────────────────────────────────────────────

// Draft { mode, currentIndex, answers }가 현재 서버 질문과 호환되는지 검사한다(삭제/수정 없음).
// 감지 가능한 변화: 문항 번호 없음, 코드가 선택지에 없음, 선택형↔서술형 변경(아래 설명), 서술 길이 초과, 위치 초과.
// 감지할 수 없는 변화: 선택지 label/순서/추가, 질문 문구, phase 변경, 서술형 문항의 "건너뛰기"(UNKNOWN)와
//   선택형의 UNKNOWN 선택(Draft에는 코드만 있어 문항 종류를 알 수 없음). Draft에 질문 스냅샷이 없기 때문이다.
export const checkDraftCompatibility = (questions, draft) => {
  const issues = [];
  const byNo = new Map(questions.map(question => [question.questionNo, question]));

  if (!Number.isInteger(draft.currentIndex) || draft.currentIndex >= questions.length) {
    issues.push({ type: DRAFT_ISSUE.INDEX_OUT_OF_RANGE });
  }

  for (const [key, answer] of Object.entries(draft.answers)) {
    const questionNo = Number(key);
    const question = byNo.get(questionNo);

    if (!question) {
      issues.push({ type: DRAFT_ISSUE.UNKNOWN_QUESTION, questionNo });
      continue;
    }

    const hasText = answer.answerText !== undefined && answer.answerText !== null;

    if (question.freeText) {
      if (answer.answerCode !== UNKNOWN_ANSWER_CODE) {
        issues.push({ type: DRAFT_ISSUE.TYPE_CHANGED_TO_FREE_TEXT, questionNo });
      } else if (hasText && answer.answerText.trim() === '') {
        issues.push({ type: DRAFT_ISSUE.TYPE_CHANGED_TO_FREE_TEXT, questionNo });
      } else if (hasText && textLength(answer.answerText.trim()) > MAX_FREE_TEXT_LENGTH) {
        issues.push({ type: DRAFT_ISSUE.TEXT_TOO_LONG, questionNo });
      }
      continue;
    }

    if (hasText) {
      issues.push({ type: DRAFT_ISSUE.TYPE_CHANGED_TO_CHOICE, questionNo });
    } else if (!question.options.some(option => option.code === answer.answerCode)) {
      issues.push({ type: DRAFT_ISSUE.CODE_NOT_IN_OPTIONS, questionNo });
    }
  }

  return { compatible: issues.length === 0, issues };
};

// 서버 API-33 결과 → 답변 맵(재검사 초기값용). 호환성은 호출 시 별도로 검사된다.
export const answersFromServerAnswers = serverAnswers => {
  const answers = {};
  for (const item of serverAnswers ?? []) {
    answers[item.questionNo] = {
      answerCode: item.answerCode,
      ...(typeof item.answerText === 'string' ? { answerText: item.answerText } : {}),
    };
  }
  return answers;
};

const cloneAnswers = answers => {
  const copy = {};
  for (const [key, value] of Object.entries(answers ?? {})) copy[key] = { ...value };
  return copy;
};

// ── 컨트롤러 ─────────────────────────────────────────────────

// repository: getWorkOnboardingRepository(userId) 결과와 같은 형태 { userId, draft, loadQuestions }
export function createWorkOnboardingFlow({ repository, mode = 'initial', initialAnswers } = {}) {
  const requestedMode = mode === 'retake' ? 'retake' : 'initial';
  const listeners = new Set();

  let questions = null;
  let flow = { mode: requestedMode, currentIndex: 0, answers: {} };
  let status = FLOW_STATUS.IDLE;
  let error = null; // { type, ... } 질문/Draft 읽기 오류 또는 무효 질문 사유
  let issues = [];
  let incompatibleDraft = null;
  let modeMismatch = null; // { requestedMode, draftMode, draft } — 원본 Draft 보존용
  let draftError = false;
  let lastSave = Promise.resolve();
  let initToken = 0;
  let snapshot;

  const questionAt = index => (questions ? questions[index] : undefined);

  const buildSnapshot = () => {
    const ready = status === FLOW_STATUS.READY;
    const currentQuestion = ready ? questionAt(flow.currentIndex) : undefined;
    const currentAnswer = currentQuestion ? flow.answers[currentQuestion.questionNo] : undefined;
    const missingQuestionNos = ready
      ? questions.filter(q => !flow.answers[q.questionNo]).map(q => q.questionNo)
      : [];

    return Object.freeze({
      status,
      error,
      issues,
      incompatibleDraft,
      modeMismatch,
      requestedMode,
      draftError,
      mode: flow.mode,
      questions: ready ? questions : null,
      totalQuestions: ready ? questions.length : 0,
      currentIndex: flow.currentIndex,
      currentQuestion,
      currentAnswer,
      answers: flow.answers,
      isCurrentAnswered: Boolean(currentAnswer),
      isFirst: flow.currentIndex === 0,
      isLast: ready && flow.currentIndex === questions.length - 1,
      isComplete: ready && missingQuestionNos.length === 0,
      missingQuestionNos,
    });
  };

  const publish = () => {
    snapshot = buildSnapshot();
    listeners.forEach(listener => listener());
  };

  const persist = () => {
    const draft = { mode: flow.mode, currentIndex: flow.currentIndex, answers: flow.answers };
    lastSave = repository.draft.save(draft).then(
      () => {
        if (draftError) {
          draftError = false;
          publish();
        }
      },
      () => {
        draftError = true;
        publish();
      }
    );
  };

  const commit = nextFlow => {
    flow = nextFlow;
    publish();
    persist();
  };

  const notReady = () => ({ ok: false, reason: ANSWER_REJECT_REASON.NOT_READY });
  const reject = reason => ({ ok: false, reason });

  const enterReady = (nextFlow, normalizedQuestions) => {
    questions = normalizedQuestions;
    flow = nextFlow;
    status = FLOW_STATUS.READY;
    error = null;
    issues = [];
    incompatibleDraft = null;
    modeMismatch = null;
  };

  const controller = {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // 질문 조회 → Draft 조회 → 호환성 검사. Draft는 어떤 경우에도 삭제/변경하지 않는다.
    init: async () => {
      const token = (initToken += 1);
      status = FLOW_STATUS.LOADING;
      error = null;
      issues = [];
      incompatibleDraft = null;
      modeMismatch = null;
      publish();

      const stale = () => token !== initToken;

      let rawQuestions;
      try {
        rawQuestions = await repository.loadQuestions();
      } catch (loadError) {
        if (stale()) return;
        status = FLOW_STATUS.QUESTIONS_ERROR;
        error = { type: getOnboardingErrorType(loadError) };
        return publish();
      }
      if (stale()) return;

      const normalized = normalizeQuestions(rawQuestions);
      if (!normalized.ok) {
        status = FLOW_STATUS.QUESTIONS_INVALID;
        error = { reason: normalized.reason, questionNo: normalized.questionNo };
        return publish();
      }

      let draft;
      try {
        draft = await repository.draft.load();
      } catch {
        if (stale()) return;
        status = FLOW_STATUS.DRAFT_ERROR;
        error = { type: 'DRAFT_LOAD_FAILED' };
        return publish();
      }
      if (stale()) return;

      // Draft mode가 요청 mode와 다르면 자동 복원하지 않는다(initial/retake가 섞이는 것을 방지).
      // Draft는 삭제/수정하지 않고 원본을 modeMismatch로 보존한다. 선택은 resumeDraft()/startFresh()로 한다.
      if (draft && draft.mode !== requestedMode) {
        questions = normalized.questions;
        status = FLOW_STATUS.DRAFT_MODE_MISMATCH;
        modeMismatch = Object.freeze({
          requestedMode,
          draftMode: draft.mode,
          draft: Object.freeze({
            mode: draft.mode,
            currentIndex: draft.currentIndex,
            answers: cloneAnswers(draft.answers),
          }),
        });
        return publish();
      }

      // mode가 일치하는 Draft는 위치/답변을 복원하고, 없으면 요청 mode와 initialAnswers(재검사 시 기존 서버 답변)를 쓴다.
      const candidate = draft
        ? { mode: draft.mode, currentIndex: draft.currentIndex, answers: draft.answers }
        : { mode: requestedMode, currentIndex: 0, answers: cloneAnswers(initialAnswers) };

      const compat = checkDraftCompatibility(normalized.questions, candidate);
      if (!compat.compatible) {
        questions = normalized.questions;
        status = FLOW_STATUS.DRAFT_INCOMPATIBLE;
        issues = compat.issues;
        incompatibleDraft = Object.freeze({ ...candidate, fromDraft: Boolean(draft) });
        return publish();
      }

      enterReady(
        {
          mode: candidate.mode,
          currentIndex: candidate.currentIndex,
          answers: cloneAnswers(candidate.answers),
        },
        normalized.questions
      );
      publish();
    },

    // 호환되지 않거나 mode가 다른 Draft를 버리고 `요청한 mode`로 새로 시작한다.
    // 사용자가 명시적으로 선택했을 때만 호출한다. 이 사용자의 서버용 Draft 키만 삭제하며,
    // 삭제에 실패하면 성공으로 처리하지 않고 상태/Draft를 그대로 둔다.
    // 재검사(retake)는 전달받은 initialAnswers로 시작한다(현재 질문과 맞지 않으면 호환성 오류 상태).
    startFresh: async () => {
      if (status !== FLOW_STATUS.DRAFT_INCOMPATIBLE && status !== FLOW_STATUS.DRAFT_MODE_MISMATCH) {
        return notReady();
      }
      const token = initToken;
      try {
        await repository.draft.clear();
      } catch {
        return reject(ANSWER_REJECT_REASON.DRAFT_CLEAR_FAILED);
      }
      if (token !== initToken) return notReady();

      const fresh = {
        mode: requestedMode,
        currentIndex: 0,
        answers: requestedMode === 'retake' ? cloneAnswers(initialAnswers) : {},
      };
      const compat = checkDraftCompatibility(questions, fresh);
      if (!compat.compatible) {
        status = FLOW_STATUS.DRAFT_INCOMPATIBLE;
        issues = compat.issues;
        modeMismatch = null;
        incompatibleDraft = Object.freeze({ ...fresh, fromDraft: false });
        publish();
        return { ok: true };
      }
      enterReady(fresh, questions);
      publish();
      return { ok: true };
    },

    // mode가 다른 Draft를 사용자가 이어서 하기로 선택했을 때 저장된 mode로 복원한다.
    // 3단계 컨트롤러는 서버의 온보딩 완료 상태를 알 수 없으므로 호출부가 serverCompleted(boolean)를 반드시 전달해야 한다.
    //  - Draft mode 'initial' + serverCompleted true  → 이미 완료된 계정의 옛 초기 Draft: 복원 거부
    //  - Draft mode 'retake'  + serverCompleted false → 완료 전 계정의 재검사 Draft: 복원 거부
    // 서버 상태를 확인하지 못한 상태(undefined 등)에서는 복원하지 않는다. 거부해도 Draft는 보존된다.
    // 복원 시 Draft가 현재 질문과 호환되지 않으면 draft_incompatible 상태가 된다(Draft는 그대로).
    resumeDraft: ({ serverCompleted } = {}) => {
      if (status !== FLOW_STATUS.DRAFT_MODE_MISMATCH || !modeMismatch) return notReady();
      if (typeof serverCompleted !== 'boolean') {
        return reject(ANSWER_REJECT_REASON.SERVER_STATE_UNKNOWN);
      }
      const { draft } = modeMismatch;
      if (
        (draft.mode === 'initial' && serverCompleted) ||
        (draft.mode === 'retake' && !serverCompleted)
      ) {
        return reject(ANSWER_REJECT_REASON.MODE_CONFLICTS_WITH_SERVER);
      }

      const compat = checkDraftCompatibility(questions, draft);
      if (!compat.compatible) {
        status = FLOW_STATUS.DRAFT_INCOMPATIBLE;
        issues = compat.issues;
        modeMismatch = null;
        incompatibleDraft = Object.freeze({ ...draft, fromDraft: true });
        publish();
        return { ok: true };
      }
      enterReady(
        {
          mode: draft.mode,
          currentIndex: draft.currentIndex,
          answers: cloneAnswers(draft.answers),
        },
        questions
      );
      publish();
      return { ok: true };
    },

    // 선택형: 현재 질문의 서버 option.code 선택(UNKNOWN도 서버가 준 선택지일 때만).
    selectOption: optionCode => {
      const question = status === FLOW_STATUS.READY ? questionAt(flow.currentIndex) : undefined;
      if (!question) return notReady();
      if (question.freeText) return reject(ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);
      if (!question.options.some(option => option.code === optionCode)) {
        return reject(ANSWER_REJECT_REASON.UNKNOWN_OPTION); // 다른 질문의 코드/임의 코드 차단
      }
      commit({
        ...flow,
        answers: { ...flow.answers, [question.questionNo]: { answerCode: optionCode } },
      });
      return { ok: true };
    },

    // Q9: 텍스트 입력.
    // - '' (빈 문자열): 입력을 모두 지운 것 → 기존 답변 삭제, ok:true (자동 UNKNOWN 아님)
    // - 공백만 있는 문자열 / 60자 초과(공백 제거 후) / 문자열이 아님: 거부(ok:false). 답변과 Draft는 변경하지 않는다.
    // 화면은 입력창 값이 거부된 상태(컨트롤러 값과 다름)이면 오류를 표시하고 이동/제출을 막아야 한다.
    setText: text => {
      const question = status === FLOW_STATUS.READY ? questionAt(flow.currentIndex) : undefined;
      if (!question) return notReady();
      if (!question.freeText) return reject(ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);
      if (typeof text !== 'string') return reject(ANSWER_REJECT_REASON.EMPTY_TEXT);

      if (text === '') {
        const { [question.questionNo]: removed, ...rest } = flow.answers;
        if (removed !== undefined) commit({ ...flow, answers: rest });
        return { ok: true };
      }
      if (text.trim() === '') return reject(ANSWER_REJECT_REASON.EMPTY_TEXT);
      if (textLength(text.trim()) > MAX_FREE_TEXT_LENGTH) {
        return reject(ANSWER_REJECT_REASON.TEXT_TOO_LONG);
      }

      commit({
        ...flow,
        answers: {
          ...flow.answers,
          [question.questionNo]: { answerCode: UNKNOWN_ANSWER_CODE, answerText: text },
        },
      });
      return { ok: true };
    },

    // Q9: "아직 모르겠어요"를 명시적으로 선택 → { answerCode:'UNKNOWN' } (기존 입력 텍스트는 버림).
    skipFreeText: () => {
      const question = status === FLOW_STATUS.READY ? questionAt(flow.currentIndex) : undefined;
      if (!question) return notReady();
      if (!question.freeText) return reject(ANSWER_REJECT_REASON.WRONG_QUESTION_TYPE);
      commit({
        ...flow,
        answers: { ...flow.answers, [question.questionNo]: { answerCode: UNKNOWN_ANSWER_CODE } },
      });
      return { ok: true };
    },

    // 현재 질문이 답변된 경우에만 다음으로 이동(마지막 질문에서는 이동하지 않음).
    goNext: () => {
      const question = status === FLOW_STATUS.READY ? questionAt(flow.currentIndex) : undefined;
      if (!question) return notReady();
      if (!flow.answers[question.questionNo]) return reject(ANSWER_REJECT_REASON.NOT_ANSWERED);
      if (flow.currentIndex >= questions.length - 1)
        return reject(ANSWER_REJECT_REASON.AT_BOUNDARY);
      commit({ ...flow, currentIndex: flow.currentIndex + 1 });
      return { ok: true };
    },

    goPrev: () => {
      if (status !== FLOW_STATUS.READY) return notReady();
      if (flow.currentIndex <= 0) return reject(ANSWER_REJECT_REASON.AT_BOUNDARY);
      commit({ ...flow, currentIndex: flow.currentIndex - 1 });
      return { ok: true };
    },

    // 제출 전 검증. 통과한 경우에만 payload를 만든다(실제 제출은 하지 않음).
    // 반환: { ok:true, payload, questions } | { ok:false, issue, questionNos? }
    prepareSubmission: () => {
      if (status !== FLOW_STATUS.READY) return { ok: false, issue: SUBMISSION_ISSUE.NOT_READY };

      const missing = questions.filter(q => !flow.answers[q.questionNo]).map(q => q.questionNo);
      if (missing.length > 0) {
        return { ok: false, issue: SUBMISSION_ISSUE.MISSING_ANSWERS, questionNos: missing };
      }

      const invalid = questions
        .filter(q => getAnswerProblem(q, flow.answers[q.questionNo]) !== null)
        .map(q => q.questionNo);
      if (invalid.length > 0) {
        return { ok: false, issue: SUBMISSION_ISSUE.INVALID_ANSWER, questionNos: invalid };
      }

      // 서술 답변은 앞뒤 공백을 제거한 값을 보낸다(재확인 비교에도 같은 payload를 사용).
      const answers = questions.map(q => {
        const answer = flow.answers[q.questionNo];
        return {
          questionNo: q.questionNo,
          answerCode: answer.answerCode,
          ...(typeof answer.answerText === 'string'
            ? { answerText: answer.answerText.trim() }
            : {}),
        };
      });

      try {
        const payload = buildSubmitPayload(repository.userId, answers, questions);
        return { ok: true, payload, questions };
      } catch {
        return { ok: false, issue: SUBMISSION_ISSUE.INVALID_PAYLOAD };
      }
    },

    // 대기 중인 Draft 저장이 끝나길 기다린다(테스트/화면 이탈 시 사용).
    flushDraft: () => lastSave,
  };

  snapshot = buildSnapshot();
  return controller;
}

// ── Hook ─────────────────────────────────────────────────────

// 화면용 Hook. userId는 Auth의 user_id 문자열이다.
// repository를 주입하지 않으면 getWorkOnboardingRepository(userId)를 사용한다(잘못된 userId면 error 상태).
export function useWorkOnboardingFlow({ userId, mode, initialAnswers, repository } = {}) {
  const ref = useRef(null);

  if (
    ref.current === null ||
    ref.current.userId !== userId ||
    ref.current.repository !== repository
  ) {
    let resolved = repository;
    let setupError = null;
    if (!resolved) {
      try {
        resolved = getWorkOnboardingRepository(userId);
      } catch {
        setupError = { type: 'INVALID_USER' };
      }
    }
    ref.current = {
      userId,
      repository,
      setupError,
      controller: resolved
        ? createWorkOnboardingFlow({ repository: resolved, mode, initialAnswers })
        : null,
    };
  }

  const { controller, setupError } = ref.current;

  const snapshot = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getSnapshot : getIdleSnapshot
  );

  useEffect(() => {
    controller?.init();
  }, [controller]);

  if (!controller) {
    return { ...snapshot, status: FLOW_STATUS.QUESTIONS_ERROR, error: setupError };
  }

  return { ...snapshot, actions: controller };
}

const IDLE_SNAPSHOT = Object.freeze({ status: FLOW_STATUS.IDLE });
const noopSubscribe = () => () => {};
const getIdleSnapshot = () => IDLE_SNAPSHOT;
