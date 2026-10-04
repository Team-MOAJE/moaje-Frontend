import Story1Cover from '../../components/moneyRecap/stories/Story1Cover';
import Story2Summary from '../../components/moneyRecap/stories/Story2Summary';
import Story3HourlyPattern from '../../components/moneyRecap/stories/Story3HourlyPattern';
import Story4CategoryDay from '../../components/moneyRecap/stories/Story4CategoryDay';
import Story5AIInsights from '../../components/moneyRecap/stories/Story5AIInsights';
import Story6Comparison from '../../components/moneyRecap/stories/Story6Comparison';
import StoryClosing from '../../components/moneyRecap/stories/StoryClosing';

// 마지막 closing story의 수동 종료(자동 진행 없음)를 뜻하는 duration.
export const MANUAL_DURATION = Infinity;

const hasItems = list => Array.isArray(list) && list.length > 0;

// 분석 데이터(섹션 객체)로 "보여줄 story descriptor 배열"을 만든다.
// - 백엔드가 화면 수/컴포넌트를 정하지 않는다: 섹션 데이터가 있을 때만 해당 story를 포함한다.
// - 이 배열이 진행바 개수, 이동 범위, 마지막 판단, duration, tone의 single source of truth다.
// descriptor: { key, component, duration, tone, props }
//
// data = { cover, summary, hourly, category, insights, comparison, closing }  (없는 섹션은 생략)
export function buildMoneyRecapStories(data) {
  if (!data || typeof data !== 'object') return [];

  const stories = [];

  // cover는 항상 포함(필드가 없으면 컴포넌트가 해당 줄만 생략한다)
  stories.push({
    key: 'cover',
    component: Story1Cover,
    duration: 6000,
    tone: 'light',
    props: { vm: data.cover ?? {} },
  });

  if (hasItems(data.summary?.metrics) || hasItems(data.summary?.quoteLines)) {
    stories.push({
      key: 'summary',
      component: Story2Summary,
      duration: 6000,
      tone: 'light',
      props: { vm: data.summary },
    });
  }

  if (hasItems(data.hourly?.hours)) {
    stories.push({
      key: 'hourlyPattern',
      component: Story3HourlyPattern,
      duration: 8000,
      tone: 'light',
      props: { vm: data.hourly },
    });
  }

  if (hasItems(data.category?.categories)) {
    stories.push({
      key: 'categoryPattern',
      component: Story4CategoryDay,
      duration: 8000,
      tone: 'light',
      props: { vm: data.category },
    });
  }

  if (hasItems(data.insights?.insights)) {
    stories.push({
      key: 'insights',
      component: Story5AIInsights,
      duration: 8000,
      tone: 'light',
      props: { vm: data.insights },
    });
  }

  if (data.comparison?.midterm && data.comparison?.final) {
    stories.push({
      key: 'comparison',
      component: Story6Comparison,
      duration: 6000,
      tone: 'light',
      props: { vm: data.comparison },
    });
  }

  // closing은 항상 마지막. 목표 생성 기능 없이 리캡을 마치는 수동 종료 페이지.
  stories.push({
    key: 'closing',
    component: StoryClosing,
    duration: MANUAL_DURATION,
    tone: 'light',
    props: { vm: data.closing ?? { ctaLabel: '리캡 마치기' } },
  });

  return stories;
}
