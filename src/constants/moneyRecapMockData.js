// 머니 리캡 스토리 화면 view-model. 문구/수치는 디자인(MoneyRecapStories.tsx)과 정확히 일치시킨다.
// 실제 API 연동 시 이 파일의 상수를 API 응답 기반 view-model로 교체하면 된다.

export const MONEY_RECAP_ENTRY_VM = {
  brand: 'MOAJE',
  titleLines: ['2026년 1학기', '머니 리캡 준비됐어요'],
  subtitleLines: ['한 학기 소비를 돌아보는', '나만의 소비 리캡을 확인해봐요.'],
  ctaLabel: '머니 리캡 시작하기',
};

export const STORY_COUNT = 7;
export const STORY_DURATIONS_MS = [6000, 6000, 8000, 8000, 8000, 6000, Infinity];
export const DARK_STORY_INDEXES = [0, 4, 6];

export const STORY1_VM = {
  badgeLabel: '2026년 1학기',
  titleLines: ['머니', '리캡'],
  period: '2026.03.02 — 2026.06.20',
  gradeLabel: '종합 소비 등급',
  grade: 'B+',
  scoreLabel: '소비 점수',
  score: 72,
  scoreMax: 100,
  scorePercent: 72,
  summaryText: '✦ 시험기간엔 지출이 늘었지만, 기말고사엔 소비 조절이 좋아졌어요.',
};

export const STORY2_VM = {
  eyebrow: '이번 학기 소비 요약',
  title: '이런 소비 패턴이었어요',
  quoteLines: ['점심시간 소비가 가장 많았고,', '시험기간 카페 지출이 눈에 띄었어요.'],
  metrics: [
    {
      key: 'avgDailyLimit',
      label: '평균 Daily Limit',
      value: '32,000원',
      iconName: 'bar-chart-2',
      accent: true,
    },
    {
      key: 'totalCount',
      label: '총 거래 건수',
      value: '47건',
      sub: '이번 학기 전체',
      iconName: 'zap',
    },
    {
      key: 'mostSaved',
      label: '가장 아낀 날',
      value: '18,000원',
      sub: '3월 9일 (일)',
      iconName: 'trending-down',
      highlight: 'green',
    },
    {
      key: 'mostSpent',
      label: '가장 많이 쓴 날',
      value: '67,000원',
      sub: '4월 21일 (월)',
      iconName: 'trending-up',
      highlight: 'red',
    },
  ],
  safeChipText: '총 47건의 거래가 안전하게 기록됐어요',
};

export const STORY3_VM = {
  eyebrow: '시간대별 소비 분포',
  titleLines: ['언제 가장 많이', '썼을까?'],
  chartLabel: '소비 시간대 (시)',
  peakBadgeText: '피크 12~13시',
  hours: [
    { hour: '9', value: 12 },
    { hour: '10', value: 18 },
    { hour: '11', value: 32 },
    { hour: '12', value: 100 },
    { hour: '13', value: 78 },
    { hour: '14', value: 28 },
    { hour: '15', value: 20 },
    { hour: '16', value: 17 },
    { hour: '17', value: 34 },
    { hour: '18', value: 52 },
    { hour: '19', value: 36 },
    { hour: '20', value: 14 },
  ],
  peakHourKeys: ['12', '13'],
  peakCalloutHour: '12',
  peakCalloutLabel: '38%',
  tags: [
    { label: '12~13시 집중', variant: 'primary' },
    { label: '새벽 이상거래 탐지', variant: 'warning' },
    { label: '저녁 18시 2순위', variant: 'default' },
  ],
};

export const STORY4_VM = {
  eyebrow: '소비 습관 분석',
  titleLines: ['무엇에, 언제', '썼을까?'],
  categoryCardLabel: '카테고리 비중',
  categories: [
    {
      key: 'food',
      label: '식비',
      percent: 38,
      iconName: 'silverware-fork-knife',
      iconFamily: 'mci',
      swatch: 'primary',
      bar: 'primary',
      iconColorKey: 'white',
    },
    {
      key: 'cafe',
      label: '카페',
      percent: 22,
      iconName: 'coffee',
      iconFamily: 'feather',
      swatch: 'primaryLight',
      bar: 'primaryLight',
      iconColorKey: 'white',
    },
    {
      key: 'transport',
      label: '교통',
      percent: 15,
      iconName: 'bus',
      iconFamily: 'ionicons',
      swatch: 'accentSoft',
      bar: 'primaryMid',
      iconColorKey: 'primary',
    },
    {
      key: 'shopping',
      label: '쇼핑',
      percent: 14,
      iconName: 'shopping-bag',
      iconFamily: 'feather',
      swatch: 'shoppingSwatch',
      bar: 'shoppingBar',
      iconColorKey: 'shoppingIcon',
    },
    {
      key: 'etc',
      label: '기타',
      percent: 11,
      iconName: 'bar-chart-2',
      iconFamily: 'feather',
      swatch: 'etcSwatch',
      bar: 'etcBar',
      iconColorKey: 'textLight',
    },
  ],
  weeklyCardLabel: '요일별 소비 리듬',
  days: [
    { day: '월', level: 3 },
    { day: '화', level: 3 },
    { day: '수', level: 2 },
    { day: '목', level: 3 },
    { day: '금', level: 3 },
    { day: '토', level: 2 },
    { day: '일', level: 1 },
  ],
  legend: [
    { level: 1, label: '낮음' },
    { level: 2, label: '보통' },
    { level: 3, label: '높음' },
  ],
  tags: [
    { label: '점심 소비형', variant: 'primary' },
    { label: '시험기간 카페 단골', variant: 'primary' },
    { label: '식비 중심', variant: 'default' },
    { label: '주말 절약형', variant: 'default' },
    { label: '월말 긴축형', variant: 'default' },
  ],
};

export const STORY5_VM = {
  badgeLabel: 'AI 개인 인사이트',
  title: 'Moaje가 분석했어요',
  insights: [
    {
      key: 'exam',
      iconName: 'coffee',
      iconFamily: 'feather',
      title: '시험기간 패턴',
      body: '중간고사 때 카페·배달 지출이 늘었지만, 기말고사 때는 18% 줄었어요.',
    },
    {
      key: 'weekly',
      iconName: 'calendar',
      iconFamily: 'feather',
      title: '주간 리듬',
      body: '월·화·목·금에 소비가 집중되고, 일요일은 가장 낮았어요.',
    },
    {
      key: 'next',
      iconName: 'sparkles',
      iconFamily: 'ionicons',
      title: '다음 학기 제안',
      body: '시험 2주 전부터 이벤트 버퍼를 설정하면 Daily Limit을 안정적으로 관리할 수 있어요.',
    },
  ],
  footerText: '이번 학기 47건의 거래를 분석한 결과예요',
};

export const STORY6_VM = {
  eyebrow: '학사 이벤트 비교',
  titleLines: ['중간 vs 기말고사', '소비 비교'],
  midterm: {
    label: '중간고사',
    period: '04.21 — 04.27',
    multiplierLabel: '1.8배',
    rows: [
      ['일평균', '57,600원'],
      ['합계', '403,200원'],
      ['피크', '67,000원'],
    ],
  },
  final: {
    label: '기말고사',
    period: '06.09 — 06.15',
    multiplierLabel: '1.2배',
    rows: [
      ['일평균', '38,400원'],
      ['합계', '268,800원'],
      ['중간 대비', '-33% ↓'],
    ],
  },
  totalCompare: {
    cardLabel: '총 지출 비교',
    rows: [
      { label: '중간고사', value: '403,200원', widthPercent: 100 },
      { label: '기말고사', value: '268,800원', widthPercent: 66.7 },
    ],
  },
  fds: {
    titleLine: 'FDS 안전 결과 · B등급 (80점)',
    desc: '이상거래 1건 탐지 · Moaje가 안전하게 처리했어요',
  },
};

export const STORY7_VM = {
  emoji: '🌱',
  eyebrow: '다음 학기에는',
  titleLines: ['더 똑똑하게', '소비해볼까요?'],
  goals: [
    { emoji: '📚', title: '시험 기간 생활비 관리', desc: '시험 2주 전 이벤트 버퍼 설정' },
    { emoji: '🍱', title: '점심 소비 줄이기', desc: '식비 목표 월 15,000원 절약' },
    { emoji: '🛡️', title: 'FDS 안전 습관', desc: '새벽 결제 재확인 습관 만들기' },
    { emoji: '📊', title: '월간 리포트 확인', desc: '매달 1일 소비 패턴 체크' },
  ],
  ctaLabel: '다음 학기 소비 계획 세우기',
};
