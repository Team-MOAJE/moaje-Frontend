// 홈 '머니 타입' 탭 표시 로직(순수 모듈, React / Redux 비의존).
// 서버(API-35)가 준 card_title / card_summary만 머니 타입 제목·설명으로 쓴다. 태그·유형 코드·점수는 서버가
// 주지 않으므로 만들지 않는다. 요청은 기존 repository.loadProfile(API-35) 한 번뿐이며 자동 재시도는 없다.
import { ONBOARDING_ERROR_TYPE, getOnboardingErrorType } from './onboardingApi';
import { RESULT_STATUS, buildResultViewModel } from './workOnboardingScreenLogic';
import { resolveHomeMoneyTypeView } from './workOnboardingNavigation';

// API-35 조회. 404(프로필 없음)는 오류가 아니라 "서버 결과 없음"이다. 반환 형태
//  { status: READY, isCompleted, title, description } | { status: EMPTY } | { status: ERROR, errorType }
// 완료되지 않은 프로필은 { status: NOT_COMPLETED }로만 알리고 제목·설명은 넘기지 않는다.
export const loadHomeFutureProfile = async repository => {
  try {
    const profile = await repository.loadProfile();
    const view = buildResultViewModel(profile, []);
    if (!view.isCompleted) return { status: RESULT_STATUS.NOT_COMPLETED };
    return {
      status: RESULT_STATUS.READY,
      title: view.title,
      description: view.summaryLines.join('\n'),
    };
  } catch (error) {
    const errorType = getOnboardingErrorType(error);
    if (errorType === ONBOARDING_ERROR_TYPE.NOT_FOUND) return { status: RESULT_STATUS.EMPTY };
    return { status: RESULT_STATUS.ERROR, errorType };
  }
};

export const HOME_MONEY_TYPE_KIND = Object.freeze({
  LEGACY: 'legacy',
  LOADING: 'loading',
  ERROR: 'error',
  PROFILE: 'profile',
  GUIDE: 'guide',
});

// 머니 타입 탭이 그릴 내용을 정한다.
// - flag off: 기존 로컬 머니 타입(localProfile) 그대로
// - flag on : 서버 결과(profileState)만 사용. 로컬 결과와 섞지 않는다.
//   · 조회 전/진행 중 → loading, 오류 → error(재시도는 사용자 동작)
//   · 완료 + 제목 있음 → profile / 그 밖(결과 없음·미완료·제목 없음) → 기존 안내(결과 화면으로 이동)
// profileState는 { userId, ...loadHomeFutureProfile 결과 }이며 현재 사용자와 다르면 사용하지 않는다.
export const resolveHomeMoneyTypeTab = ({
  flagEnabled,
  userId,
  profileState,
  localProfile,
} = {}) => {
  const base = resolveHomeMoneyTypeView({ flagEnabled });
  if (base.kind !== 'server_guide') {
    return { kind: HOME_MONEY_TYPE_KIND.LEGACY, profile: localProfile ?? null };
  }
  const state = profileState && profileState.userId === userId ? profileState : null;
  if (!state) return { kind: HOME_MONEY_TYPE_KIND.LOADING };
  if (state.status === RESULT_STATUS.ERROR) {
    return { kind: HOME_MONEY_TYPE_KIND.ERROR, errorType: state.errorType };
  }
  if (state.status === RESULT_STATUS.READY && state.title !== null) {
    return {
      kind: HOME_MONEY_TYPE_KIND.PROFILE,
      profile: { title: state.title, description: state.description },
    };
  }
  return { kind: HOME_MONEY_TYPE_KIND.GUIDE, guide: base };
};

// 서버 프로필을 새로 요청해야 하는지: 현재 사용자의 결과가 없고 진행 중이 아닐 때만(오류 후 자동 재시도 없음).
export const shouldLoadHomeFutureProfile = ({ userId, profileState, loading } = {}) =>
  userId != null && !loading && profileState?.userId !== userId;
