// 실사용자(로그인 계정) 재무 온보딩 결과의 "임시" 로컬 저장소입니다.
// Work 답변 저장 API가 아직 없어(계약 미확정) 서버에는 저장되지 않고 기기 로컬(AsyncStorage)에만 남습니다.
// 나중에 실제 Work API가 확정되면 onboardingRepository.js의 재-export 대상만 API 어댑터로 교체합니다.
import AsyncStorage from '@react-native-async-storage/async-storage';

function draftKey(userId) {
  return `@financialOnboarding:draft:v1:${userId}`;
}

function resultKey(userId) {
  return `@financialOnboarding:result:v1:${userId}`;
}

async function readJson(key) {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

function writeDraft(userId, draft) {
  const payload = {
    currentIndex: draft.currentIndex,
    answers: draft.answers,
    mode: draft.mode,
    updatedAt: new Date().toISOString(),
  };
  return AsyncStorage.setItem(draftKey(userId), JSON.stringify(payload));
}

function removeDraft(userId) {
  return AsyncStorage.removeItem(draftKey(userId));
}

async function writeResult(userId, answers) {
  const payload = { answers, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(resultKey(userId), JSON.stringify(payload));
  return payload;
}

function removeResult(userId) {
  return AsyncStorage.removeItem(resultKey(userId));
}

// userId별 mutation 큐/repository 인스턴스 캐시.
// 같은 userId를 건드리는 모든 작업(save/clear/submit)을 호출 순서대로 직렬화해
// "나중 호출이 먼저 끝나 이전 상태로 덮어써지는" race condition을 막는다.
// 큐의 한 작업이 실패해도 이후 작업이 영구적으로 막히지 않도록 실패를 흡수한 뒤 이어간다.
const repositoryCache = new Map();

export function getLocalUserOnboardingRepository(userId) {
  if (repositoryCache.has(userId)) {
    return repositoryCache.get(userId);
  }

  let queueTail = Promise.resolve();

  function enqueueMutation(task) {
    const run = queueTail.then(task, task);
    queueTail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  const repository = {
    loadDraft: () => enqueueMutation(() => readJson(draftKey(userId))),
    saveDraft: draft => enqueueMutation(() => writeDraft(userId, draft)),
    clearDraft: () => enqueueMutation(() => removeDraft(userId)),
    submitResult: answers => enqueueMutation(() => writeResult(userId, answers)),
    loadResult: () => enqueueMutation(() => readJson(resultKey(userId))),
    clearResult: () => enqueueMutation(() => removeResult(userId)),
    clearAll: () => enqueueMutation(() => Promise.all([removeDraft(userId), removeResult(userId)])),
  };

  repositoryCache.set(userId, repository);
  return repository;
}
