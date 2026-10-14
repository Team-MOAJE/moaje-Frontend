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
  assert.match(source, /buildOpenAccountInput\(\{ user, initialBalance, bank: selectedBank \}\)/);
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

test('송금 화면: 받는 은행은 가상 은행 선택창으로 고르고 코드(문자열)만 요청에 담으며, 계좌번호는 숫자 문자열(앞자리 0 보존)이다', () => {
  const transfer = code('src/screens/asset/TransferScreen.js');
  assert.match(transfer, /<BankSelectModal/);
  assert.match(transfer, /getVirtualBankByCode\(depositBankCode\) !== null/);
  assert.match(transfer, /isValidDepositInput\(\{ depositBankCode, depositAccountNumber \}\)/);
  assert.match(transfer, /sanitizeDigits\(text\)/);
  assert.doesNotMatch(
    transfer,
    /DEMO_BANK_CODE|placeholder="입금 은행 코드"|handleDepositBankChange/
  );
  assert.doesNotMatch(
    transfer,
    /Number\(\s*depositAccountNumber|parseInt\(\s*depositAccountNumber/
  );
  // 요청에는 선택한 은행 코드만 전달한다(은행명·메모 추가 금지).
  const submit = transfer.slice(
    transfer.indexOf('submitTransfer({\n              withdrawalAccountId')
  );
  assert.match(submit, /depositBankCode,/);
  assert.doesNotMatch(submit.slice(0, 400), /bankName|memo/);
  // 미확정 송금 중에는 입력란과 은행 선택이 잠기고 저장된 요청 값을 보여준다.
  assert.match(transfer, /disabled=\{hasPending \|\| transferLoading\}/);
  assert.match(transfer, /editable=\{!hasPending\}/);
  assert.match(transfer, /pendingTransfer\.request\.depositBankCode/);
  assert.match(transfer, /pendingTransfer\.request\.depositAccountNumber/);
  assert.match(transfer, /disabled=\{!isActive\}/);
});

test('송금 화면: 메모 입력 UI(라벨·안내 문구·TextInput·상태·핸들러)가 완전히 제거됐고 Idempotency-Key 흐름은 유지된다', () => {
  const raw = readSource('src/screens/asset/TransferScreen.js');
  assert.doesNotMatch(raw, /메모|송금에 반영되지 않아요|memo|Memo|점심값|스터디 회비/);
  const transfer = code('src/screens/asset/TransferScreen.js');
  assert.match(transfer, /ensureIdempotencyKey\(pendingIdempotencyKeyRef\.current\)/);
  assert.match(transfer, /idempotencyKey: getCurrentTransferKey\(\)/);
  assert.match(transfer, /recheckPending: true/);
});

test('송금 화면: 출금 계좌 라벨은 서버 은행 정보로 만든 계좌 라벨을 쓴다', () => {
  const transfer = code('src/screens/asset/TransferScreen.js');
  assert.match(transfer, /selectedAccount\.label \?\? '내 계좌'/);
});

test('개설 화면: 은행 코드 고정 표시가 은행 선택으로 바뀌었고 BankSelectModal을 재사용한다', () => {
  const source = code(OPEN);
  const raw = readSource(OPEN);
  assert.match(source, /<BankSelectModal/);
  assert.match(source, /useState\(null\)/);
  assert.match(raw, /은행을 선택해 주세요/);
  assert.doesNotMatch(source, /DEMO_BANK_CODE/);
  assert.doesNotMatch(raw, /은행 코드/);
  // 요청 중에는 은행 변경과 중복 요청이 막힌다.
  assert.match(source, /openAccountLoading \|\| submittingRef\.current/);
  assert.match(source, /disabled=\{openAccountLoading\}/);
  // 선택 결과는 저장하지 않는다.
  assert.doesNotMatch(source, /AsyncStorage|SecureStore|persist/);
});

test('은행 선택창: 가상 은행 단일 목록을 사용하고 은행 목록을 중복 정의하지 않는다', () => {
  const modal = code('src/components/asset/BankSelectModal.js');
  assert.match(modal, /VIRTUAL_BANKS\.map/);
  assert.match(modal, /onSelect\(\{ bankCode: bank\.bankCode, bankName: bank\.bankName \}\)/);
  assert.match(modal, /maxHeight: listMaxHeight/);
  for (const file of [
    'src/components/asset/BankSelectModal.js',
    OPEN,
    'src/screens/asset/TransferScreen.js',
    'src/features/asset/accountOpenInput.js',
  ]) {
    assert.doesNotMatch(code(file), /카카오뱅크|토스뱅크|KB국민은행|신한은행/, file);
  }
});
