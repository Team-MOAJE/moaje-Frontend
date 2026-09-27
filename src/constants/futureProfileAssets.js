// imageKey → Hero 일러스트 "장면" 소스(production 에셋: assets/future-profile/*.png).
// 이미지는 원본 비율 그대로 Hero 폭에 맞춰 배치되며 특정 비율을 강제하지 않는다.
// design-reference/ 이미지는 사용 금지.
export const FUTURE_PROFILE_IMAGES = {
  fulfillment: require('../../assets/future-profile/fulfillment.png'),
  goalDriven: require('../../assets/future-profile/goal-driven.png'),
  steadySaver: require('../../assets/future-profile/steady-saver.png'),
  growthLearner: require('../../assets/future-profile/growth-learner.png'),
  carefulPlanner: require('../../assets/future-profile/careful-planner.png'),
  freedomExplorer: require('../../assets/future-profile/freedom-explorer.png'),
};

// Hero 이미지 표시 설정(FutureProfileScene이 적용). 이미지는 폭 기준 원본 비율로 명시 크기 배치된다.
// - resizeMode: 기본 contain(캐릭터가 잘리지 않음)
// - scale: 1.0이 원본 전체(확대/crop 없음). 타입별 미세 조정이 필요할 때만 조금 바꾼다.
// - offsetX/offsetY: 이미지 폭 대비 비율(0.02 = 폭의 2%). 타입별로 구도가 어긋날 때만 조정.
export const FUTURE_PROFILE_IMAGE_DEFAULT_ADJUST = {
  resizeMode: 'contain',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};
export const FUTURE_PROFILE_IMAGE_ADJUST = {
  fulfillment: {},
  goalDriven: {},
  steadySaver: {},
  growthLearner: {},
  carefulPlanner: {},
  freedomExplorer: {},
};
