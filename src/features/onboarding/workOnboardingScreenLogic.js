// 서버 기반 신규 재무 온보딩 화면(WorkFinancialOnboardingScreen / ...ResultScreen)의 판단·흐름 로직.
// React / React Native에 의존하지 않는 순수 모듈이라 Node 모의 테스트로 검증한다. 화면 파일은 이 모듈을
// 호출해 상태를 그리기만 한다. 아직 어떤 라우트/네비게이터에도 연결되어 있지 않다.
//
// 이 모듈은 Repository(2단계)와 Flow 컨트롤러(3단계)의 계약을 그대로 사용하며, 그 로직을 다시 구현하지 않는다.
import {
  MAX_QUESTION_NO,
  ONBOARDING_ERROR_TYPE,
  OnboardingRequestError,
  getOnboardingErrorType,
} from './onboardingApi';
import { SUBMIT_ERROR_KIND, WorkOnboardingSubmitError } from './adapters/workOnboardingRepository';
import { pickRandomItem } from './adapters/workOnboardingProfileImageStorage';
import {
  ANSWER_REJECT_REASON,
  DRAFT_ISSUE,
  FLOW_STATUS,
  FREE_TEXT_QUESTION_NO,
  MAX_FREE_TEXT_LENGTH,
  answersFromServerAnswers,
} from './useWorkOnboardingFlow';

// ── 화면 상태 ────────────────────────────────────────────────

export const SUBMIT_STATE = {
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUBMIT_ERROR: 'submit_error',
  SAVE_UNCONFIRMED: 'save_unconfirmed',
  COMPLETED: 'completed',
};

export const SCREEN_STATE = {
  LOADING: 'loading',
  READY: 'ready',
  QUESTIONS_ERROR: 'questions_error',
  QUESTIONS_INVALID: 'questions_invalid',
  DRAFT_ERROR: 'draft_error',
  DRAFT_INCOMPATIBLE: 'draft_incompatible',
  DRAFT_MODE_MISMATCH: 'draft_mode_mismatch',
  SUBMITTING: 'submitting',
  SUBMIT_ERROR: 'submit_error',
  SAVE_UNCONFIRMED: 'save_unconfirmed',
  COMPLETED: 'completed',
};

const FLOW_TO_SCREEN = {
  [FLOW_STATUS.IDLE]: SCREEN_STATE.LOADING,
  [FLOW_STATUS.LOADING]: SCREEN_STATE.LOADING,
  [FLOW_STATUS.READY]: SCREEN_STATE.READY,
  [FLOW_STATUS.QUESTIONS_ERROR]: SCREEN_STATE.QUESTIONS_ERROR,
  [FLOW_STATUS.QUESTIONS_INVALID]: SCREEN_STATE.QUESTIONS_INVALID,
  [FLOW_STATUS.DRAFT_ERROR]: SCREEN_STATE.DRAFT_ERROR,
  [FLOW_STATUS.DRAFT_INCOMPATIBLE]: SCREEN_STATE.DRAFT_INCOMPATIBLE,
  [FLOW_STATUS.DRAFT_MODE_MISMATCH]: SCREEN_STATE.DRAFT_MODE_MISMATCH,
};

// Flow 상태 + 제출 상태 → 화면 상태. 제출 상태는 Flow가 ready일 때만 의미가 있다.
export const deriveScreenState = (flowSnapshot, submitState = SUBMIT_STATE.IDLE) => {
  const flowState = FLOW_TO_SCREEN[flowSnapshot?.status] ?? SCREEN_STATE.LOADING;
  if (flowState === SCREEN_STATE.READY && submitState !== SUBMIT_STATE.IDLE) return submitState;
  return flowState;
};

// ── 질문/선택지 표시 데이터 ──────────────────────────────────

// 서버 선택지만 그대로 노출한다(아이콘/임의 선택지 없음). 서술형 질문은 선택지가 없다.
export const buildOptionViewModels = (question, answer) =>
  (question?.options ?? []).map(option => ({
    code: option.code,
    label: option.label,
    selected: answer?.answerCode === option.code,
  }));

export const buildProgressViewModel = snapshot => {
  const total = snapshot?.totalQuestions ?? 0;
  const current = (snapshot?.currentIndex ?? 0) + 1;
  return {
    current,
    total,
    ratio: total > 0 ? current / total : 0,
    phaseLabel: snapshot?.currentQuestion?.phase ?? '',
  };
};

// ── Q9 입력 판정 ─────────────────────────────────────────────

// Flow(useWorkOnboardingFlow)와 같은 규칙: 앞뒤 공백을 제외하고 코드포인트(Array.from) 단위로 센다.
// 60자는 프론트 UI 제한이며 서버 제한이 아니다. React Native TextInput의 maxLength는 UTF-16 단위라
// 이모지 1개를 2로 세므로 쓰지 않는다(초과 입력은 막지 않고 오류로 표시한 뒤 진행을 차단한다).
export const countFreeTextLength = text =>
  typeof text === 'string' ? Array.from(text.trim()).length : 0;

export const FREE_TEXT_STATUS = {
  UNANSWERED: 'unanswered',
  VALID: 'valid',
  SKIPPED: 'skipped',
  BLANK: 'blank',
  TOO_LONG: 'too_long',
  UNSYNCED: 'unsynced',
};

const FREE_TEXT_MESSAGES = {
  [FREE_TEXT_STATUS.BLANK]: '공백만 입력한 답변은 사용할 수 없어요.',
  [FREE_TEXT_STATUS.TOO_LONG]: `${MAX_FREE_TEXT_LENGTH}자 이하로 입력해주세요.`,
  [FREE_TEXT_STATUS.UNSYNCED]:
    '입력한 내용이 아직 답변으로 저장되지 않았어요. 내용을 확인해주세요.',
};

// 화면 입력값(localText)과 컨트롤러에 저장된 답변(answer)을 비교해 진행 가능 여부를 판정한다.
// 입력값이 유효하지 않은데 컨트롤러에 이전 유효 답변이 남아 있어도 canProceed는 false가 되어,
// 그 이전 답변이 사용자 모르게 이동/제출에 쓰이지 않는다.
export const getFreeTextInputState = ({ localText, answer }) => {
  const text = typeof localText === 'string' ? localText : '';
  const count = countFreeTextLength(text);
  const result = (status, canProceed) => ({
    status,
    canProceed,
    count,
    message: FREE_TEXT_MESSAGES[status] ?? null,
  });
  const answerText = answer?.answerText;
  const hasAnswerText = answerText !== undefined && answerText !== null;

  if (text === '') {
    if (!answer) return result(FREE_TEXT_STATUS.UNANSWERED, false);
    // 명시적 건너뛰기({ answerCode: 'UNKNOWN' })만 입력이 비어 있어도 진행할 수 있다.
    return hasAnswerText
      ? result(FREE_TEXT_STATUS.UNSYNCED, false)
      : result(FREE_TEXT_STATUS.SKIPPED, true);
  }
  if (text.trim() === '') return result(FREE_TEXT_STATUS.BLANK, false);
  if (count > MAX_FREE_TEXT_LENGTH) return result(FREE_TEXT_STATUS.TOO_LONG, false);
  return answerText === text
    ? result(FREE_TEXT_STATUS.VALID, true)
    : result(FREE_TEXT_STATUS.UNSYNCED, false);
};

// 다음 이동/제출 가능 여부. 서술형 질문에서는 입력 판정이 통과해야 한다.
export const getNavigationGuard = ({ snapshot, localText }) => {
  const question = snapshot?.currentQuestion;
  if (snapshot?.status !== FLOW_STATUS.READY || !question) {
    return { canGoNext: false, canSubmit: false, blockedReason: 'NOT_READY', freeText: null };
  }

  let answered = snapshot.isCurrentAnswered;
  let freeText = null;
  if (question.freeText) {
    freeText = getFreeTextInputState({ localText, answer: snapshot.currentAnswer });
    answered = freeText.canProceed;
  }

  return {
    canGoNext: answered && !snapshot.isLast,
    canSubmit: answered && snapshot.isLast && snapshot.isComplete,
    blockedReason: answered ? null : (freeText?.status ?? 'NOT_ANSWERED'),
    freeText,
  };
};

// ── 비동기 안전 유틸 ─────────────────────────────────────────

// 연속 재시도 / 언마운트 / 사용자 변경 시 오래된 응답을 버리기 위한 토큰 발급기.
// begin(scope)은 이전에 발급한 모든 토큰을 무효화한다. 응답 도착 시 isCurrent(token)일 때만 반영한다.
export const createRequestGate = () => {
  let sequence = 0;
  let activeId = null;
  let activeScope = null;

  return {
    begin: scope => {
      sequence += 1;
      activeId = sequence;
      activeScope = scope;
      return Object.freeze({ id: sequence, scope });
    },
    isCurrent: token =>
      token !== null && token !== undefined && token.id === activeId && token.scope === activeScope,
    invalidate: () => {
      activeId = null;
    },
  };
};

// 완료 콜백을 한 번만 호출한다. dispose() 이후(언마운트/사용자 변경)에는 호출하지 않는다.
export const createOnceNotifier = callback => {
  let called = false;
  let disposed = false;
  return {
    notify: payload => {
      if (called || disposed) return false;
      called = true;
      callback?.(payload);
      return true;
    },
    dispose: () => {
      disposed = true;
    },
  };
};

// ── 서버 상태 조회 ───────────────────────────────────────────

const failure = error => ({ ok: false, errorType: getOnboardingErrorType(error) });

// 서버 온보딩 완료 상태(API-34). 실패하면 값을 만들지 않는다 → 이어하기 판단에 임의 boolean을 쓰지 않는다.
export const loadServerCompletion = async repository => {
  try {
    const progress = await repository.loadProgress();
    return { ok: true, serverCompleted: progress.isCompleted === true };
  } catch (error) {
    return failure(error);
  }
};

export const RESUME_STATUS = {
  CHECKING: 'checking',
  ERROR: 'error',
  ALLOWED: 'allowed',
  CONFLICT: 'conflict',
};

// mode가 다른 Draft를 이어서 해도 되는지. Flow.resumeDraft의 규칙과 같다(서버 상태를 모르면 차단).
export const getResumeAvailability = ({ draftMode, completion }) => {
  if (!completion) {
    return { status: RESUME_STATUS.CHECKING, message: '서버 상태를 확인하고 있어요.' };
  }
  if (!completion.ok) {
    return {
      status: RESUME_STATUS.ERROR,
      message: '서버 상태를 확인하지 못해 이어하기를 할 수 없어요. 다시 확인해주세요.',
    };
  }
  const conflict =
    (draftMode === 'initial' && completion.serverCompleted) ||
    (draftMode === 'retake' && !completion.serverCompleted);
  return conflict
    ? {
        status: RESUME_STATUS.CONFLICT,
        message: '저장된 진행 방식이 현재 서버 상태와 맞지 않아 이어할 수 없어요.',
      }
    : { status: RESUME_STATUS.ALLOWED, message: null };
};

export const RETAKE_START_REASON = {
  LOAD_FAILED: 'LOAD_FAILED',
  NO_SERVER_ANSWERS: 'NO_SERVER_ANSWERS',
  INCOMPLETE_SERVER_ANSWERS: 'INCOMPLETE_SERVER_ANSWERS',
};

// 재검사 초기 답변(API-33). 조회 실패/빈 응답/10개 미만이면 시작할 수 없다 — 빈 답변으로 대체하지 않는다.
export const loadRetakeInitialAnswers = async repository => {
  let serverAnswers;
  try {
    serverAnswers = await repository.loadAnswers();
  } catch (error) {
    return { ...failure(error), reason: RETAKE_START_REASON.LOAD_FAILED };
  }
  if (serverAnswers.length === 0) {
    return { ok: false, reason: RETAKE_START_REASON.NO_SERVER_ANSWERS };
  }
  if (serverAnswers.length < MAX_QUESTION_NO) {
    return { ok: false, reason: RETAKE_START_REASON.INCOMPLETE_SERVER_ANSWERS };
  }
  return { ok: true, answers: answersFromServerAnswers(serverAnswers) };
};

// ── 제출 ─────────────────────────────────────────────────────

// 검증(prepareSubmission) → Repository.submitAnswers → 성공 확인 후에만 Draft 정리.
// 자동 재제출 없음: 재시도는 사용자가 다시 호출한다. 실패/불확실 경로에서는 Draft를 건드리지 않는다.
// Draft 정리 실패는 서버 저장 실패가 아니므로 completed + draftCleanup:'failed'로 구분해 돌려준다.
export const runSubmission = async ({ actions, repository, imageKeys, random }) => {
  const prepared = actions.prepareSubmission();
  if (!prepared.ok) {
    return { state: SUBMIT_STATE.SUBMIT_ERROR, reason: 'INVALID_ANSWERS', issue: prepared.issue };
  }

  await actions.flushDraft(); // 대기 중인 Draft 저장이 끝난 뒤에 제출(정리 순서 보장)

  let saved;
  try {
    saved = await repository.submitAnswers(prepared.payload, { questions: prepared.questions });
  } catch (error) {
    if (error instanceof WorkOnboardingSubmitError) {
      if (error.kind === SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED) {
        return {
          state: SUBMIT_STATE.SAVE_UNCONFIRMED,
          unconfirmedReason: error.reason,
          retryPayload: error.retryPayload,
        };
      }
      if (error.kind === SUBMIT_ERROR_KIND.IN_PROGRESS) return { state: 'in_progress' };
      return { state: SUBMIT_STATE.SUBMIT_ERROR, reason: error.kind };
    }
    if (error instanceof OnboardingRequestError) {
      return { state: SUBMIT_STATE.SUBMIT_ERROR, reason: 'INVALID_REQUEST' };
    }
    return {
      state: SUBMIT_STATE.SUBMIT_ERROR,
      reason: 'REQUEST_FAILED',
      errorType: getOnboardingErrorType(error),
    };
  }

  let draftCleanup = 'cleared';
  try {
    await repository.draft.clear();
  } catch {
    draftCleanup = 'failed';
  }

  // 서버 저장이 확인된 경우에만 새 장식 이미지를 뽑아 저장한다(최초/재검사 공통). 저장 실패는 제출 성공을
  // 바꾸지 않으며 기존 이미지가 그대로 남는다. 완료 콜백 전에 끝나므로 결과 화면은 저장된 값을 읽는다.
  let imageSaved = null;
  if (repository.profileImage && Array.isArray(imageKeys) && imageKeys.length > 0) {
    try {
      await repository.profileImage.assignNew(imageKeys, random);
      imageSaved = 'saved';
    } catch {
      imageSaved = 'failed';
    }
  }
  return {
    state: SUBMIT_STATE.COMPLETED,
    confirmedBy: saved.confirmedBy,
    draftCleanup,
    ...(imageSaved ? { imageSaved } : {}),
  };
};

// ── 결과 ─────────────────────────────────────────────────────

export const RESULT_STATUS = {
  READY: 'ready',
  NOT_COMPLETED: 'not_completed',
  EMPTY: 'empty',
  ERROR: 'error',
};

const nonBlank = value => (typeof value === 'string' && value.trim() !== '' ? value : null);

// API-35 프로필 + API-33 답변 → 표시용 데이터. 서버가 주지 않은 값(점수/타입/이미지)은 만들지 않는다.
export const buildResultViewModel = (profile, answers) => ({
  isCompleted: profile.isCompleted === true,
  answeredCount: profile.answeredCount,
  title: nonBlank(profile.cardTitle),
  summaryLines:
    typeof profile.cardSummary === 'string'
      ? profile.cardSummary
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
      : [],
  answers: [...answers]
    .sort((a, b) => a.questionNo - b.questionNo)
    .map(answer => {
      const isFreeText = answer.questionNo === FREE_TEXT_QUESTION_NO;
      return {
        questionNo: answer.questionNo,
        isFreeText,
        text:
          (isFreeText ? nonBlank(answer.answerText) : null) ??
          nonBlank(answer.answerLabel) ??
          answer.answerCode,
      };
    }),
});

// 결과 조회. 404(프로필 없음)는 오류가 아니라 "서버 결과 없음"이다(답변도 비어 있을 때만).
export const loadResultData = async repository => {
  const [profileResult, answersResult] = await Promise.allSettled([
    repository.loadProfile(),
    repository.loadAnswers(),
  ]);

  if (answersResult.status === 'rejected') {
    return { status: RESULT_STATUS.ERROR, errorType: getOnboardingErrorType(answersResult.reason) };
  }
  const answers = answersResult.value;

  if (profileResult.status === 'rejected') {
    const errorType = getOnboardingErrorType(profileResult.reason);
    if (errorType === ONBOARDING_ERROR_TYPE.NOT_FOUND && answers.length === 0) {
      return { status: RESULT_STATUS.EMPTY };
    }
    // 답변은 있는데 프로필이 없는 경우 등 서로 맞지 않는 응답은 임의로 해석하지 않는다.
    return { status: RESULT_STATUS.ERROR, errorType };
  }

  const profile = profileResult.value;
  if (!profile.isCompleted) {
    return {
      status: RESULT_STATUS.NOT_COMPLETED,
      view: buildResultViewModel(profile, answers),
    };
  }
  if (answers.length === 0) {
    return { status: RESULT_STATUS.ERROR, errorType: ONBOARDING_ERROR_TYPE.INVALID_RESPONSE };
  }
  return { status: RESULT_STATUS.READY, view: buildResultViewModel(profile, answers) };
};

// 결과 화면 버튼: 서버 조회 결과로만 결정한다(온보딩 상태를 추정하지 않음).
// 서버 결과가 없으면 시작만, 완료된 결과가 있을 때만 재검사를 보여준다.
export const getResultActions = status => {
  switch (status) {
    case RESULT_STATUS.READY:
      return { showStart: false, showRetake: true, showHome: true };
    case RESULT_STATUS.EMPTY:
      return { showStart: true, showRetake: false, showHome: false };
    case RESULT_STATUS.NOT_COMPLETED:
      return { showStart: true, showRetake: false, showHome: true };
    default:
      return { showStart: false, showRetake: false, showHome: false };
  }
};

// 장식용 무작위 선택은 이미지 저장소 모듈에 있다(서버 결과와 무관). 기존 import 경로 호환을 위해 다시 내보낸다.
export { pickRandomItem };

// 결과 화면 장식 이미지. 서버 완료 상태(API-34)로 새로 뽑지 않는다(재검사 중에도 서버는 이미 완료 상태).
// - READY(완료): 저장된 값이 있으면 그대로, 없을 때만 1회 뽑아 저장(ensure)
// - 그 밖의 상태: 선택·저장하지 않는다
// - 저장소 읽기/쓰기 실패: 임의 랜덤으로 대체하지 않고 imageKey: null(중립 장면)
export const loadProfileImageKey = async ({ repository, status, imageKeys, random }) => {
  if (status !== RESULT_STATUS.READY) return { imageKey: null };
  try {
    const stored = await repository.profileImage.load(imageKeys);
    if (stored !== null) return { imageKey: stored };
    return { imageKey: await repository.profileImage.ensure(imageKeys, random) };
  } catch {
    return { imageKey: null, failed: true };
  }
};

// ── 사용자 문구 (서버 원문·토큰·ID 노출 없음) ────────────────

const ERROR_TYPE_MESSAGES = {
  [ONBOARDING_ERROR_TYPE.NETWORK]: '네트워크 연결을 확인해주세요.',
  [ONBOARDING_ERROR_TYPE.TIMEOUT]: '서버 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.',
  [ONBOARDING_ERROR_TYPE.SERVER]: '서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.',
  [ONBOARDING_ERROR_TYPE.UNAUTHORIZED]: '로그인 정보를 확인할 수 없어요. 다시 로그인해주세요.',
  [ONBOARDING_ERROR_TYPE.FORBIDDEN]: '이 정보에 접근할 수 없어요.',
  [ONBOARDING_ERROR_TYPE.INVALID_RESPONSE]:
    '서버 응답을 해석할 수 없어요. 잠시 후 다시 시도해주세요.',
  [ONBOARDING_ERROR_TYPE.CONFIG]: '서버 연결 설정이 아직 준비되지 않았어요.',
};

export const describeErrorType = errorType =>
  ERROR_TYPE_MESSAGES[errorType] ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';

export const describeQuestionsError = flowSnapshot =>
  flowSnapshot?.status === FLOW_STATUS.QUESTIONS_INVALID
    ? '서버에서 받은 질문 정보가 올바르지 않아요. 잠시 후 다시 시도해주세요.'
    : flowSnapshot?.status === FLOW_STATUS.DRAFT_ERROR
      ? '이 기기에 저장된 작성 내용을 읽지 못했어요. 저장된 내용은 삭제되지 않았어요.'
      : describeErrorType(flowSnapshot?.error?.type);

const DRAFT_ISSUE_MESSAGES = {
  [DRAFT_ISSUE.UNKNOWN_QUESTION]: '저장된 답변의 질문이 현재 질문 목록에 없어요.',
  [DRAFT_ISSUE.CODE_NOT_IN_OPTIONS]: '저장된 답변이 현재 선택지에 없어요.',
  [DRAFT_ISSUE.TYPE_CHANGED_TO_FREE_TEXT]: '선택형이던 질문이 서술형으로 바뀌었어요.',
  [DRAFT_ISSUE.TYPE_CHANGED_TO_CHOICE]: '서술형이던 질문이 선택형으로 바뀌었어요.',
  [DRAFT_ISSUE.TEXT_TOO_LONG]: `저장된 서술 답변이 ${MAX_FREE_TEXT_LENGTH}자를 넘어요.`,
  [DRAFT_ISSUE.INDEX_OUT_OF_RANGE]: '저장된 질문 위치가 현재 질문 수를 벗어났어요.',
};

// 같은 유형은 한 번만 안내한다.
export const describeDraftIssues = (issues = []) => [
  ...new Set(issues.map(issue => DRAFT_ISSUE_MESSAGES[issue.type]).filter(Boolean)),
];

const MODE_LABELS = { initial: '처음 온보딩', retake: '재검사' };
export const describeMode = mode => MODE_LABELS[mode] ?? '알 수 없음';

export const describeSubmitFailure = result => {
  if (result.state === SUBMIT_STATE.SAVE_UNCONFIRMED) {
    return '서버에 저장되었는지 확인하지 못했어요. 작성한 내용은 이 기기에 남아 있어요. 다시 시도하면 같은 내용으로 확인해요.';
  }
  switch (result.reason) {
    case 'INVALID_ANSWERS':
    case 'INVALID_REQUEST':
      return '답변을 다시 확인해주세요. 비어 있거나 올바르지 않은 답변이 있어요.';
    case SUBMIT_ERROR_KIND.NOT_COMPLETED:
      return '서버가 저장 완료로 응답하지 않았어요. 다시 시도해주세요.';
    default:
      return `저장하지 못했어요. ${describeErrorType(result.errorType)}`;
  }
};

export const describeAnswerReject = reason => {
  if (reason === ANSWER_REJECT_REASON.DRAFT_CLEAR_FAILED) {
    return '저장된 내용을 지우지 못해 새로 시작할 수 없어요. 저장된 내용은 그대로예요.';
  }
  return '요청을 처리하지 못했어요.';
};
