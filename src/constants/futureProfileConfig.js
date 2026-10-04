// Future Profile 결과 화면의 provisional 카피/규칙 모음.
// 기획/백엔드 명세가 확정되면 이 파일(또는 buildFinancialOnboardingResultViewModel)만 교체한다.
// 임의 금융 점수/금액/확률은 만들지 않으며, 모든 결과는 선택한 답변 id에서 결정적으로 도출된다.

export const PROFILE_TYPES = {
  FULFILLMENT: 'FULFILLMENT',
  GOAL_DRIVEN: 'GOAL_DRIVEN',
  STEADY_SAVER: 'STEADY_SAVER',
  GROWTH_LEARNER: 'GROWTH_LEARNER',
  CAREFUL_PLANNER: 'CAREFUL_PLANNER',
  FREEDOM_EXPLORER: 'FREEDOM_EXPLORER',
};

// 동점 시 우선순위(앞선 type이 이긴다). 사양의 타입 표 순서를 그대로 사용하며 변경하지 않는다.
export const TIE_BREAK_ORDER = [
  PROFILE_TYPES.FULFILLMENT,
  PROFILE_TYPES.GOAL_DRIVEN,
  PROFILE_TYPES.STEADY_SAVER,
  PROFILE_TYPES.GROWTH_LEARNER,
  PROFILE_TYPES.CAREFUL_PLANNER,
  PROFILE_TYPES.FREEDOM_EXPLORER,
];

// placeholderIcon: 실제 일러스트가 없을 때 hero 이미지 슬롯에 보여줄 Feather 아이콘.
export const PROFILE_CONFIG = {
  FULFILLMENT: {
    title: '오늘을 알차게 채우는 사람',
    description: '지금 행복한 것도 꽤 중요해. 좋아하는 거엔 아낌없이 쓰는 편.',
    imageKey: 'fulfillment',
    placeholderIcon: 'coffee',
  },
  GOAL_DRIVEN: {
    title: '목표를 향해 꾸준히 올라가는 사람',
    description: '하고 싶은 게 생기면 일단 목표부터. 한 번 정하면 내 페이스대로 꾸준히 가.',
    imageKey: 'goalDriven',
    placeholderIcon: 'flag',
  },
  STEADY_SAVER: {
    title: '차곡차곡 미래를 쌓는 사람',
    description: '조금씩 쌓이는 게 은근 뿌듯해. 쓸 땐 쓰고, 챙길 건 확실히 챙겨.',
    imageKey: 'steadySaver',
    placeholderIcon: 'shield',
  },
  GROWTH_LEARNER: {
    title: '배움으로 내 가치를 키우는 사람',
    description: '나한테 남는 건 아깝지 않아. 배우고 경험하는 데 쓰는 돈은 꽤 괜찮은 투자니까.',
    imageKey: 'growthLearner',
    placeholderIcon: 'book-open',
  },
  CAREFUL_PLANNER: {
    title: '충분히 알아보고 움직이는 사람',
    description: '대충 쓰는 것보단 계획이 있는 게 편해. 미리 챙겨두면 마음도 훨씬 가벼워.',
    imageKey: 'carefulPlanner',
    placeholderIcon: 'search',
  },
  FREEDOM_EXPLORER: {
    title: '내 방식의 미래를 준비하는 사람',
    description: '돈 때문에 하고 싶은 걸 포기하긴 싫어. 결국 중요한 건 내가 고를 수 있는 여유니까.',
    imageKey: 'freedomExplorer',
    placeholderIcon: 'compass',
  },
};

// 답변이 없거나 점수가 전혀 나오지 않을 때 쓰는 중립 프로필.
export const FALLBACK_PROFILE = {
  type: null,
  title: '나만의 Future Profile',
  description: '답변을 바탕으로 나만의 미래를 함께 그려가요.',
  imageKey: 'fallback',
  placeholderIcon: 'compass',
};

// questionId → optionId → { TYPE: 점수 }. Q1/Q8/Q10은 type 점수에 사용하지 않는다.
export const PROFILE_SCORES = {
  q2: {
    abroad: { FREEDOM_EXPLORER: 1 },
    with_parents: { CAREFUL_PLANNER: 1 },
  },
  q3: {
    corporate: { GOAL_DRIVEN: 1 },
    startup: { GOAL_DRIVEN: 1, GROWTH_LEARNER: 1 },
    freelancer: { FREEDOM_EXPLORER: 2 },
    undecided: { CAREFUL_PLANNER: 1 },
  },
  q4: {
    travel: { FULFILLMENT: 2, FREEDOM_EXPLORER: 1 },
    luxury: { FULFILLMENT: 2 },
    saving: { STEADY_SAVER: 3 },
    gift: { FULFILLMENT: 2 },
  },
  q5: {
    resting: { FULFILLMENT: 1 },
    dining_activity: { FULFILLMENT: 2 },
    self_study: { GROWTH_LEARNER: 3 },
    hobby: { FULFILLMENT: 2 },
  },
  q6: {
    impulse: { FULFILLMENT: 2 },
    research: { CAREFUL_PLANNER: 3 },
    save_first: { STEADY_SAVER: 3 },
  },
  q7: {
    salary_first: { GOAL_DRIVEN: 2 },
    balance_first: { FULFILLMENT: 1, FREEDOM_EXPLORER: 1 },
  },
  q9: {
    savings_50m: { STEADY_SAVER: 2 },
    own_jeonse: { STEADY_SAVER: 2 },
    expert: { GROWTH_LEARNER: 2, GOAL_DRIVEN: 1 },
    month_long_trip: { FREEDOM_EXPLORER: 3 },
  },
};

// Hero tag 후보. 이 순서(Q5 → Q6 → Q7 → Q8)대로 수집해 최대 MAX_PROFILE_TAGS개만 노출한다.
export const TAG_QUESTION_ORDER = ['q5', 'q6', 'q7', 'q8'];
export const MAX_PROFILE_TAGS = 3;

export const PROFILE_TAGS = {
  q5: {
    resting: '충전 시간',
    dining_activity: '경험 소비',
    self_study: '자기계발',
    hobby: '취미 몰입',
  },
  q6: {
    impulse: '즉시 만족',
    research: '신중한 소비',
    save_first: '선저축',
  },
  q7: {
    salary_first: '성취 지향',
    balance_first: '워라밸',
  },
  q8: {
    dessert_coffee: '작은 만족',
    fashion_beauty: '취향 소비',
    taxi_convenience: '시간·편리함',
    social_gatherings: '관계 소비',
  },
};

// Q9는 프로필이 아니라 "3년 뒤 내가 원하는 모습" 카드에 그대로 사용한다(label은 질문 데이터에서 읽음).
export const FUTURE_CONFIG = {
  label: '3년 뒤 내가 원하는 모습',
  icon: 'flag',
};
