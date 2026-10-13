// 서버(Work) 재무 온보딩 Repository. onboardingApi.js(API-30~35)를 재사용하며 HTTP 코드를 중복 구현하지 않는다.
// 아직 앱 흐름에 연결되어 있지 않다(기존 onboardingRepository.js / 화면 / MainNavigator는 그대로).
//
// 제출(API-31) 규칙
// 1. 보내기 전에 10개 문항(1~10)이 정확히 한 번씩 모두 있는지 검증한다. 잘못된 요청은 서버로 보내지 않는다.
// 2. 응답을 받았고 is_completed === true일 때만 저장 성공(confirmedBy: 'RESPONSE')으로 본다.
// 3. 네트워크 오류·타임아웃·5xx·형식 오류처럼 서버 반영 여부를 알 수 없는 경우에는 성공/실패를 단정하지 않고
//    API-34(진행 상태) → API-33(저장된 답변)으로 재확인한다. 이미 온보딩을 끝낸 사용자는 이전 답변 10개가
//    서버에 있을 수 있으므로 is_completed만으로는 이번 제출의 성공을 판단하지 않는다. API-33의
//    question_no / answer_code / answer_text(Q9 포함)가 제출한 10개와 모두 일치할 때만 성공
//    (confirmedBy: 'RECONCILE')이다. 불일치하거나 확인 호출이 실패하면 SAVE_UNCONFIRMED 오류를 던진다.
// 4. 이 모듈은 절대 자동으로 재제출하지 않는다. 오류에 담긴 retryPayload(동일 payload)를 호출부가 사용자 동작으로
//    다시 submitAnswers()에 넘길 수 있다. 서버는 (user_id, question_no) upsert라 같은 payload 재전송은 안전하다.
// 5. 제출은 로컬 Draft를 건드리지 않는다. Draft 삭제는 성공이 확인된 뒤 상위 흐름이 repository.draft.clear()로 한다.
//    재검사도 제출 전에는 서버에 아무것도 보내지 않으므로 기존 서버 답변은 제출 성공 전까지 그대로다.
import {
  MAX_QUESTION_NO,
  MIN_QUESTION_NO,
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
  submitOnboardingAnswers,
} from '../onboardingApi';
import { getWorkOnboardingDraftStorage } from './workOnboardingDraftStorage';
import { getWorkOnboardingProfileImageStorage } from './workOnboardingProfileImageStorage';

export const SUBMIT_ERROR_KIND = {
  NOT_COMPLETED: 'NOT_COMPLETED', // 응답은 받았지만 is_completed가 true가 아님
  SAVE_UNCONFIRMED: 'SAVE_UNCONFIRMED', // 저장 여부를 확인할 수 없음
  IN_PROGRESS: 'IN_PROGRESS', // 같은 Repository에서 이미 제출이 진행 중
};

export const UNCONFIRMED_REASON = {
  CHECK_FAILED: 'CHECK_FAILED', // API-34/33 재확인 호출 자체가 실패
  NOT_COMPLETED: 'NOT_COMPLETED', // 재확인 결과 서버가 아직 완료 상태가 아님
  MISMATCH: 'MISMATCH', // 서버 답변이 이번 제출과 다름
};

export const SUBMIT_CONFIRMED_BY = {
  RESPONSE: 'RESPONSE',
  RECONCILE: 'RECONCILE',
};

export class WorkOnboardingSubmitError extends Error {
  constructor(kind, message, fields = {}) {
    super(message);
    this.name = 'WorkOnboardingSubmitError';
    this.kind = kind;
    Object.assign(this, fields);
  }
}

// 응답을 받지 못했거나 해석하지 못해 서버 반영 여부를 알 수 없는 오류 종류.
// (4xx는 서버가 요청을 거부한 것이므로 반영되지 않은 확정 실패로 보고 원래 오류를 그대로 던진다.)
const UNCERTAIN_ERROR_TYPES = new Set([
  ONBOARDING_ERROR_TYPE.NETWORK,
  ONBOARDING_ERROR_TYPE.TIMEOUT,
  ONBOARDING_ERROR_TYPE.SERVER,
  ONBOARDING_ERROR_TYPE.INVALID_RESPONSE,
]);

const invalidAnswers = where =>
  new OnboardingRequestError(
    ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS,
    `답변 형식이 올바르지 않습니다. (${where})`
  );

const hasText = answer => answer.answerText !== undefined && answer.answerText !== null;

// 제출 payload 정규화: questionNo 오름차순, answerText는 값이 있을 때만 포함, 변경 불가(freeze)한 복사본.
// 문항 1~10이 정확히 한 번씩 있어야 한다. questions(API-30 결과)를 주면 코드도 서버 선택지로 검증한다.
export const buildSubmitPayload = (userId, answers, questions) => {
  if (!Array.isArray(answers) || answers.length !== MAX_QUESTION_NO) {
    throw invalidAnswers('answers');
  }

  const payload = answers
    .map(answer =>
      Object.freeze({
        questionNo: answer?.questionNo,
        answerCode: answer?.answerCode,
        ...(answer && hasText(answer) ? { answerText: answer.answerText } : {}),
      })
    )
    .sort((a, b) => a.questionNo - b.questionNo);

  // 구조·타입·중복 검증은 API 레이어와 동일 규칙을 재사용한다(결과 본문은 버린다).
  buildBulkAnswersRequestBody(userId, payload);

  for (let questionNo = MIN_QUESTION_NO; questionNo <= MAX_QUESTION_NO; questionNo += 1) {
    if (payload[questionNo - 1].questionNo !== questionNo) {
      throw invalidAnswers(`문항 ${questionNo} 누락`);
    }
  }

  if (questions !== undefined) {
    if (!Array.isArray(questions)) throw invalidAnswers('questions');
    const byNo = new Map(questions.map(question => [question.questionNo, question]));

    for (const answer of payload) {
      const question = byNo.get(answer.questionNo);
      if (!question) throw invalidAnswers(`questions[${answer.questionNo}]`);

      if (question.freeText) {
        // 서술형(Q9): 서버 스모크 방식 UNKNOWN + answer_text 만 사용한다. 새 코드를 만들지 않는다.
        if (answer.answerCode !== UNKNOWN_ANSWER_CODE) {
          throw invalidAnswers(`문항 ${answer.questionNo} answerCode`);
        }
      } else {
        const allowed =
          answer.answerCode === UNKNOWN_ANSWER_CODE ||
          question.options.some(option => option.code === answer.answerCode);
        if (!allowed) throw invalidAnswers(`문항 ${answer.questionNo} answerCode`);
        if (hasText(answer)) throw invalidAnswers(`문항 ${answer.questionNo} answerText`);
      }
    }
  }

  return Object.freeze(payload);
};

// API-33 결과가 제출한 payload와 정확히 일치하는지 비교한다(question_no, answer_code, answer_text; Q9 본문 포함).
// 서버 답변이 정확히 같은 문항 집합이어야 한다. 선택형의 answer_text는 null, 제출 쪽에 없으면 null로 본다.
export const answersMatchPayload = (payload, serverAnswers) => {
  if (!Array.isArray(serverAnswers) || serverAnswers.length !== payload.length) return false;

  const byNo = new Map(serverAnswers.map(answer => [answer.questionNo, answer]));
  if (byNo.size !== payload.length) return false;

  return payload.every(expected => {
    const actual = byNo.get(expected.questionNo);
    return (
      actual !== undefined &&
      actual.answerCode === expected.answerCode &&
      (actual.answerText ?? null) === (expected.answerText ?? null)
    );
  });
};

export function createWorkOnboardingRepository(userId) {
  if (!isValidOnboardingUserId(userId)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }

  const draft = getWorkOnboardingDraftStorage(userId);
  const profileImage = getWorkOnboardingProfileImageStorage(userId);
  let isSubmitting = false;

  const unconfirmed = (reason, payload, fields = {}) =>
    new WorkOnboardingSubmitError(
      SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED,
      '서버에 저장되었는지 확인할 수 없습니다.',
      { reason, retryPayload: payload, ...fields }
    );

  // 응답을 못 받은 제출의 서버 상태 확인: API-34 → API-33 비교. 자동 재제출은 하지 않는다.
  const reconcile = async (payload, submitError) => {
    const submitErrorType = getOnboardingErrorType(submitError);

    let progress;
    try {
      progress = await fetchOnboardingProgress(userId);
    } catch (checkError) {
      throw unconfirmed(UNCONFIRMED_REASON.CHECK_FAILED, payload, {
        submitErrorType,
        checkErrorType: getOnboardingErrorType(checkError),
        cause: submitError,
      });
    }

    if (!progress.isCompleted) {
      throw unconfirmed(UNCONFIRMED_REASON.NOT_COMPLETED, payload, {
        submitErrorType,
        progress,
        cause: submitError,
      });
    }

    let serverAnswers;
    try {
      serverAnswers = await fetchOnboardingAnswers(userId);
    } catch (checkError) {
      throw unconfirmed(UNCONFIRMED_REASON.CHECK_FAILED, payload, {
        submitErrorType,
        checkErrorType: getOnboardingErrorType(checkError),
        cause: submitError,
      });
    }

    // 완료 상태만으로는 부족하다(이전 응답 10개일 수 있음) → 제출 내용과 일치할 때만 성공.
    if (!answersMatchPayload(payload, serverAnswers)) {
      throw unconfirmed(UNCONFIRMED_REASON.MISMATCH, payload, { submitErrorType, progress });
    }

    return { status: 'SAVED', confirmedBy: SUBMIT_CONFIRMED_BY.RECONCILE, progress, payload };
  };

  return {
    userId,
    draft,
    profileImage, // 결과 화면 장식 이미지 선택 저장소(제출 로직과 무관)

    // API-30
    loadQuestions: () => fetchOnboardingQuestions(),
    // API-33
    loadAnswers: () => fetchOnboardingAnswers(userId),
    // API-34
    loadProgress: () => fetchOnboardingProgress(userId),
    // API-35
    loadProfile: () => fetchFutureProfile(userId),

    // API-31. answers: [{ questionNo, answerCode, answerText? }] 정확히 10개.
    // 반환: { status: 'SAVED', confirmedBy, progress, payload }
    // 던지는 오류
    //  - OnboardingRequestError: 보내기 전 검증 실패(요청 없음)
    //  - WorkOnboardingSubmitError(IN_PROGRESS | NOT_COMPLETED | SAVE_UNCONFIRMED)
    //  - ApiError: 서버가 거부한 확정 실패(4xx 등). 서버에는 반영되지 않은 것으로 본다.
    submitAnswers: async (answers, { questions } = {}) => {
      const payload = buildSubmitPayload(userId, answers, questions);

      if (isSubmitting) {
        throw new WorkOnboardingSubmitError(
          SUBMIT_ERROR_KIND.IN_PROGRESS,
          '이미 제출이 진행 중입니다.'
        );
      }
      isSubmitting = true;

      try {
        let progress;
        try {
          progress = await submitOnboardingAnswers(userId, payload);
        } catch (error) {
          if (UNCERTAIN_ERROR_TYPES.has(getOnboardingErrorType(error))) {
            return await reconcile(payload, error);
          }
          throw error;
        }

        if (progress.isCompleted !== true) {
          throw new WorkOnboardingSubmitError(
            SUBMIT_ERROR_KIND.NOT_COMPLETED,
            '서버가 온보딩 완료로 응답하지 않았습니다.',
            { retryPayload: payload, progress }
          );
        }

        return { status: 'SAVED', confirmedBy: SUBMIT_CONFIRMED_BY.RESPONSE, progress, payload };
      } finally {
        isSubmitting = false;
      }
    },
  };
}

// userId별 인스턴스 캐시: 같은 사용자에 대해 제출 중복 방지 상태와 Draft 큐를 공유한다.
const repositoryCache = new Map();

export function getWorkOnboardingRepository(userId) {
  if (repositoryCache.has(userId)) return repositoryCache.get(userId);
  const repository = createWorkOnboardingRepository(userId);
  repositoryCache.set(userId, repository);
  return repository;
}
