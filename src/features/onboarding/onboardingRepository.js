// 재무 온보딩 화면이 의존하는 유일한 저장/제출 경계.
//
// Repository 계약 — 나중에 실제 Work API 어댑터로 교체할 때도 이 함수 시그니처는 유지한다.
//   loadDraft(): Promise<{ currentIndex, answers, mode, updatedAt } | null>
//   saveDraft(draft: { currentIndex, answers, mode }): Promise<void>
//   clearDraft(): Promise<void>
//   submitResult(answers): Promise<{ answers, updatedAt }>   // 실패 시 reject — 화면이 재시도 UI를 보여줄 근거
//   loadResult(): Promise<{ answers, updatedAt } | null>
//   clearResult(): Promise<void>
//   clearAll(): Promise<void>
//
// 현재는 Work 답변 저장 API 계약이 확정되지 않아, 로그인한 사용자 id 기준 로컬(AsyncStorage) 저장소를
// 임시로 사용한다. 화면은 이 함수만 호출하고, 나중에 API 어댑터가 준비되면 아래 구현만 교체하면 된다.
import { getLocalUserOnboardingRepository } from './adapters/localUserOnboardingRepository';

export function getOnboardingRepository(userId) {
  return getLocalUserOnboardingRepository(userId);
}
