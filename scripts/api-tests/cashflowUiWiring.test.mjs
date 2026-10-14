// Cashflow 화면(홈 안전금액·오늘의 가용금액·월별 분석) 연결 정적 테스트.
// React 렌더러가 없어 소스 문자열만 분석한다(렌더링·Android 동작은 미검증). 서버 호출 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/cashflowUiWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));

const HOME = 'src/screens/home/HomeScreen.js';
const SAFE_SECTION = 'src/components/home/HomeSafeAmountSection.js';
const DAILY = 'src/screens/asset/DailyLimitScreen.js';
const HERO = 'src/components/dailylimit/DailyLimitHeroCard.js';
const ANALYSIS = 'src/screens/asset/AnalysisScreen.js';
const LOGIC = 'src/features/asset/cashflowScreenLogic.js';
const SLICE = 'src/features/asset/assetSlice.js';
const API = 'src/features/asset/assetApi.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

test('구형 daily-limit(work)을 홈·오늘의 가용금액·월별 분석이 더 이상 호출하지 않는다', () => {
  for (const file of [HOME, DAILY, ANALYSIS, SAFE_SECTION, HERO]) {
    const source = code(file);
    assert.doesNotMatch(source, /fetchDailyLimit|workApi|state\.work\.|WORK\.DAILY_LIMIT/, file);
  }
  // 홈은 서버 API-15 결과(asset.cashflowDaily.result)만 읽고, 입력 없이 계산을 요청하지 않는다.
  const home = code(HOME);
  assert.match(home, /state\.asset\.cashflowDaily\.result/);
  assert.doesNotMatch(home, /submitDailyLimit|loadMonthlyCashflow|loadCategoryCashflow/);
});

test('오늘의 가용금액: 서버 dailyLimit·계산 항목만 표시하고 spent·status·진행바를 만들지 않는다', () => {
  const source = code(DAILY);
  assert.match(source, /submitDailyLimit\(parsed\.input\)/);
  assert.match(source, /parseDailyLimitInput\(form\)/);
  assert.match(source, /buildDailyLimitFormulaItems\(result\)/);
  assert.match(source, /toDisplayWon\(result\.dailyLimit\)/);
  assert.doesNotMatch(
    source,
    /spent|usedToday|remaining|DailyLimitStatusCard|mapDailyLimitStatus|\.formulaItems/
  );
  // 서버 값을 임의 계산하지 않는다(나눗셈·합산 없음).
  assert.doesNotMatch(source, /\.reduce\(|Math\.round|Math\.floor|Math\.ceil|toFixed/);
  // 입력 전에는 계산 요청이 없다: 요청은 계산 버튼 핸들러 한 곳이다.
  assert.equal((source.match(/submitDailyLimit\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /useEffect/);
  assert.match(source, /disabled=\{loading\}/);
});

test('오늘의 가용금액: 필수 일수 외 값은 비워 두면 생략하는 안내이고, 0·가짜 값을 미리 채우지 않는다', () => {
  const raw = readSource(DAILY);
  assert.match(raw, /다음 수입일까지 남은 일수 \(필수\)/);
  assert.match(raw, /비워 두면 0원으로 계산돼요/);
  assert.match(raw, /원 미만은 표시하지 않아요/);
  const source = code(DAILY);
  assert.match(source, /useState\(\(\) => dailyLimitInputToText\(input\)\)/);
  assert.match(source, /월별 분석 보기/);
  assert.match(source, /navigation\.navigate\(ROUTES\.ANALYSIS\)/);
  assert.match(source, /오늘 쓴 돈 보기/); // 기존 이동 유지
  assert.match(source, /navigation\.navigate\(ROUTES\.TRANSACTION_HISTORY\)/);
});

test('히어로 카드·홈 안전금액: 오늘 쓴 돈이 없으면 진행바와 사용/남은 금액을 그리지 않는다', () => {
  for (const file of [HERO, SAFE_SECTION]) {
    const source = code(file);
    assert.match(source, /hasUsage/, file);
    assert.match(source, /\{hasUsage && \(/, file);
    assert.doesNotMatch(source, /spent \?\? 0|usedToday \?\? 0|\bNumber\(/, file);
  }
  assert.match(code(HERO), /다음 수입일까지/);
  assert.doesNotMatch(code(HERO), /알바비/);
  // 홈 안전금액 섹션은 항상 렌더되지만 금액은 서버 결과가 있을 때만 숫자로 보이고(계산 전 '-'), "왜 N원인가요?" 이동은 유지된다.
  const home = code(HOME);
  // 금액은 서버 dailyLimit에서만 만들고, 계산일이 오늘인 결과일 때만 숫자로 보인다(어제 금액 미표시).
  assert.match(
    home,
    /const amount =\s*dailyLimit && isDailyLimitCurrent\(dailyLimitMeta\.calculatedOn, todayKey\)\s*\? toDisplayWon\(dailyLimit\.dailyLimit\)\s*: null;/
  );
  assert.match(home, /amount=\{amount\}/);
  assert.match(code(SAFE_SECTION), /if \(amount == null\) \{/);
  assert.match(home, /nextIncomeDays=\{dailyLimit\?\.daysUntilNextPayday\}/);
  assert.match(home, /navigation\.navigate\(ROUTES\.DAILY_LIMIT\)/);
});

test('홈: 기존 보호 규칙(합산·Number 변환·은행명·개설 식별자 금지)과 계좌 요청이 유지된다', () => {
  const home = code(HOME);
  assert.doesNotMatch(
    home,
    /\.reduce\(|totalBalance|Number\(|bankName|createAccount|openAccount|계좌 연결/
  );
  assert.match(home, /dispatch\(fetchAccounts\(\)\)/);
  assert.match(home, /ROUTES\.ACCOUNT_OPEN/);
});

test('월별 분석: 월 상태 한 곳(state.asset.cashflowYearMonth)으로 API-16/17을 함께 요청한다', () => {
  const source = code(ANALYSIS);
  assert.match(source, /state\.asset\.cashflowYearMonth/);
  const select = source.slice(source.indexOf('const selectMonth'), source.indexOf('useEffect('));
  assert.match(select, /dispatch\(setCashflowYearMonth\(nextYearMonth\)\)/);
  assert.match(select, /dispatch\(loadMonthlyCashflow\(nextYearMonth\)\)/);
  assert.match(select, /dispatch\(loadCategoryCashflow\(nextYearMonth\)\)/);
  assert.match(select, /isFutureYearMonth\(nextYearMonth, currentYearMonth\)/);
  // 요청은 월 선택(진입·이전/다음 달)과 사용자의 다시 시도에서만 나간다. 자동 반복·타이머 없음.
  assert.doesNotMatch(source, /setTimeout|setInterval/);
  assert.equal((source.match(/useEffect\(/g) ?? []).length, 1);
  assert.match(source, /shiftYearMonth\(yearMonth, -1\)/);
  assert.match(source, /shiftYearMonth\(yearMonth, 1\)/);
  assert.doesNotMatch(source, /new Date\(/); // 현재 월은 getCurrentYearMonth만 사용
});

test('월별 분석: 수입·지출·자금이동을 합산하지 않고 카테고리 비율·합계를 계산하지 않는다', () => {
  const source = code(ANALYSIS);
  assert.doesNotMatch(
    source,
    /\.reduce\(|incomeAmount\s*[-+]|expenseAmount\s*[-+]|transferAmount\s*[-+]/
  );
  assert.doesNotMatch(source, /percent|toFixed|Math\.round/);
  assert.match(source, /buildMonthlySummaryRows\(monthly\.data\)/);
  assert.match(source, /buildCategoryRows\(category\.data\?\.categories\)/);
  const logic = code(LOGIC);
  assert.match(logic, /NON_SPENDING_CATEGORIES = Object\.freeze\(\['INCOME', 'TRANSFER'\]\)/);
  assert.doesNotMatch(logic, /percent|toFixed|Math\.round|Math\.ceil/);
  // 하드코딩된 금융 데이터가 없다.
  for (const file of [ANALYSIS, DAILY, LOGIC]) {
    assert.doesNotMatch(code(file), /MOCK_|mockData|moneyRecapMockData|CashFlowSummaryCard/, file);
  }
});

test('월별 분석: 로딩·오류(다시 시도)·빈 월·집계 시점 불일치 상태를 구분한다', () => {
  const source = code(ANALYSIS);
  assert.match(source, /monthlyView === 'loading'/);
  assert.match(source, /monthlyView === 'error'/);
  assert.match(source, /monthlyView === 'ready'/);
  assert.match(source, /categoryView === 'error'/);
  assert.match(source, /isCashflowEmpty\(monthly\.data, category\.data\)/);
  assert.match(source, /hasRevisionMismatch\(monthly\.data, category\.data\)/);
  const raw = readSource(ANALYSIS);
  assert.match(raw, /이 달에는 집계된 거래가 없어요/);
  assert.match(raw, /집계 시점이 달라요/);
  assert.match(raw, /불러오지 못했어요/);
});

test('슬라이스: Cashflow 상태는 asset 슬라이스(세션 초기화 대상)에 있고, 월·requestId로 늦은 응답을 막는다', () => {
  const slice = readSource(SLICE);
  const initial = slice.slice(
    slice.indexOf('const buildInitialState'),
    slice.indexOf('const resetAssetState')
  );
  for (const key of [
    'cashflowDaily:',
    'cashflowYearMonth:',
    'cashflowMonthly:',
    'cashflowCategory:',
  ]) {
    assert.ok(initial.includes(key), `${key} 초기 상태`);
  }
  assert.match(slice, /action\.payload\.yearMonth !== state\.cashflowYearMonth\) return;/);
  assert.equal(
    (
      slice.match(
        /isCurrentRequest\(state\.cashflow(Monthly|Category|Daily)\.requestId, action\)/g
      ) ?? []
    ).length,
    6
  );
  assert.match(slice, /setCashflowYearMonth: \(state, action\) =>/);
  // work 슬라이스에는 두지 않는다(로그아웃 reset이 없음).
  assert.doesNotMatch(readSource('src/features/work/workSlice.js'), /cashflow/i);
});

test('thunk: 진행 중 중복 요청 차단·조회 월 일치 검사·응답 월 검증이 있고 cashflowApi만 사용한다', () => {
  const api = code(API);
  assert.match(api, /cashflowApi\.calculateDailyLimit\(input\)/);
  assert.match(api, /cashflowApi\.fetchMonthlyCashflow\(yearMonth\)/);
  assert.match(api, /cashflowApi\.fetchCategoryCashflow\(yearMonth\)/);
  assert.match(
    api,
    /condition: \(_, \{ getState \}\) => !getState\(\)\.asset\.cashflowDaily\.loading/
  );
  assert.match(api, /yearMonth === state\.cashflowYearMonth && !state\.cashflowMonthly\.loading/);
  assert.match(api, /yearMonth === state\.cashflowYearMonth && !state\.cashflowCategory\.loading/);
  assert.match(api, /if \(response\.yearMonth !== yearMonth\) throw invalidResponse/);
});

test('범위 보호: 네비게이터 라우트 등록·카테고리 메뉴·송금/Banking 코드는 이번 작업에서 바뀌지 않는다', () => {
  const navigator = readSource(NAVIGATOR);
  for (const route of ['DAILY_LIMIT', 'ANALYSIS', 'TRANSFER', 'ACCOUNT_OPEN']) {
    assert.equal(
      (navigator.match(new RegExp(`name=\\{ROUTES\\.${route}\\}`, 'g')) ?? []).length,
      1,
      route
    );
  }
  // 카테고리 화면의 "생활비 분석"은 기존대로 오늘의 가용금액(DAILY_LIMIT)으로 이동한다.
  assert.match(readSource('src/screens/category/CategoryScreen.js'), /ROUTES\.DAILY_LIMIT/);
  // 송금 미확정 보호는 그대로다.
  const api = code(API);
  assert.match(api, /pendingTransfer/);
  assert.match(api, /bankingApi\.requestTransfer\(request, \{ idempotencyKey: key \}\)/);
});
