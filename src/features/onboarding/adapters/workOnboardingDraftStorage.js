// 서버 온보딩 전용 로컬 Draft(진행 중 답변) 저장소.
// 키: @financialOnboarding:draftServer:v1:{userId}  — 사용자(userId)별로 분리된다.
//
// 기존 로컬 온보딩 저장소(@financialOnboarding:draft:v1:* / result:v1:*)와는 키가 달라 서로 영향을 주지 않으며,
// 이 모듈은 기존 키를 읽지도 쓰지도 지우지도 않는다.
// Draft 삭제(clear)는 서버 저장 성공이 확인된 뒤 상위 흐름이 직접 호출한다. Repository의 제출 로직은
// 성공/실패/불확실 어느 경우에도 Draft를 건드리지 않는다.
//
// Draft 형태: { mode: 'initial' | 'retake', currentIndex, answers }
//   answers: { [questionNo]: { answerCode, answerText? } }  (서버 question_no / answer_code 기준)
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_QUESTION_NO,
  MIN_QUESTION_NO,
  OnboardingRequestError,
  ONBOARDING_REQUEST_ERROR,
  isValidOnboardingUserId,
} from '../onboardingApi';

export const WORK_ONBOARDING_DRAFT_VERSION = 1;

export const workOnboardingDraftKey = userId =>
  `@financialOnboarding:draftServer:v${WORK_ONBOARDING_DRAFT_VERSION}:${userId}`;

const MODES = ['initial', 'retake'];

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// 구조가 맞으면 정규화된 복사본을, 아니면 null을 돌려준다(저장/조회 공통 검증).
const normalizeDraft = draft => {
  if (!isPlainObject(draft)) return null;
  if (!MODES.includes(draft.mode)) return null;
  if (!Number.isInteger(draft.currentIndex) || draft.currentIndex < 0) return null;
  if (!isPlainObject(draft.answers)) return null;

  const answers = {};
  for (const [key, value] of Object.entries(draft.answers)) {
    const questionNo = Number(key);
    if (
      !/^[0-9]+$/.test(key) ||
      !Number.isInteger(questionNo) ||
      questionNo < MIN_QUESTION_NO ||
      questionNo > MAX_QUESTION_NO ||
      !isPlainObject(value) ||
      typeof value.answerCode !== 'string' ||
      value.answerCode === ''
    ) {
      return null;
    }

    const answer = { answerCode: value.answerCode };
    if (value.answerText !== undefined && value.answerText !== null) {
      if (typeof value.answerText !== 'string') return null;
      answer.answerText = value.answerText;
    }
    answers[String(questionNo)] = answer;
  }

  return { mode: draft.mode, currentIndex: draft.currentIndex, answers };
};

const requireUserId = userId => {
  if (!isValidOnboardingUserId(userId)) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_USER_ID,
      'user_id는 숫자로만 이루어진 문자열이어야 합니다.'
    );
  }
  return userId;
};

// userId별 작업 큐. 같은 사용자의 save/clear/load를 호출 순서대로 직렬화해 늦게 끝난 쓰기가
// 이전 상태로 덮어쓰는 경쟁을 막는다. 한 작업이 실패해도 이후 작업은 막지 않는다.
const storageCache = new Map();

export function getWorkOnboardingDraftStorage(userId) {
  requireUserId(userId);
  if (storageCache.has(userId)) return storageCache.get(userId);

  const key = workOnboardingDraftKey(userId);
  let queueTail = Promise.resolve();

  const enqueue = task => {
    const run = queueTail.then(task, task);
    queueTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const storage = {
    key,

    // 저장된 Draft 또는 null. 저장 값이 손상/형식 불일치면 null을 돌려주되 삭제하지 않는다.
    // AsyncStorage 읽기 자체가 실패하면 그 오류를 그대로 전달한다.
    load: () =>
      enqueue(async () => {
        const raw = await AsyncStorage.getItem(key);
        if (raw === null || raw === undefined) return null;

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return null;
        }
        if (parsed?.version !== WORK_ONBOARDING_DRAFT_VERSION) return null;

        const draft = normalizeDraft(parsed);
        if (!draft) return null;
        return {
          ...draft,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        };
      }),

    save: draft =>
      enqueue(async () => {
        const normalized = normalizeDraft(draft);
        if (!normalized) {
          throw new OnboardingRequestError(
            ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS,
            'Draft 형식이 올바르지 않습니다.'
          );
        }
        const payload = {
          version: WORK_ONBOARDING_DRAFT_VERSION,
          ...normalized,
          updatedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(key, JSON.stringify(payload));
        return { ...normalized, updatedAt: payload.updatedAt };
      }),

    // 이 사용자의 서버 온보딩 Draft 키만 삭제한다.
    clear: () => enqueue(() => AsyncStorage.removeItem(key)),
  };

  storageCache.set(userId, storage);
  return storage;
}
