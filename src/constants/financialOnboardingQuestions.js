// 재무 온보딩(My Future) Q1~Q10 질문 데이터.
// 문항/선택지 label 문자열은 기획 자료(질문 PDF) 기준이며 임의로 바꾸지 않는다.
// icon은 Feather 아이콘 이름을 사용하는 UI 장식용 메타데이터일 뿐, label 문구와는 무관하다.
export const FINANCIAL_ONBOARDING_QUESTIONS = [
  {
    id: 'q1',
    phase: 1,
    phaseTitle: '출발선 확인',
    title: '지금 어떤 학생(상태)이신가요?',
    options: [
      { id: 'school_first', label: '학교생활 우선', icon: 'book-open' },
      { id: 'graduating', label: '졸업 예정', icon: 'award' },
      { id: 'job_seeking', label: '취업 준비 중', icon: 'briefcase' },
      { id: 'employed', label: '직장인', icon: 'user-check' },
      { id: 'exploring', label: '진로 탐색 중', icon: 'compass' },
    ],
  },
  {
    id: 'q2',
    phase: 2,
    phaseTitle: '주거와 커리어',
    title: '취업 후 가장 먼저 그려보는 독립의 모습은 어떤가요?',
    options: [
      { id: 'near_work', label: '회사 근처 자취', icon: 'home' },
      { id: 'with_parents', label: '당분간 부모님과 거주', icon: 'users' },
      { id: 'share_house', label: '셰어하우스', icon: 'grid' },
      { id: 'abroad', label: '타지/해외 취업', icon: 'globe' },
    ],
  },
  {
    id: 'q3',
    phase: 2,
    phaseTitle: '주거와 커리어',
    title: '내가 일하고 싶은 환경은 어떤 모습에 가깝나요?',
    options: [
      { id: 'corporate', label: '대기업', icon: 'briefcase' },
      { id: 'startup', label: '스타트업', icon: 'zap' },
      { id: 'freelancer', label: '프리랜서·N잡러', icon: 'shuffle' },
      { id: 'undecided', label: '아직 모르겠음', icon: 'help-circle' },
    ],
  },
  {
    id: 'q4',
    phase: 3,
    phaseTitle: '라이프스타일과 소비 성향',
    title: '첫 월급을 받으면 가장 먼저 하고 싶은 일은?',
    options: [
      { id: 'travel', label: '나를 위한 여행', icon: 'map-pin' },
      { id: 'luxury', label: '명품·전자기기 구매', icon: 'shopping-bag' },
      { id: 'saving', label: '적금 시작', icon: 'trending-up' },
      { id: 'gift', label: '소중한 사람에게 선물', icon: 'gift' },
    ],
  },
  {
    id: 'q5',
    phase: 3,
    phaseTitle: '라이프스타일과 소비 성향',
    title: '직장인이 된 나의 이상적인 주말은 어떤 모습인가요?',
    options: [
      { id: 'resting', label: '집에서 푹 쉬기', icon: 'moon' },
      { id: 'dining_activity', label: '맛집 탐방·액티비티', icon: 'coffee' },
      { id: 'self_study', label: '자기계발·스터디', icon: 'book' },
      { id: 'hobby', label: '취미 생활 몰두', icon: 'music' },
    ],
  },
  {
    id: 'q6',
    phase: 3,
    phaseTitle: '라이프스타일과 소비 성향',
    title: '평소 사고 싶은 물건이 생겼을 때 나의 행동은?',
    options: [
      { id: 'impulse', label: '꽂히면 바로 산다', icon: 'zap' },
      { id: 'research', label: '후기를 100개 찾아보고 산다', icon: 'search' },
      { id: 'save_first', label: '살 돈을 모은 후 산다', icon: 'shield' },
    ],
  },
  {
    id: 'q7',
    phase: 4,
    phaseTitle: '가치관의 밸런스 게임',
    title: '둘 중 하나만 선택해야 한다면?',
    options: [
      { id: 'salary_first', label: '야근해도 연봉이 최고!', icon: 'trending-up' },
      { id: 'balance_first', label: '연봉은 평균이어도 워라밸이 최고!', icon: 'sun' },
    ],
  },
  {
    id: 'q8',
    phase: 4,
    phaseTitle: '가치관의 밸런스 게임',
    title: '내 삶에서 가장 아끼기 힘든(포기할 수 없는) 지출 카테고리는?',
    options: [
      { id: 'dessert_coffee', label: '디저트와 커피', icon: 'coffee' },
      { id: 'fashion_beauty', label: '옷과 미용', icon: 'scissors' },
      { id: 'taxi_convenience', label: '택시비와 편리함', icon: 'navigation' },
      { id: 'social_gatherings', label: '사람들과의 모임비', icon: 'users' },
    ],
  },
  {
    id: 'q9',
    phase: 5,
    phaseTitle: '최종 목표(미래 그리기)',
    title: "직장인이 되고 3년 뒤, 내가 생각하는 '성공한 내 모습'은?",
    options: [
      { id: 'savings_50m', label: '통장에 5천만 원 달성', icon: 'dollar-sign' },
      { id: 'own_jeonse', label: '나만의 전셋집 마련', icon: 'home' },
      { id: 'expert', label: '대체 불가능한 전문가', icon: 'award' },
      { id: 'month_long_trip', label: '1년에 한 달 살기 여행', icon: 'map' },
    ],
  },
  {
    id: 'q10',
    phase: 5,
    phaseTitle: '최종 목표(미래 그리기)',
    title: '지금 당장 돈과 관련해서 가장 막막한 점은 무엇인가요?',
    options: [
      { id: 'dont_know_start', label: '돈 관리 시작 방법을 모름', icon: 'help-circle' },
      { id: 'money_leaks', label: '자꾸 돈이 새어 나감', icon: 'trending-down' },
      { id: 'fear_of_goal', label: '목표 달성 가능성이 두려움', icon: 'alert-circle' },
      { id: 'lack_investment_knowledge', label: '투자 지식이 없음', icon: 'book-open' },
    ],
  },
];
