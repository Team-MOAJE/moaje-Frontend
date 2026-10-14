// 홈 '머니 타입' 탭 복원 테스트. 서버 호출·Android 실행 없음.
// JSX를 변환하는 도구가 없어 컴포넌트는 직접 렌더링하지 않는다. 대신 화면이 쓰는 판단 로직(서버 프로필 → 탭 내용,
// Redux API-16/17 상태 → 소비 요약)을 실제 응답 매퍼와 Redux 상태 모양으로 검증하고, 컴포넌트·화면 소스는 연결만 확인한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/homeMoneyType.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapProfileResponse } from '../../src/features/onboarding/onboardingApi.js';
import {
  HOME_MONEY_TYPE_KIND as KIND,
  loadHomeFutureProfile,
  resolveHomeMoneyTypeTab,
  shouldLoadHomeFutureProfile,
} from '../../src/features/onboarding/homeMoneyTypeLogic.js';
import { RESULT_STATUS } from '../../src/features/onboarding/workOnboardingScreenLogic.js';
import { buildHomeSpendingSummary } from '../../src/features/asset/homeTabLogic.js';
import { API_ERROR_KIND, createApiError } from '../../src/services/apiResponse.js';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));

const UID = '9007199254740993123';
const OTHER_UID = '123';

const profileBody = (overrides = {}) => ({
  user_id: 123,
  status_code: 'STUDENT',
  housing_type: null,
  work_env: 'STARTUP',
  value_priority: 'WORK_LIFE',
  must_keep_category: 'FOOD',
  money_concern: 'NO_PLAN',
  success_image: null,
  card_title: '성장을 택한 균형을 지키는 사회인',
  card_summary: '지키고 싶은 소비: 먹는 것\n3년 뒤의 나: 작업실',
  answered_count: 10,
  is_completed: true,
  completed_at: '2026-10-11T03:00:00',
  ...overrides,
});

const repoReturning = body => {
  const calls = { loadProfile: 0, loadAnswers: 0 };
  return {
    calls,
    loadProfile: async () => {
      calls.loadProfile += 1;
      return mapProfileResponse(body);
    },
    loadAnswers: async () => {
      calls.loadAnswers += 1;
      return [];
    },
  };
};
const repoFailing = error => ({
  loadProfile: async () => {
    throw error;
  },
});
const httpError = status =>
  createApiError({
    kind: status >= 500 ? API_ERROR_KIND.HTTP_5XX : API_ERROR_KIND.HTTP_4XX,
    status,
  });

// ── Work API 프로필 → 머니 타입 ────────────────────────────────

test('완료된 서버 프로필: card_title/card_summary만 제목·설명으로 쓰고 answers는 요청하지 않는다', async () => {
  const repo = repoReturning(profileBody());
  const result = await loadHomeFutureProfile(repo);
  assert.deepEqual(result, {
    status: RESULT_STATUS.READY,
    title: '성장을 택한 균형을 지키는 사회인',
    description: '지키고 싶은 소비: 먹는 것\n3년 뒤의 나: 작업실',
  });
  assert.equal(repo.calls.loadProfile, 1);
  assert.equal(repo.calls.loadAnswers, 0);
  // 서버에 없는 값(태그·유형·점수)은 결과에 없다.
  for (const key of ['tags', 'type', 'score', 'statusCode']) {
    assert.equal(Object.prototype.hasOwnProperty.call(result, key), false);
  }
});

test('미완료·404·네트워크 오류·카드 제목 없음을 구분하고 가짜 머니 타입을 만들지 않는다', async () => {
  const incomplete = await loadHomeFutureProfile(
    repoReturning(profileBody({ is_completed: false, answered_count: 3, card_title: null }))
  );
  assert.deepEqual(incomplete, { status: RESULT_STATUS.NOT_COMPLETED });

  const missing = await loadHomeFutureProfile(repoFailing(httpError(404)));
  assert.deepEqual(missing, { status: RESULT_STATUS.EMPTY });

  const network = await loadHomeFutureProfile(
    repoFailing(createApiError({ kind: API_ERROR_KIND.NETWORK }))
  );
  assert.equal(network.status, RESULT_STATUS.ERROR);
  assert.equal(network.errorType, 'NETWORK');

  const server = await loadHomeFutureProfile(repoFailing(httpError(500)));
  assert.equal(server.status, RESULT_STATUS.ERROR);
  assert.equal(server.errorType, 'SERVER');

  const noTitle = await loadHomeFutureProfile(
    repoReturning(profileBody({ card_title: '  ', card_summary: null }))
  );
  assert.equal(noTitle.status, RESULT_STATUS.READY);
  assert.equal(noTitle.title, null);
  assert.equal(noTitle.description, '');
});

// ── 탭 분기(온보딩 완료/미완료, 사용자 격리, 로컬 결과 혼합 금지) ──

const readyState = (userId = UID) => ({
  userId,
  status: RESULT_STATUS.READY,
  title: '서버 제목',
  description: '서버 설명',
});
const tab = args => resolveHomeMoneyTypeTab({ flagEnabled: true, userId: UID, ...args });

test('탭 분기: 온보딩 완료 → 서버 제목·설명(태그 없음), 이전 조회 전 → 로딩', () => {
  const view = tab({ profileState: readyState() });
  assert.equal(view.kind, KIND.PROFILE);
  assert.deepEqual(view.profile, { title: '서버 제목', description: '서버 설명' });
  assert.equal(view.profile.tags, undefined);

  assert.equal(tab({ profileState: null }).kind, KIND.LOADING);
});

test('탭 분기: 온보딩 미완료·결과 없음·제목 없음 → 기존 안내(결과 화면 이동 액션), 오류 → 오류', () => {
  for (const state of [
    { userId: UID, status: RESULT_STATUS.NOT_COMPLETED },
    { userId: UID, status: RESULT_STATUS.EMPTY },
    { userId: UID, status: RESULT_STATUS.READY, title: null, description: '' },
  ]) {
    const view = tab({ profileState: state });
    assert.equal(view.kind, KIND.GUIDE);
    assert.equal(view.guide.title, 'Future Profile');
    assert.deepEqual(view.guide.action, {
      type: 'NAVIGATE',
      payload: { name: 'WorkFinancialOnboardingResult' },
    });
  }
  const error = tab({
    profileState: { userId: UID, status: RESULT_STATUS.ERROR, errorType: 'SERVER' },
  });
  assert.equal(error.kind, KIND.ERROR);
});

test('탭 분기: 다른 사용자의 결과와 로컬 머니 타입은 서버 결과와 섞이지 않는다', () => {
  assert.equal(tab({ profileState: readyState(OTHER_UID) }).kind, KIND.LOADING);
  const withLocal = tab({
    profileState: readyState(),
    localProfile: { title: '로컬 제목', description: '로컬', tags: ['로컬태그'] },
  });
  assert.equal(withLocal.profile.title, '서버 제목');
  assert.equal(withLocal.profile.tags, undefined);

  // 플래그 off: 기존 로컬 프로필 유지, 서버 프로필은 쓰지 않는다.
  const legacy = resolveHomeMoneyTypeTab({
    flagEnabled: false,
    userId: UID,
    profileState: readyState(),
    localProfile: { title: '로컬 제목' },
  });
  assert.equal(legacy.kind, KIND.LEGACY);
  assert.equal(legacy.profile.title, '로컬 제목');
});

test('프로필 요청 조건: 현재 사용자 결과가 없고 진행 중이 아닐 때만(오류 후 자동 재시도 없음)', () => {
  assert.equal(
    shouldLoadHomeFutureProfile({ userId: UID, profileState: null, loading: false }),
    true
  );
  assert.equal(
    shouldLoadHomeFutureProfile({ userId: UID, profileState: null, loading: true }),
    false
  );
  assert.equal(shouldLoadHomeFutureProfile({ userId: UID, profileState: readyState() }), false);
  assert.equal(
    shouldLoadHomeFutureProfile({
      userId: UID,
      profileState: { userId: UID, status: RESULT_STATUS.ERROR, errorType: 'SERVER' },
    }),
    false
  );
  assert.equal(
    shouldLoadHomeFutureProfile({ userId: UID, profileState: readyState(OTHER_UID) }),
    true
  ); // 다른 사용자 결과는 없는 것으로 본다
  assert.equal(shouldLoadHomeFutureProfile({ userId: null, profileState: null }), false);
});

// ── 이번 달 소비 요약 (API-16/17 Redux 상태) ───────────────────

const section = (data, overrides = {}) => ({ data, loading: false, error: null, ...overrides });
const monthly = (overrides = {}) =>
  section({ incomeAmount: 0, expenseAmount: 288900, transferAmount: 0, revision: 'r1' }, overrides);
const category = (overrides = {}) =>
  section(
    {
      revision: 'r1',
      categories: [
        { category: 'CAFE', amount: 41000 },
        { category: 'FOOD', amount: 182400 },
        { category: 'INCOME', amount: 500000 },
        { category: 'TRANSPORT', amount: 0 },
        { category: 'SHOPPING', amount: 65500 },
      ],
    },
    overrides
  );

test('소비 요약: 서버 금액 상위 2개만 금액 순으로 표시하고 퍼센트·학기·시험기간을 만들지 않는다', () => {
  const recap = buildHomeSpendingSummary({
    yearMonth: '2026-10',
    monthly: monthly(),
    category: category(),
  });
  assert.equal(recap.state, 'ready');
  assert.equal(recap.periodLabel, '10월');
  assert.equal(recap.summary, '10월 지출은 288,900원이에요');
  assert.deepEqual(recap.rows, [
    { key: 'top', label: '가장 많이 지출한 항목', value: '식비 182,400원' },
    { key: 'second', label: '두 번째로 지출한 항목', value: '쇼핑 65,500원' },
  ]);
  const text = JSON.stringify(recap);
  assert.doesNotMatch(text, /%|학기|시험|눈에 띈|패턴/);
});

test('소비 요약: 로딩·오류·빈 달을 구분하고 가짜 기록을 만들지 않는다', () => {
  const loading = section(null, { loading: true });
  const failed = section(null, { error: '실패' });
  assert.equal(
    buildHomeSpendingSummary({ yearMonth: '2026-10', monthly: loading, category: loading }).state,
    'loading'
  );
  assert.equal(
    buildHomeSpendingSummary({ yearMonth: '2026-10', monthly: failed, category: category() }).state,
    'error'
  );
  assert.equal(buildHomeSpendingSummary({ yearMonth: '2026-10' }).state, 'loading');

  const empty = buildHomeSpendingSummary({
    yearMonth: '2026-10',
    monthly: section({ incomeAmount: 0, expenseAmount: 0, transferAmount: 0, revision: 'r0' }),
    category: section({ revision: 'r0', categories: [{ category: 'FOOD', amount: 0 }] }),
  });
  assert.equal(empty.state, 'empty');
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.summary, null);
});

test('소비 요약: 카테고리가 1개뿐이면 두 번째 행을 만들지 않는다', () => {
  const recap = buildHomeSpendingSummary({
    yearMonth: '2026-10',
    monthly: monthly(),
    category: section({ revision: 'r1', categories: [{ category: 'FOOD', amount: 288900 }] }),
  });
  assert.deepEqual(
    recap.rows.map(row => row.key),
    ['top']
  );
});

// ── 소스 연결(렌더링은 Android에서 확인) ───────────────────────

test('연결: 홈 머니 타입 탭은 기존 컴포넌트·thunk를 재사용하고 홈 상단 코드는 그대로다', () => {
  const home = code('src/screens/home/HomeScreen.js');
  assert.match(home, /resolveHomeMoneyTypeTab\(/);
  assert.match(home, /useHomeFutureProfile\(\{/);
  const hook = code('src/features/onboarding/useHomeFutureProfile.js');
  assert.match(hook, /loadHomeFutureProfile\(repository\)/);
  assert.doesNotMatch(hook, /setInterval|setTimeout/); // 자동 재시도·폴링 없음
  assert.match(home, /buildHomeSpendingSummary\(/);
  // API-16/17은 새 요청 코드를 만들지 않고 기존 loadHomeExpense를 머니 타입 탭에서도 같은 조건으로 쓴다.
  assert.match(home, /activeTab !== 'analysis' && activeTab !== 'moneyType'/);
  assert.equal((home.match(/loadHomeExpense\(/g) ?? []).length, 1);
  assert.match(home, /onRecapPress=\{handleAnalysisDetailPress\}/);
  assert.match(home, /onDetailPress=\{handleFutureProfilePress\}/);
  // API-15 복원·사용자 격리 코드는 유지된다.
  assert.match(home, /dispatch\(syncDailyLimitForToday\(\)\)/);
  assert.match(home, /isDailyLimitCurrent\(dailyLimitMeta\.calculatedOn, todayKey\)/);
  // 원본(feat/preview)의 Mock 금액·학기 리캡 데이터는 가져오지 않는다.
  assert.doesNotMatch(home, /moneyRecapMockData|STORY\d_VM|MONEY_RECAP_PREVIEW/);
});

test('연결: 컴포넌트는 서버 값만 props로 받고 학기·시험기간·고정 수치 문구를 하드코딩하지 않는다', () => {
  for (const file of [
    'src/components/home/HomeMoneyTypeTab.js',
    'src/components/home/MoneyRecapPreview.js',
  ]) {
    const source = code(file);
    assert.doesNotMatch(source, /학기|시험|점심|38%|22%|moneyRecapMockData/);
  }
  const tabSource = code('src/components/home/HomeMoneyTypeTab.js');
  assert.match(tabSource, /내 Future Profile 자세히 보기/);
  assert.match(tabSource, /profile\.tags\?\.length > 0/);
  assert.match(tabSource, /<MoneyRecapPreview recap=\{recap\} onPress=\{onRecapPress\} \/>/);
  const recapSource = code('src/components/home/MoneyRecapPreview.js');
  assert.match(recapSource, /이번 달 소비 요약/);
});
