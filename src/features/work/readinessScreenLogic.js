// 사회인 준비도 화면 로직 (API-36). React / react-native / Redux에 의존하지 않는 순수 모듈이다.
// 아직 어떤 화면에도 연결되어 있지 않다(UI는 후속 단계).
//
// 원칙
// - 준비도 수치·단계·문구는 서버가 계산한 값만 쓴다. percent/level을 다시 계산하거나 보정하지 않는다.
// - 요청이 실패하면 값을 만들지 않는다(가짜 0%·기본 문구 없음). 오류 종류만 돌려준다.
// - 서버는 조회할 때마다 지표를 기록하므로, 자동 재시도 없이 사용자의 명시적 동작으로만 다시 조회한다.
import { createRequestGate, describeErrorType } from '../onboarding/workOnboardingScreenLogic';
import { ASSET_SOURCE, READINESS_ERROR_TYPE, getReadinessErrorType } from './readinessApi';

export { createRequestGate };

export const READINESS_SCREEN_STATE = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

// 요청 중에는 다시 조회할 수 없다(연타로 서버 지표가 중복 기록되는 것을 막는다).
export const canRefresh = state => state !== READINESS_SCREEN_STATE.LOADING;

// 준비도 조회. fetcher는 fetchReadiness(userId) 형태의 함수를 주입한다(테스트/화면에서 교체).
// 반환: { ok: true, readiness } | { ok: false, canceled: true } | { ok: false, errorType }
// CANCELED(로그아웃·세션 교체로 요청이 취소됨)는 사용자에게 오류로 보이지 않도록 canceled로 구분한다.
export const loadReadiness = async (userId, { fetcher }) => {
  try {
    const readiness = await fetcher(userId);
    return { ok: true, readiness };
  } catch (error) {
    const errorType = getReadinessErrorType(error);
    if (errorType === READINESS_ERROR_TYPE.CANCELED) return { ok: false, canceled: true };
    return { ok: false, errorType };
  }
};

// ── 사용자 문구 (서버 원문·토큰·ID 노출 없음) ────────────────

export const describeReadinessError = errorType => describeErrorType(errorType);

// 자산 출처별 안내. 점수에는 영향을 주지 않는 설명 문구다.
// INPUT / ASSET_SERVICE / 알 수 없는 값은 별도 안내가 필요 없으므로 null.
const ASSET_SOURCE_NOTICES = {
  [ASSET_SOURCE.NOT_LINKED]: '연결된 계좌가 없어 현재 자산을 0원으로 보고 계산했어요.',
  [ASSET_SOURCE.UNAVAILABLE]:
    '지금은 자산 정보를 불러오지 못해 현재 자산을 0원으로 보고 계산했어요. 잠시 후 다시 확인해주세요.',
};

export const describeAssetSource = assetSource => ASSET_SOURCE_NOTICES[assetSource] ?? null;

// ── 표시 데이터 ──────────────────────────────────────────────

// 서버 응답을 화면용으로 옮긴다. 값은 그대로 두고 표시 보조 필드만 더한다.
// - isExcluded: 서버가 score를 null로 준 항목(데이터 부족으로 평가 제외). 0점과 구분한다.
// - scoreText: 'score / weight' (제외 항목은 null → 화면이 '평가 제외'로 표시)
export const buildReadinessViewModel = readiness => ({
  percent: readiness.percent,
  level: readiness.level,
  levelLabel: readiness.levelLabel,
  message: readiness.message,
  disclaimer: readiness.disclaimer,
  assetNotice: describeAssetSource(readiness.assetSource),
  items: readiness.items.map(item => ({
    key: item.key,
    label: item.label,
    detail: item.detail,
    weight: item.weight,
    score: item.score,
    isExcluded: item.score === null,
    scoreText: item.score === null ? null : `${item.score} / ${item.weight}`,
  })),
});
