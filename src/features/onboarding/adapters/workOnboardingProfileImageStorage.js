// 서버 온보딩 결과 화면의 장식용 Future Profile 이미지 선택을 사용자별로 저장한다.
// 키: @financialOnboarding:profileImage:v1:{userId}  — 사용자(userId)별로 분리된다.
//
// 이미지 선택은 서버 프로필 결과와 무관하다(점수·유형 분류 없음). 기존 로컬 온보딩 키와 서버 Draft 키는
// 읽지도 쓰지도 지우지도 않으며, 이 모듈은 AsyncStorage.removeItem을 사용하지 않는다.
//
// 값 형태: { version: 1, imageKey, savedAt }
// - load: 저장된 imageKey 또는 null(손상/미지원 값은 null, 삭제하지 않음)
// - assignNew: 새로 뽑아 저장한다. 저장이 성공한 뒤에만 새 값을 돌려주며, 실패하면 기존 값이 그대로 남는다.
// - ensure: 저장된 값이 없을 때만 한 번 뽑아 저장한다. 기존 값은 절대 덮어쓰지 않는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OnboardingRequestError,
  ONBOARDING_REQUEST_ERROR,
  isValidOnboardingUserId,
} from '../onboardingApi';

export const WORK_PROFILE_IMAGE_VERSION = 1;

export const workProfileImageKey = userId =>
  `@financialOnboarding:profileImage:v${WORK_PROFILE_IMAGE_VERSION}:${userId}`;

// 장식용 무작위 선택. random이 1에 가까워도 범위를 벗어나지 않는다. 항목이 없으면 null.
export const pickRandomItem = (items, random = Math.random) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const index = Math.min(Math.floor(random() * items.length), items.length - 1);
  return items[Math.max(index, 0)];
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

const parseStored = (raw, validKeys) => {
  if (raw === null || raw === undefined) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.version !== WORK_PROFILE_IMAGE_VERSION) return null;
  if (typeof parsed.imageKey !== 'string' || !validKeys.includes(parsed.imageKey)) return null;
  return parsed.imageKey;
};

const requireKeys = keys => {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new OnboardingRequestError(
      ONBOARDING_REQUEST_ERROR.INVALID_ANSWERS,
      '선택할 이미지 목록이 비어 있습니다.'
    );
  }
  return keys;
};

// userId별 작업 큐: 같은 사용자의 load/assignNew/ensure를 호출 순서대로 직렬화한다.
const storageCache = new Map();

export function getWorkOnboardingProfileImageStorage(userId) {
  requireUserId(userId);
  if (storageCache.has(userId)) return storageCache.get(userId);

  const key = workProfileImageKey(userId);
  let queueTail = Promise.resolve();

  const enqueue = task => {
    const run = queueTail.then(task, task);
    queueTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  const write = async imageKey => {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        version: WORK_PROFILE_IMAGE_VERSION,
        imageKey,
        savedAt: new Date().toISOString(),
      })
    );
    return imageKey;
  };

  const storage = {
    key,

    load: validKeys =>
      enqueue(async () => parseStored(await AsyncStorage.getItem(key), requireKeys(validKeys))),

    assignNew: (validKeys, random = Math.random) =>
      enqueue(() => write(pickRandomItem(requireKeys(validKeys), random))),

    ensure: (validKeys, random = Math.random) =>
      enqueue(async () => {
        const existing = parseStored(await AsyncStorage.getItem(key), requireKeys(validKeys));
        if (existing !== null) return existing;
        return write(pickRandomItem(validKeys, random));
      }),
  };

  storageCache.set(userId, storage);
  return storage;
}
