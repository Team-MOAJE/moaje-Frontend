// Asset 화면(C-2: 홈·계좌 상세·계좌 선택 시트·거래 아이템/배지) 연결 정적 테스트.
// React 렌더러가 없어 JSX는 렌더링하지 않는다(렌더링·Android 동작은 미검증). 소스 문자열 정적 분석만 수행한다.
// 서버 호출 없음. C-3/C-4에서 History/Detail/Transfer 단언을 이어서 추가한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/assetUiWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));

const HOME = 'src/screens/home/HomeScreen.js';
const HOME_TAB = 'src/components/home/HomeAccountTab.js';
const DETAIL = 'src/screens/asset/AccountDetailScreen.js';
const VIEW = 'src/components/asset/AccountDetailView.js';
const SHEET = 'src/components/asset/AccountSelectorBottomSheet.js';
const ITEM = 'src/components/asset/TransactionListItem.js';
const BADGE = 'src/components/asset/TransactionStatusBadge.js';
const C2_FILES = [HOME, HOME_TAB, DETAIL, VIEW, SHEET, ITEM, BADGE];

test('홈: 총잔액 합산·표시와 계좌 연결/개설 코드가 없다', () => {
  const home = code(HOME);
  const tab = code(HOME_TAB);
  for (const source of [home, tab]) {
    assert.doesNotMatch(source, /\.reduce\(/);
    assert.doesNotMatch(source, /totalBalance/);
    assert.doesNotMatch(source, /Number\(/);
    assert.doesNotMatch(source, /createAccount|openAccount|계좌 연결|onConnectPress/);
  }
  assert.doesNotMatch(tab, /총 \$\{|`총 /);
  assert.doesNotMatch(tab, /formatKRW/);
  assert.match(home, /buildHomeAccountItems/);
  assert.match(home, /resolveHomeAccountsState/);
});

test('홈: 로딩·오류·빈 상태·목록 4분기와 재시도, 계좌 상세 이동은 문자열 accountId 전달', () => {
  const tab = code(HOME_TAB);
  for (const state of ['loading', 'error', 'empty', 'list']) {
    assert.match(tab, new RegExp(`state === '${state}'`));
  }
  assert.match(tab, /다시 시도/);
  assert.match(tab, /연결된 계좌가 없어요/);
  assert.match(tab, /계좌를 불러오지 못했어요/);
  const home = code(HOME);
  assert.match(home, /ROUTES\.ACCOUNT_DETAIL,\s*\{\s*accountId:\s*account\.id\s*\}/);
  assert.match(home, /dispatch\(fetchAccounts\(\)\)/);
});

test('홈: 은행명·토큰·전체 계좌번호를 임의로 만들지 않고, 서버 마스킹 번호(maskedAccountNumber)만 표시한다', () => {
  for (const file of [HOME, HOME_TAB]) {
    assert.doesNotMatch(
      code(file),
      /bankName|tokenId|(?<![A-Za-z])accountNumber|displayAccountNumber/
    );
  }
  assert.match(code(HOME_TAB), /account\.maskedAccountNumber/);
});

test('계좌 상세: API-11/API-14를 쓰고 isPrimary·accounts[0] 선택과 fetchAccounts 새로고침을 쓰지 않는다', () => {
  const detail = code(DETAIL);
  assert.match(detail, /fetchAccountDetail\(\{ accountId: selectedAccountId \}\)/);
  assert.match(detail, /refreshAccount\(\{ accountId: selectedAccountId \}\)/);
  assert.doesNotMatch(detail, /isPrimary|accounts\[0\]/);
  const handleRefresh = detail.slice(detail.indexOf('const handleRefresh'));
  const refreshBody = handleRefresh.slice(0, handleRefresh.indexOf('const handleBack'));
  assert.match(refreshBody, /refreshAccount/);
  // 계좌 목록이 없을 때의 재시도 외에는 새로고침이 fetchAccounts로 대체되지 않는다.
  assert.equal((refreshBody.match(/fetchAccounts\(\)/g) ?? []).length, 1);
});

test('계좌 상세: 목록에 없는 route accountId로 요청하지 않고, 다른 계좌의 상세는 쓰지 않는다', () => {
  const detail = code(DETAIL);
  // route 적용 대기 판단은 순수 함수(문자열 id + 목록 존재)이고, 적용 후 param을 소비한다.
  assert.match(detail, /hasPendingRouteSeed\(routeAccountId, accounts\)/);
  assert.match(
    readSource('src/features/asset/assetScreenLogic.js'),
    /accounts\.some\(account => account\.id === routeAccountId\)/
  );
  assert.match(detail, /accountDetailAccountId === selectedAccountId/);
  assert.match(detail, /selectedAccountId == null/);
  assert.doesNotMatch(detail, /(?<![A-Za-z])Number\(|parseInt\(|parseFloat\(/);
});

test('계좌 상세: 송금은 ACTIVE 계좌만, 거래내역·거래 상세에는 accountId를 전달한다', () => {
  const detail = code(DETAIL);
  assert.match(detail, /canTransferFrom\(selectedAccount\)/);
  assert.match(detail, /if \(!canTransfer\) return;/);
  assert.match(detail, /ROUTES\.TRANSACTION_HISTORY,\s*\{\s*accountId:\s*selectedAccountId\s*\}/);
  assert.match(detail, /ROUTES\.TRANSACTION_DETAIL,\s*\{[^}]*accountId:\s*selectedAccountId/);
  assert.match(detail, /onTransactionPress=\{detail \? handleTransactionPress : undefined\}/);
  const view = code(VIEW);
  assert.match(view, /disabled=\{!canTransfer\}/);
  assert.match(view, /조회만 가능한 계좌예요/);
});

test('계좌 상세/시트/홈: 은행명을 직접 만들지 않고, 번호는 서버 마스킹 값(목록·시트)과 정규화된 실제 번호(상세)만 쓰며 ACCOUNT-{id}는 렌더하지 않는다', () => {
  for (const file of [HOME, HOME_TAB, DETAIL, VIEW, SHEET]) {
    const source = code(file);
    assert.doesNotMatch(source, /bankName/, file);
    assert.doesNotMatch(source, /displayAccountNumber/, file);
    assert.doesNotMatch(source, /ACCOUNT-/, file);
  }
  // 상세에는 마스킹 번호를 대신 쓰지 않는다(실제 번호가 없으면 '-' 표시와 복사 비활성).
  for (const file of [DETAIL, VIEW]) {
    assert.doesNotMatch(code(file), /maskedAccountNumber/, file);
  }
  // 목록(홈 탭·선택 시트)에는 전체 번호가 전달되지 않는다.
  for (const file of [HOME_TAB, SHEET]) {
    assert.doesNotMatch(code(file), /(?<![A-Za-z])accountNumber/, file);
  }
});

test('계좌 상세: 잔액은 balanceExact 기준 표시값을 쓰고 formatKRW로 직접 변환하지 않는다', () => {
  assert.match(
    code(DETAIL),
    /formatExactMoney\(balanceSource\.balance, balanceSource\.balanceExact\)/
  );
  assert.doesNotMatch(code(VIEW), /formatKRW/);
  assert.match(code(VIEW), /\{balanceText\}/);
});

test('계좌 상세: 동기화 상태·상태 안내가 서버 값 기반 함수로 만들어진다', () => {
  const detail = code(DETAIL);
  assert.match(detail, /describeSyncStatus\(detail\)/);
  assert.match(detail, /getAccountStatusNotice\(selectedAccount\)/);
  assert.match(detail, /refreshingAccountId === selectedAccountId/);
});

test('계좌 선택 시트: 정적 라벨과 상태 배지만 쓰고 조회용 선택임을 명시한다', () => {
  const sheet = code(SHEET);
  assert.match(sheet, /account\.label/);
  assert.match(sheet, /getAccountStatusLabel/);
  assert.match(sheet, /getAccountStatusNotice/);
  assert.doesNotMatch(sheet, /canTransferFrom/);
  assert.match(readSource(SHEET), /조회용 계좌 선택/);
});

test('거래 아이템/배지: failed·canceled를 구분하고 없는 필드·null 크래시 경로를 쓰지 않는다', () => {
  const item = code(ITEM);
  const badge = code(BADGE);
  for (const source of [item, badge]) {
    assert.match(source, /failed:/);
    assert.match(source, /canceled:/);
  }
  assert.match(badge, /label: '실패'/);
  assert.match(badge, /label: '취소됨'/);
  assert.doesNotMatch(item, /tx\.time|tx\.description|toLocaleString/);
  assert.match(item, /formatTxAmount\(tx\)/);
  assert.match(item, /formatServerDateTime\(tx\.createdAt\)/);
  assert.match(item, /resolveTxTitle\(tx\)/);
  assert.match(item, /mapTransactionStatus\(tx\.status, tx\.type\)/);
  assert.doesNotMatch(item, /formatDateTime|new Date/);
});

test('C-2 화면 파일은 서버 데이터를 useState/모듈 전역에 복사하지 않는다', () => {
  for (const file of C2_FILES) {
    const source = code(file);
    assert.doesNotMatch(source, /useState\([^)]*(accounts|transactions|detail|balance)/i, file);
    assert.doesNotMatch(source, /^(let|var) /m, file);
  }
});

test('C-2 화면 파일은 구형/제외 API와 Auth·Work 모듈을 import하지 않는다', () => {
  for (const file of C2_FILES) {
    const source = code(file);
    assert.doesNotMatch(source, /fetchAccountSummary|fetchAvailableBalance|transferFunds/, file);
    assert.doesNotMatch(source, /features\/auth|features\/work\/(?!workApi)/, file);
  }
});

test('네비게이터·라우트 정의는 C-2에서 계약을 바꾸지 않는다', () => {
  const navigator = readSource('src/navigation/MainNavigator.js');
  for (const route of ['ACCOUNT_DETAIL', 'TRANSFER', 'TRANSACTION_HISTORY', 'TRANSACTION_DETAIL']) {
    assert.match(navigator, new RegExp(`name=\\{ROUTES\\.${route}\\}`));
  }
});
// ═══════════════════════════════════════════════════════════════
// C-3: 거래내역(History)·거래 상세(Detail) 연결 정적 테스트 + 상세 reducer 소스 단언
// 렌더링·Android는 미검증. effect deps/가드/요청 지점은 소스 구조로 고정하고, 요청 횟수는
// assetSlice.test.mjs의 프로토콜 모델 테스트가 검증한다(두 테스트가 같은 규칙을 가리키도록 토큰을 고정).
// ═══════════════════════════════════════════════════════════════

const HISTORY = 'src/screens/asset/TransactionHistoryScreen.js';
const TX_DETAIL = 'src/screens/asset/TransactionDetailScreen.js';
const SLICE = 'src/features/asset/assetSlice.js';
const C3_FILES = [HISTORY, TX_DETAIL];

const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${from} 를 찾을 수 없음`);
  const end = to === undefined ? source.length : source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${to} 를 찾을 수 없음`);
  return source.slice(start, end);
};

// useEffect(() => { ... }, [deps]) 목록. 본문과 deps(공백 정리)를 돌려준다.
const effectsOf = source => {
  const found = [];
  const pattern = /useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\);/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    found.push({
      body: match[1],
      deps: match[2]
        .split(',')
        .map(dep => dep.trim())
        .filter(Boolean),
    });
  }
  return found;
};

// fetchTransactions( ... ) 호출을 괄호 짝으로 추출한다(인자 안의 템플릿 ${}가 있어 정규식으로는 끝을 찾기 어렵다).
const fetchTransactionsCalls = source => {
  const calls = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('fetchTransactions(', from);
    if (start === -1) return calls;
    let depth = 0;
    let end = start + 'fetchTransactions'.length;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')' && --depth === 0) break;
    }
    calls.push(source.slice(start, end + 1));
    from = end + 1;
  }
};

test('C-3 History: 구형 요약·page/size·서버 기간 필터·상대 날짜·계좌 연결·사용 가능 금액 코드가 없다', () => {
  const source = code(HISTORY);
  assert.doesNotMatch(source, /fetchAccountSummary|fetchAvailableBalance|selectDefaultAccount/);
  assert.doesNotMatch(source, /state\.asset\.summary|bankName|tokenId|maskedAccountNumber/);
  assert.doesNotMatch(source, /toLocaleString|new Date\(|getGroup|formatDateTime|requestedAt/);
  assert.doesNotMatch(source, /createAccount|openAccount|onConnectPress/);
  const raw = readSource(HISTORY);
  assert.doesNotMatch(source, /계좌 연결|사용 가능 금액/);
  for (const call of fetchTransactionsCalls(source)) {
    assert.doesNotMatch(call, /page|size|dateRange|startDate|endDate|period/, call);
  }
  assert.match(raw, /불러온 거래 기준으로 표시돼요/);
});

test('C-3 History: C-1 공통 로직(대상 결정·기간/유형 필터·그룹·금액·날짜·제목)을 재사용한다', () => {
  const source = code(HISTORY);
  for (const name of [
    'resolveHistoryTarget',
    'buildHistoryViewModel',
    'formatTxAmount',
    'txAmountTone',
    'resolveTxTitle',
    'getTxTypeLabel',
    'formatServerDateTime',
    'formatExactMoney',
    'getAccountStatusLabel',
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`), name);
  }
  assert.match(source, /mapTransactionStatus\(tx\.status, tx\.type\)/);
  assert.match(source, /period: dateRange/);
  // 기간·유형 필터는 클라이언트에서만: dateRange/filter/periodType는 어떤 effect의 deps도 아니다.
  for (const effect of effectsOf(source)) {
    for (const dep of effect.deps) {
      assert.doesNotMatch(dep, /^(dateRange|filter|periodType|customStartKey|customEndKey)$/);
    }
  }
});

test('C-3 History: 첫 페이지 요청은 effect 한 곳(요청 키 게이트)이며 deps에 계좌 로딩·기간이 없다', () => {
  const source = code(HISTORY);
  const calls = fetchTransactionsCalls(source);
  assert.equal(calls.length, 2, '첫 페이지 effect 1 + 다음 페이지 요청 1');
  const firstPageCalls = calls.filter(call => !/cursor/.test(call));
  assert.equal(firstPageCalls.length, 1);

  const firstPageEffects = effectsOf(source).filter(effect =>
    /fetchTransactions\(/.test(effect.body)
  );
  assert.equal(firstPageEffects.length, 1);
  const [effect] = firstPageEffects;
  assert.deepEqual(effect.deps, [
    'dispatch',
    'sessionGeneration',
    'readyAccountId',
    'routeSeedPending',
    'refreshGeneration',
    'accountDataVersion',
  ]);
  // 키 기록이 dispatch보다 앞서고(동기 차단), ready가 아니면 키·재시도 의도를 폐기한다.
  assert.match(
    effect.body,
    /const requestKey = `\$\{sessionGeneration\}#\$\{readyAccountId\}#\$\{refreshGeneration\}#\$\{accountDataVersion\}`/
  );
  assert.match(effect.body, /if \(lastRequestKeyRef\.current === requestKey\) return;/);
  assert.ok(
    effect.body.indexOf('lastRequestKeyRef.current = requestKey') <
      effect.body.indexOf('fetchTransactions('),
    '키는 dispatch 전에 기록'
  );
  assert.match(
    effect.body,
    /if \(readyAccountId === null \|\| routeSeedPending\) \{[^}]*lastRequestKeyRef\.current = null;[^}]*retryPendingRef\.current = false;/
  );
  // beginTransactionsRefresh / resetTransactions는 첫 페이지 요청과 같은 effect에서만 쌍으로 쓰인다.
  assert.match(effect.body, /beginTransactionsRefresh\(\)/);
  assert.match(effect.body, /resetTransactions\(/);
  assert.equal((source.match(/beginTransactionsRefresh\(\)/g) ?? []).length, 1);
  assert.equal((source.match(/resetTransactions\(/g) ?? []).length, 1);
  // 요청 종류 표시가 dispatch와 같은 블록에 있다.
  assert.ok(
    effect.body.indexOf("setLastRequestKind('first')") < effect.body.indexOf('fetchTransactions(')
  );
});

test('C-3 History: 새로고침은 계좌 목록을 직렬로 확인한 뒤 세대만 올리고, 거래를 직접 요청하지 않는다', () => {
  const source = code(HISTORY);
  const refresh = between(source, 'const handleRefresh', 'const handleFirstPageRetry');
  assert.doesNotMatch(
    refresh,
    /fetchTransactions|beginTransactionsRefresh|resetTransactions|Promise\.all/
  );
  assert.match(refresh, /await dispatch\(fetchAccounts\(\)\)/);
  assert.match(refresh, /fetchAccounts\.fulfilled\.match\(result\)/);
  assert.match(refresh, /mountedRef\.current/);
  assert.match(refresh, /store\.getState\(\)\.asset/);
  assert.match(refresh, /setRefreshGeneration\(/);
  assert.match(refresh, /finally \{/);
  assert.match(refresh, /isRefreshingRef\.current \|\| accountsLoading \|\| transactionsLoading/);
});

test('C-3 History: 첫 페이지 다시 시도는 세대만 올리고, 다음 페이지 재시도는 기존 cursor를 쓰며 오류 종류를 구분한다', () => {
  const source = code(HISTORY);
  const retry = between(source, 'const handleFirstPageRetry', 'const requestNextPage');
  assert.doesNotMatch(retry, /fetchTransactions|beginTransactionsRefresh|resetTransactions/);
  assert.match(retry, /retryPendingRef\.current = true;/);
  assert.match(retry, /setRefreshGeneration\(/);

  const next = between(source, 'const requestNextPage', 'const handleAccountsRetry');
  assert.match(next, /cursor: transactionsNextCursor/);
  assert.match(next, /!transactionsHasNext \|\| transactionsLoading \|\| transactionsLoadingMore/);
  assert.ok(next.indexOf("setLastRequestKind('more')") < next.indexOf('fetchTransactions('));
  assert.match(next, /transactionsAccountId !== readyAccountId/);
  assert.match(source, /const handleNextPageRetry = requestNextPage;/);
  // 오류 뒤에는 onEndReached가 자동으로 다시 요청하지 않는다.
  assert.match(
    between(source, 'const handleEndReached', 'const handleNextPageRetry'),
    /if \(transactionsError\) return;/
  );
  assert.match(source, /lastRequestKind === 'first'/);
  assert.match(source, /lastRequestKind === 'more'/);
});

test('C-3 History: route accountId는 목록 존재를 검증하고, 없으면 대체하지 않으며, 상세에는 문자열 params를 전달한다', () => {
  const source = code(HISTORY);
  assert.match(source, /accounts\.some\(account => account\.id === routeAccountId\)/);
  assert.match(source, /routeAccountMissing/);
  assert.match(source, /dispatch\(setSelectedAccountId\(routeAccountId\)\)/);
  assert.match(
    source,
    /navigate\(ROUTES\.TRANSACTION_DETAIL,\s*\{\s*accountId: readyAccountId,\s*transactionId: tx\.id,?\s*\}\)/
  );
  assert.doesNotMatch(source, /(?<![A-Za-z])Number\(|parseInt\(|parseFloat\(/);
  // 모든 상태의 거래 행을 누를 수 있다(pending/checking 탭 차단 없음).
  assert.doesNotMatch(source, /=== 'checking'|=== 'pending'/);
  assert.match(source, /onPress=\{\(\) => handleTxPress\(t\)\}/);
  // 다른 계좌의 목록 잔상을 보여주지 않는다.
  assert.match(source, /transactionsAccountId === readyAccountId \? transactions : \[\]/);
});

test('C-3 History: 서버 데이터를 useState/모듈 전역에 복사하지 않고 구형/제외 API·Auth·Work를 쓰지 않는다', () => {
  for (const file of C3_FILES) {
    const source = code(file);
    assert.doesNotMatch(source, /useState\([^)]*(accounts|transactions|detail|balance)/i, file);
    assert.doesNotMatch(source, /^(let|var) /m, file);
    assert.doesNotMatch(source, /fetchAccountSummary|fetchAvailableBalance|transferFunds/, file);
    assert.doesNotMatch(source, /features\/auth|features\/work\//, file);
  }
});

test('C-3 Detail: 필수 params 둘 다 문자열일 때만 요청하고 Number 변환·선택 계좌 대체가 없다', () => {
  const source = code(TX_DETAIL);
  assert.match(source, /isNonEmptyString\(accountId\) && isNonEmptyString\(transactionId\)/);
  assert.doesNotMatch(source, /(?<![A-Za-z])Number\(|parseInt\(|parseFloat\(/);
  assert.doesNotMatch(source, /selectedAccountId/);
  assert.match(source, /fetchTransactionDetail\(\{ accountId, transactionId \}\)/);
});

test('C-3 Detail: 요청 effect는 accountsLoading에 의존하지 않고 세션·계좌·거래 키당 1회이며 자동 재시도가 없다', () => {
  const source = code(TX_DETAIL);
  const effects = effectsOf(source);
  const requestEffects = effects.filter(effect => /fetchTransactionDetail\(/.test(effect.body));
  assert.equal(requestEffects.length, 1);
  const [effect] = requestEffects;
  assert.deepEqual(effect.deps, [
    'dispatch',
    'sessionGeneration',
    'accountId',
    'transactionId',
    'accountKnown',
  ]);
  assert.doesNotMatch(
    effect.body,
    /\baccountsLoading\b|\baccountsError\b|\baccounts\b|\btransactionDetail\b|transactionDetailError|transactionDetailLoading|requestLive/
  );
  assert.match(
    effect.body,
    /const key = `\$\{sessionGeneration\}\|\$\{accountId\}\|\$\{transactionId\}`/
  );
  assert.match(
    effect.body,
    /if \(!valid \|\| !accountKnown\) \{[^}]*lastRequestKeyRef\.current = null;/
  );
  assert.match(effect.body, /if \(lastRequestKeyRef\.current !== key\) \{/);
  const keyIndex = effect.body.indexOf('lastRequestKeyRef.current = key');
  assert.ok(keyIndex !== -1 && keyIndex < effect.body.indexOf('fetchTransactionDetail('));
  assert.ok(
    effect.body.indexOf('setRequestedKey(key)') < effect.body.indexOf('fetchTransactionDetail(')
  );
  // cleanup: 키 폐기 + 상세 초기화(늦은 응답 무효화)
  assert.match(
    effect.body,
    /return \(\) => \{[\s\S]*lastRequestKeyRef\.current = null;[\s\S]*clearTransactionDetail\(\)/
  );
  // 오류·무효화·로딩 상태 변화는 어떤 effect의 deps도 아니다 → 자동 재시도 불가
  for (const item of effects) {
    for (const dep of item.deps) {
      assert.doesNotMatch(
        dep,
        /^(accounts|accountsLoading|accountsError|transactionDetail|transactionDetailError|transactionDetailLoading|transactionDetailRequestId|requestedKey)$/
      );
    }
  }
});

test('C-3 Detail: 계좌 목록은 마운트 시 1회와 다시 시도에서만 조회한다', () => {
  const source = code(TX_DETAIL);
  assert.equal((source.match(/dispatch\(fetchAccounts\(\)\)/g) ?? []).length, 2);
  const mount = effectsOf(source).find(effect => /fetchAccounts\(\)/.test(effect.body));
  assert.deepEqual(mount.deps, ['dispatch']);
  assert.match(mount.body, /accountsRequestedRef/);
  assert.match(mount.body, /accounts\.length === 0 && !accountsLoading/);
  assert.match(mount.body, /setAccountsObserved\(true\)/);
  const retry = between(source, 'const handleRetry', "if (viewKind === 'accountsWait'");
  assert.match(retry, /if \(requestLive\) return;/);
  assert.match(retry, /if \(!accountsLoading\) dispatch\(fetchAccounts\(\)\)/);
  assert.match(retry, /lastRequestKeyRef\.current = currentKey;/);
  assert.match(retry, /fetchTransactionDetail\(\{ accountId, transactionId \}\)/);
});

test('C-3 Detail: 상태 6종(8개 viewKind)이 구분되고 무효화 상태는 로딩이 아니라 안내+다시 시도다', () => {
  const source = code(TX_DETAIL);
  for (const kind of [
    'invalid',
    'accountsWait',
    'accountsError',
    'ready',
    'loading',
    'error',
    'preRequest',
    'invalidated',
  ]) {
    assert.match(source, new RegExp(`viewKind = '${kind}'`), kind);
  }
  // ①(요청 전)과 ⑤(무효화)는 requestedKey 비교로만 구분한다.
  assert.match(source, /else if \(requestedKey !== currentKey\) viewKind = 'preRequest';/);
  assert.match(source, /else viewKind = 'invalidated';/);
  // 로딩 화면은 accountsWait / loading / preRequest에서만.
  assert.match(
    source,
    /if \(viewKind === 'accountsWait' \|\| viewKind === 'loading' \|\| viewKind === 'preRequest'\) \{\s*return <StateScreen loading/
  );
  assert.equal((source.match(/<StateScreen\s+loading/g) ?? []).length, 1);
  const invalidated = between(source, "if (viewKind === 'invalidated')", 'const apiStatus');
  assert.doesNotMatch(invalidated, /loading/);
  assert.match(invalidated, /actionLabel="다시 시도"/);
  const failure = between(source, "if (viewKind === 'error')", "if (viewKind === 'invalidated')");
  assert.match(failure, /actionLabel="다시 시도"/);
  // 진행 중 표시는 실제 요청이 살아 있을 때만.
  assert.match(
    source,
    /const requestLive = transactionDetailLoading && transactionDetailRequestId !== null;/
  );
  // accountKnown이면 accountsLoading은 판별에 쓰이지 않는다.
  assert.match(
    source,
    /else if \(!accountKnown\) \{\s*if \(!accountsSettled\) viewKind = 'accountsWait';/
  );
});

test('C-3 Detail: 현재 params와 일치하는 상세만 렌더하고 서버에 없는 값(메모·수수료·완료 시각)을 만들지 않는다', () => {
  const source = code(TX_DETAIL);
  assert.match(source, /transactionDetailAccountId === accountId/);
  assert.match(source, /transactionDetail\.id === transactionId/);
  assert.doesNotMatch(source, /memo|fee|completedAt|toLocaleString|amount \?\? 0|amount >/);
  for (const name of [
    'formatTxAmount',
    'resolveTxTitle',
    'formatServerDateTime',
    'getTxTypeLabel',
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`), name);
  }
  assert.match(
    source,
    /mapTransactionStatus\(transactionDetail\.status, transactionDetail\.type\)/
  );
  for (const [key, label] of [
    ['failed', '실패'],
    ['canceled', '취소됨'],
    ['pending', '처리 중'],
    ['checking', '확인 중'],
    ['completed', '완료'],
  ]) {
    assert.match(source, new RegExp(`${key}: \\{[^}]*statusLabel: '${label}'`), key);
  }
  assert.match(source, /txAmountTone\(transactionDetail\) === 'positive'/);
});

test('C-3 상세 reducer: selectedAccountId 비교 없이 requestId·요청 식별·계좌 존재로 검증한다', () => {
  const source = code(SLICE);
  const block = between(
    source,
    '.addCase(fetchTransactionDetail.pending',
    '.addCase(transferFunds.pending'
  );
  assert.doesNotMatch(block, /selectedAccountId/);
  assert.equal(
    (block.match(/isCurrentRequest\(state\.transactionDetailRequestId, action\)/g) ?? []).length,
    2
  );
  assert.match(block, /state\.accounts\.some\(account => account\.id === accountId\)/);
  assert.match(block, /requested\.accountId == null \|\| requested\.accountId === accountId/);
  assert.match(block, /String\(normalized\.id\) === requested\.transactionId/);
  // 보존되어야 하는 기존 가드
  const full = readSource(SLICE);
  assert.match(full, /clearTransactionDetail: state =>/);
  assert.match(full, /state\.transactionDetailRequestId = null;/);
  assert.match(full, /\.addCase\(logoutUser\.pending, resetAssetState\)/);
});

test('C-3 범위: History/Detail은 C-3 화면 간 이동 계약만 따르고 네비게이터 라우트 선언은 유지된다', () => {
  const navigator = readSource('src/navigation/MainNavigator.js');
  for (const route of ['TRANSACTION_HISTORY', 'TRANSACTION_DETAIL']) {
    assert.match(navigator, new RegExp(`name=\\{ROUTES\\.${route}\\}`));
  }
  // AccountDetail(C-2)이 전달하는 params를 Detail이 그대로 사용한다.
  assert.match(code(DETAIL), /accountId: selectedAccountId,\s*transactionId: tx\.id/);
});
// ── C-4: TransferScreen (출금 계좌 고정·차단, 잔액 정밀도, 송금 계약 보존) ─────────────────
const TRANSFER = 'src/screens/asset/TransferScreen.js';

test('C-4 Transfer: 구형 표시(계좌 은행명 추측·0원 대체·계좌번호·tokenId)와 숫자 변환이 없다', () => {
  const source = code(TRANSFER);
  assert.doesNotMatch(source, /tokenId|maskedAccountNumber|displayAccountNumber|ACCOUNT-/);
  // 은행명은 서버 계좌 정보(라벨)나 가상 은행 목록 조회로만 얻고, 계좌 ID 등으로 추측하지 않는다.
  assert.doesNotMatch(source, /bankName\s*:|selectedAccount\.bankName|account\.bankName/);
  for (const match of source.matchAll(/.*bankName.*/g)) {
    assert.match(match[0], /getVirtualBankByCode\(|shownBankName|bankLabel/, match[0]);
  }
  assert.doesNotMatch(source, /balance\s*\?\?\s*0|\?\?\s*0\)/);
  assert.doesNotMatch(source, /Number\(\s*(selectedAccount|fromParam|requested|pinned)/);
  assert.doesNotMatch(source, /parseInt\(\s*(selectedAccount|fromParam|requested|pinned)/);
  assert.doesNotMatch(source, /resolveActiveAccount/);
  assert.match(
    source,
    /formatExactMoney\(selectedAccount\.balance, selectedAccount\.balanceExact\)/
  );
  assert.match(source, /selectedAccount\.label \?\? '내 계좌'/);
});

test('C-4 Transfer: 출금 계좌 판별은 파라미터 존재와 형식을 분리하고 다른 계좌로 대체하지 않는다', () => {
  const source = code(TRANSFER);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(routeParams, 'fromAccountId'\)/);
  // 형식 검증은 순수 함수 resolveTransferFromId에 있다(파라미터 존재와 형식을 분리).
  assert.match(source, /resolveTransferFromId\(\{/);
  assert.match(
    readSource('src/features/asset/assetScreenLogic.js'),
    /typeof fromParam === 'string' && fromParam\.trim\(\)\.length > 0/
  );
  assert.match(source, /canTransferFrom\(requestedAccount\) \? requestedAccount : null/);
  // 파라미터가 있는 경우에는 선택값(pinned)·기본 계좌 폴백을 쓰지 않는다.
  assert.match(source, /if \(hasFromParam\) return;/);
  assert.match(source, /const fromInvalid =\s/);
  // 고정값은 id 문자열 + sessionGeneration만 보관한다(계좌 객체·잔액 복사 금지).
  assert.match(source, /setPinned\(\{ generation: sessionGeneration, id: first\.id \}\)/);
  assert.equal((source.match(/setPinned\(/g) ?? []).length, 1);
  assert.match(source, /pinned\.generation === sessionGeneration/);
  assert.match(source, /useState\(null\)/);
  assert.doesNotMatch(source, /useState\(\s*(accounts|selectedAccount|requestedAccount)/);
});

test('C-4 Transfer: 상태 분기, 전액 버튼 가드, 송금 버튼 활성 조건', () => {
  const source = code(TRANSFER);
  for (const kind of ['loading', 'error', 'empty', 'noActive', 'fromInvalid', 'ready']) {
    assert.match(source, new RegExp(`'${kind}'`), kind);
  }
  assert.match(source, /resolveHomeAccountsState\(\{/);
  assert.match(source, /출금 계좌를 확인해 주세요/);
  assert.match(source, /selectedAccount\.balanceExact === true/);
  assert.match(source, /Number\.isSafeInteger\(selectedAccount\.balance\)/);
  // 전액 버튼: 정확한 잔액이 없으면 동작·활성화되지 않고, 미확정 송금이 있어도 잠긴다.
  assert.match(source, /if \(hasPending \|\| maxAmount == null\) return;/);
  assert.match(source, /disabled=\{hasPending \|\| maxAmount == null\}/);
  assert.match(source, /!!selectedAccount &&\s*accountViewKind === 'ready'/);
  assert.match(source, /!canTransferFrom\(selectedAccount\)\) return;/);
  // fetchAccounts: 마운트 1회 + 다시 시도 + (기존) 송금 성공 후 갱신
  assert.equal((source.match(/dispatch\(fetchAccounts\(\)\)/g) ?? []).length, 3);
});

test('C-4 Transfer: API-10 송금 계약과 멱등성 키 흐름(입력 변경 시 새 키, 확정 후에만 지움)이 유지된다', () => {
  const source = code(TRANSFER);
  assert.match(
    source,
    /submitTransfer\(\{\s*withdrawalAccountId: selectedAccount\.id,\s*depositBankCode,\s*depositAccountNumber,\s*amount,\s*idempotencyKey: getCurrentTransferKey\(\),\s*\}\)/
  );
  // 서버 계약에 없는 값(수취인 이름·메모)은 송금 요청에 전달하지 않는다.
  assert.doesNotMatch(source, /toRecipient|fromAccountId: selectedAccount|memo,\s*idempotencyKey/);
  assert.match(source, /pendingIdempotencyKeyRef = useRef\(null\)/);
  assert.match(source, /ensureIdempotencyKey\(pendingIdempotencyKeyRef\.current\)/);
  // 금액·입금 은행·입금 계좌가 바뀌면 키를 새로 만든다(메모는 요청에 없으므로 키에 영향이 없다).
  for (const handler of [
    'handleAmountChange',
    'handleQuickAmount',
    'handleDepositBankSelect',
    'handleDepositAccountChange',
  ]) {
    assert.match(
      source,
      new RegExp(`const ${handler} = [\\s\\S]*?clearPendingTransferKey\\(\\);`),
      handler
    );
  }
  // 미확정 송금이 있으면 입력 변경 핸들러가 키를 지우지 못하고 먼저 return한다.
  for (const handler of [
    'handleAmountChange',
    'handleQuickAmount',
    'handleMaxAmount',
    'handleDepositBankSelect',
    'handleDepositAccountChange',
  ]) {
    assert.match(
      source,
      new RegExp(`const ${handler} = [^\\n]*\\{\\s*if \\(hasPending[^\\n]*return;`),
      handler
    );
  }
  assert.match(readSource(TRANSFER), /서버 계약에 없는 값|요청 본문에 없으므로/);
  const api = code('src/features/asset/assetApi.js');
  assert.match(api, /bankingApi\.requestTransfer\(request, \{ idempotencyKey: key \}\)/);
  assert.doesNotMatch(api, /API_ENDPOINTS\.TRANSFER\.CREATE/);
});

test('C-4 Transfer: COMPLETED만 완료 처리하고, 처리 중·결과 불명·FAILED·REVERSED는 완료로 표시하지 않는다', () => {
  const source = code(TRANSFER);
  const submit = between(source, 'const submitTransfer', 'const handleTransferPress');
  // 완료 안내와 goBack은 COMPLETED 분기 안에서만 나온다.
  const completedBranch = between(
    submit,
    'if (outcome === TRANSFER_OUTCOME.COMPLETED) {',
    'return;'
  );
  assert.match(completedBranch, /navigation\.goBack\(\)/);
  assert.match(completedBranch, /dispatch\(fetchAccounts\(\)\)/);
  assert.equal((submit.match(/navigation\.goBack\(\)/g) ?? []).length, 1);
  assert.equal((submit.match(/dispatch\(fetchAccounts\(\)\)/g) ?? []).length, 1);
  assert.match(submit, /classifyTransferStatus\(result\.payload\.transfer\.status\)/);
  assert.match(submit, /TRANSFER_ERROR_OUTCOME\.BLOCKED/);
  assert.match(submit, /TRANSFER_ERROR_OUTCOME\.UNCERTAIN/);
  // 미확정이면 같은 요청 재확인만: 자동 재전송 없음(재확인은 사용자 press 핸들러에서만).
  const press = between(source, 'const handleTransferPress', 'const handleBottomHomePress');
  assert.match(press, /submitTransfer\(\{ recheckPending: true \}\)/);
  assert.equal((source.match(/recheckPending/g) ?? []).length, 1);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
  assert.match(source, /같은 요청 다시 확인/);
});

// 화면 규칙 모델: 소스의 판별 규칙(위 정적 테스트가 토큰을 고정)을 순수 함수로 옮겨 시나리오를 검증한다.
const transferAccount = (id, status = 'ACTIVE') => ({
  id,
  status,
  label: `내 계좌 ${id}`,
});
const defaultActive = accounts => accounts.find(a => a.status === 'ACTIVE') ?? null;
const nextPinned = ({ params, pinned, generation, accounts }) => {
  if (params != null && Object.prototype.hasOwnProperty.call(params, 'fromAccountId'))
    return pinned;
  if (pinned && pinned.generation === generation) return pinned;
  const first = defaultActive(accounts);
  return first ? { generation, id: first.id } : pinned;
};
const resolveTransferSource = ({ params, pinned, generation, accounts }) => {
  const has = params != null && Object.prototype.hasOwnProperty.call(params, 'fromAccountId');
  const fromParam = has ? params.fromAccountId : null;
  const valid = !has || (typeof fromParam === 'string' && fromParam.trim().length > 0);
  const pinnedId = pinned && pinned.generation === generation ? pinned.id : null;
  const requestedId = has ? (valid ? fromParam : null) : pinnedId;
  const requested = requestedId == null ? null : (accounts.find(a => a.id === requestedId) ?? null);
  const selected = requested && requested.status === 'ACTIVE' ? requested : null;
  const invalid = (has && !valid) || (requestedId != null && !selected);
  return { selectedId: selected?.id ?? null, invalid };
};

test('C-4 모델: 일반 진입은 최초 ACTIVE 계좌를 고정하고 비활성화·삭제돼도 다른 계좌로 바뀌지 않는다', () => {
  let accounts = [transferAccount('A'), transferAccount('B')];
  let pinned = null;
  pinned = nextPinned({ params: undefined, pinned, generation: 1, accounts });
  assert.deepEqual(pinned, { generation: 1, id: 'A' });
  assert.deepEqual(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 1,
      accounts,
    }),
    {
      selectedId: 'A',
      invalid: false,
    }
  );
  // 목록 갱신(참조 교체)에도 선택 유지
  accounts = [transferAccount('A'), transferAccount('B')];
  pinned = nextPinned({ params: undefined, pinned, generation: 1, accounts });
  assert.equal(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 1,
      accounts,
    }).selectedId,
    'A'
  );
  // A 비활성화, B는 ACTIVE → B로 바뀌지 않고 차단
  accounts = [transferAccount('A', 'SUSPENDED'), transferAccount('B')];
  pinned = nextPinned({ params: undefined, pinned, generation: 1, accounts });
  assert.deepEqual(pinned, { generation: 1, id: 'A' });
  assert.deepEqual(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 1,
      accounts,
    }),
    {
      selectedId: null,
      invalid: true,
    }
  );
  // CLOSED도 동일
  accounts = [transferAccount('A', 'CLOSED'), transferAccount('B')];
  assert.equal(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 1,
      accounts,
    }).invalid,
    true
  );
  // A 삭제 → 차단
  accounts = [transferAccount('B')];
  pinned = nextPinned({ params: undefined, pinned, generation: 1, accounts });
  assert.deepEqual(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 1,
      accounts,
    }),
    {
      selectedId: null,
      invalid: true,
    }
  );
});

test('C-4 모델: 계좌 로딩 중에는 고정하지 않고, 목록이 도착하면 최초 ACTIVE 1개를 고정한다', () => {
  let pinned = nextPinned({
    params: undefined,
    pinned: null,
    generation: 1,
    accounts: [],
  });
  assert.equal(pinned, null);
  const accounts = [transferAccount('X', 'SUSPENDED'), transferAccount('Y')];
  pinned = nextPinned({ params: undefined, pinned, generation: 1, accounts });
  assert.deepEqual(pinned, { generation: 1, id: 'Y' });
  assert.equal(
    resolveTransferSource({
      params: undefined,
      pinned: null,
      generation: 1,
      accounts,
    }).invalid,
    false
  );
  assert.equal(
    resolveTransferSource({
      params: undefined,
      pinned: null,
      generation: 1,
      accounts,
    }).selectedId,
    null
  );
});

test('C-4 모델: 명시된 fromAccountId는 형식·존재·ACTIVE를 모두 만족할 때만 쓰고 절대 대체하지 않는다', () => {
  const accounts = [
    transferAccount('A', 'SUSPENDED'),
    transferAccount('B'),
    transferAccount('9223372036854775807'),
  ];
  const run = params => resolveTransferSource({ params, pinned: null, generation: 1, accounts });
  assert.deepEqual(run({ fromAccountId: 'B' }), {
    selectedId: 'B',
    invalid: false,
  });
  assert.deepEqual(run({ fromAccountId: '9223372036854775807' }), {
    selectedId: '9223372036854775807',
    invalid: false,
  });
  for (const bad of [123, '', '   ', null, undefined, {}, [], true]) {
    assert.deepEqual(run({ fromAccountId: bad }), { selectedId: null, invalid: true }, String(bad));
  }
  assert.deepEqual(run({ fromAccountId: 'Z' }), {
    selectedId: null,
    invalid: true,
  }); // 미존재
  assert.deepEqual(run({ fromAccountId: 'A' }), {
    selectedId: null,
    invalid: true,
  }); // SUSPENDED
  // 파라미터가 없을 때만 일반 진입(빈 params 객체 포함)
  assert.equal(run({}).invalid, false);
  assert.equal(run(undefined).invalid, false);
  // 명시 파라미터가 있으면 고정값이 있어도 사용하지 않는다
  const withPin = resolveTransferSource({
    params: { fromAccountId: 'A' },
    pinned: { generation: 1, id: 'B' },
    generation: 1,
    accounts,
  });
  assert.deepEqual(withPin, { selectedId: null, invalid: true });
  assert.deepEqual(
    nextPinned({
      params: { fromAccountId: 'A' },
      pinned: null,
      generation: 1,
      accounts,
    }),
    null
  );
});

test('C-4 모델: 로그아웃 후 다른 사용자 로그인 시 이전 출금 계좌 선택값을 재사용하지 않는다', () => {
  const accountsA = [transferAccount('7'), transferAccount('8')];
  let pinned = nextPinned({
    params: undefined,
    pinned: null,
    generation: 1,
    accounts: accountsA,
  });
  assert.equal(pinned.id, '7');
  // 사용자 B(같은 id '7'을 가진 다른 사용자, sessionGeneration 증가) — 이전 고정값은 즉시 무시
  const accountsB = [transferAccount('7', 'SUSPENDED'), transferAccount('9')];
  const first = resolveTransferSource({
    params: undefined,
    pinned,
    generation: 2,
    accounts: accountsB,
  });
  assert.deepEqual(first, { selectedId: null, invalid: false });
  pinned = nextPinned({
    params: undefined,
    pinned,
    generation: 2,
    accounts: accountsB,
  });
  assert.deepEqual(pinned, { generation: 2, id: '9' });
  assert.equal(
    resolveTransferSource({
      params: undefined,
      pinned,
      generation: 2,
      accounts: accountsB,
    }).selectedId,
    '9'
  );
});
