// 계좌 개설 화면(API-09) 연결 정적 테스트. React 렌더러가 없어 소스 문자열만 분석한다(렌더링·Android 동작은 미검증).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/accountOpenUiWiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = rel => new URL(`../../${rel}`, import.meta.url);
const readSource = rel => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => stripComments(readSource(rel));

const OPEN = 'src/screens/asset/AccountOpenScreen.js';
const HOME = 'src/screens/home/HomeScreen.js';
const HOME_TAB = 'src/components/home/HomeAccountTab.js';
const NAVIGATOR = 'src/navigation/MainNavigator.js';

test('개설 화면: bankingApi를 직접 쓰지 않고 openAccount thunk와 사용자 정보 기반 입력 빌더만 쓴다', () => {
  const source = code(OPEN);
  assert.match(source, /openAccount\(built\.input\)/);
  assert.match(source, /buildOpenAccountInput\(\{ user, initialBalance \}\)/);
  assert.match(source, /state\.auth\.user/);
  assert.doesNotMatch(source, /bankingApi|apiClient|API_ENDPOINTS|fetch\(/);
  // CI 입력 UI·임의 CI 생성이 없다.
  assert.doesNotMatch(source, /ci:|\bci\b.*TextInput|Math\.random|uuid|Date\.now/);
  assert.doesNotMatch(source, /Number\(|parseFloat\(/);
});

test('개설 화면: 성공 확인(fulfilled) 후에만 계좌 목록을 1회 재조회하고, 실패는 오류 안내만 한다', () => {
  const source = code(OPEN);
  assert.equal((source.match(/dispatch\(fetchAccounts\(\)\)/g) ?? []).length, 1);
  const success = source.slice(
    source.indexOf('openAccount.fulfilled.match(result)'),
    source.indexOf('} else {', source.indexOf('openAccount.fulfilled.match(result)'))
  );
  assert.match(success, /dispatch\(fetchAccounts\(\)\)/);
  assert.match(success, /OPEN_ACCOUNT_SUCCESS_MESSAGE/);
  assert.doesNotMatch(source, /setTimeout|setInterval|useEffect/, '자동 반복·자동 개설 없음');
  assert.match(source, /계좌 개설 실패/);
});

test('개설 화면: 중복 탭 방지(로딩·ref 가드), 세션 전환 후 결과 무시, 시연용 안내와 중립 성공 문구', () => {
  const source = code(OPEN);
  assert.match(source, /submittingRef\.current/);
  assert.match(source, /openAccountLoading/);
  assert.match(source, /disabled=\{!isActive\}/);
  assert.match(source, /sessionGeneration !== generation/);
  assert.match(readSource(OPEN), /시연용 Mock 계좌/);
  assert.match(readSource(OPEN), /실제 금융 계좌 개설이나 본인인증이 아니에요/);
  const input = readSource('src/features/asset/accountOpenInput.js');
  assert.match(input, /이미 같은 계좌가 있으면 기존 계좌가 사용되고/);
  assert.doesNotMatch(input, /새 계좌를 만들었어요|개설이 완료/);
});

test('홈: "계좌 만들기" 진입 버튼만 추가하고 기존 계좌 연결 문구·개설 식별자·QuickActions는 건드리지 않는다', () => {
  const home = code(HOME);
  const tab = code(HOME_TAB);
  assert.match(home, /navigation\.navigate\(ROUTES\.ACCOUNT_OPEN\)/);
  assert.match(home, /onNewAccountPress=\{handleNewAccountPress\}/);
  assert.match(tab, /onNewAccountPress/);
  assert.match(readSource(HOME_TAB), /계좌 만들기/);
  for (const source of [home, tab]) {
    assert.doesNotMatch(source, /createAccount|openAccount|계좌 연결|onConnectPress/);
  }
  // 홈에서 개설 요청을 직접 보내거나 계좌를 만들지 않는다.
  assert.doesNotMatch(home, /openBankingAccount|openAccount/);
});

test('네비게이터: 개설 화면 등록은 라우트 1개·화면 1개이며 기존 화면 등록은 유지된다', () => {
  const navigator = readSource(NAVIGATOR);
  assert.match(navigator, /name=\{ROUTES\.ACCOUNT_OPEN\}\s+component=\{AccountOpenScreen\}/);
  assert.equal((navigator.match(/ROUTES\.ACCOUNT_OPEN/g) ?? []).length, 1);
  for (const route of ['TRANSFER', 'ACCOUNT_DETAIL', 'TRANSACTION_HISTORY', 'TRANSACTION_DETAIL']) {
    assert.match(navigator, new RegExp(`name=\\{ROUTES\\.${route}\\}`));
  }
  assert.match(readSource('src/constants/routes.js'), /ACCOUNT_OPEN: 'AccountOpen'/);
});

test('개설·송금 코드는 Auth/Work 모듈을 수정·호출하지 않는다', () => {
  for (const file of [
    OPEN,
    'src/features/asset/accountOpenInput.js',
    'src/features/asset/transferOutcome.js',
  ]) {
    const source = code(file);
    assert.doesNotMatch(source, /features\/work\/|authApi|tokenService/, file);
  }
});

test('송금 화면: 입금 은행·계좌번호는 숫자 문자열(앞자리 0 보존)로 다루고 서버에 없는 메모는 반영되지 않는다고 안내한다', () => {
  const transfer = code('src/screens/asset/TransferScreen.js');
  assert.match(transfer, /sanitizeDigits\(text\)/);
  assert.match(transfer, /isValidDepositInput\(\{ depositBankCode, depositAccountNumber \}\)/);
  assert.doesNotMatch(
    transfer,
    /Number\(\s*depositAccountNumber|parseInt\(\s*depositAccountNumber/
  );
  assert.match(readSource('src/screens/asset/TransferScreen.js'), /송금에 반영되지 않아요/);
  // 미확정 송금 중에는 입력란이 잠기고 저장된 요청 값을 보여준다.
  assert.match(transfer, /editable=\{!hasPending\}/);
  assert.match(transfer, /pendingTransfer\.request\.depositAccountNumber/);
  assert.match(transfer, /disabled=\{!isActive\}/);
});
