// 계좌번호 표시·복사(API-11/14 accountNumber), 목록 마스킹(API-52), 502 ACCOUNT_NUMBER_UNAVAILABLE 테스트.
// 모의 Gateway와 expo-clipboard 메모리 스텁만 사용한다(실제 서버·클립보드·Android 호출 없음).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/accountNumberCopy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { gateway, jsonRoute, rawJsonRoute } from './assetTestEnv.mjs';

const clipboardStub = await import('./stubs/expoClipboard.mjs');
const { default: assetReducer, setSelectedAccountId } =
  await import('../../src/features/asset/assetSlice.js');
const { fetchAccounts, fetchAccountDetail, refreshAccount } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer } = await import('../../src/features/auth/authSlice.js');
const { loginUser, logoutUser } = await import('../../src/features/auth/authApi.js');
const { formatAccountNumber, getCopyableAccountNumber, buildHomeAccountItems } =
  await import('../../src/features/asset/assetScreenLogic.js');
const { copyTextToClipboard } = await import('../../src/utils/clipboard.js');
const { normalizeAccountList } = await import('../../src/utils/apiMappers.js');

const LIST_PATH = '/api/v1/assets/accounts';
const detailPath = id => `/api/v1/assets/accounts/${id}/detail`;
const refreshPath = id => `/api/v1/assets/accounts/${id}/refresh`;
const LATE = 120;

const NUMBER_A = '00123456789012';
const NUMBER_B = '99887766554433';
const UNAVAILABLE_MESSAGE = '계좌번호를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const acctRaw = (id, masked = null) =>
  `{"accountId":"${id}","bankCode":"001","bankName":"카카오뱅크","maskedAccountNumber":${
    masked === null ? 'null' : `"${masked}"`
  },"balance":10000,"status":"ACTIVE"}`;
const detailRaw = (id, accountNumber) =>
  `{"accountId":"${id}","bankCode":"001","bankName":"카카오뱅크","accountNumber":${
    accountNumber === null ? 'null' : `"${accountNumber}"`
  },"balance":50000,"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[],"nextCursor":null,"hasNext":false}`;

const loadAccounts = async (store, items) => {
  gateway.route('GET', LIST_PATH, rawJsonRoute(`[${items.join(',')}]`));
  await store.dispatch(fetchAccounts());
};

const problem502 = {
  type: 'about:blank',
  title: 'ACCOUNT_NUMBER_UNAVAILABLE',
  status: 502,
  detail: '계좌번호를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.',
};

// ── 표시/복사 값 결정 (순수 로직) ──

test('formatAccountNumber: 14자리 숫자만 4-4-6 표시용으로 포맷하고, 그 외(마스킹·ACCOUNT-id·null)는 null', () => {
  assert.equal(formatAccountNumber(NUMBER_A), '0012-3456-789012');
  const invalid = [
    '**********1234',
    'ACCOUNT-123',
    '1234',
    '1234567890123',
    null,
    undefined,
    12345678901234,
  ];
  for (const bad of invalid) {
    assert.equal(formatAccountNumber(bad), null, String(bad));
  }
});

test('getCopyableAccountNumber: 서버 원문 14자리만 반환(하이픈·마스킹·accountId 제외), 번호 없으면 null', () => {
  const detail = { accountId: '1', accountNumber: NUMBER_A, maskedAccountNumber: '******1234' };
  const copy = getCopyableAccountNumber(detail, '1');
  assert.equal(copy, NUMBER_A);
  assert.equal(copy.includes('-'), false, '표시용 하이픈은 복사값에 없다');
  assert.notEqual(copy, formatAccountNumber(NUMBER_A));
  assert.notEqual(copy, detail.accountId);

  assert.equal(getCopyableAccountNumber({ accountId: '1', accountNumber: null }, '1'), null);
  assert.equal(getCopyableAccountNumber({ accountId: '1' }, '1'), null);
  assert.equal(getCopyableAccountNumber(null, '1'), null);
  // 서버 원문이 아닌 값(마스킹·ACCOUNT-id·하이픈 포함)은 복사 대상이 아니다.
  for (const bad of ['******1234', 'ACCOUNT-1', '0012-3456-789012', '123']) {
    assert.equal(getCopyableAccountNumber({ accountId: '1', accountNumber: bad }, '1'), null);
  }
});

test('getCopyableAccountNumber: 선택 계좌와 다른 상세의 번호는 복사할 수 없다(A→B 전환)', () => {
  const detailA = { accountId: 'A', accountNumber: NUMBER_A };
  const detailB = { accountId: 'B', accountNumber: NUMBER_B };
  assert.equal(getCopyableAccountNumber(detailA, 'A'), NUMBER_A);
  assert.equal(getCopyableAccountNumber(detailA, 'B'), null);
  assert.equal(getCopyableAccountNumber(detailB, 'B'), NUMBER_B);
  assert.equal(getCopyableAccountNumber(detailB, null), null);
});

// ── 클립보드 (expo-clipboard 스텁) ──

test('copyTextToClipboard: setStringAsync로 값을 그대로 복사하고 성공 true / 값 없음·실패 false', async () => {
  clipboardStub.__resetClipboard();
  assert.equal(await copyTextToClipboard(NUMBER_A), true);
  assert.deepEqual(clipboardStub.__clipboard.calls, [NUMBER_A]);
  assert.equal(clipboardStub.__clipboard.value, NUMBER_A);

  clipboardStub.__resetClipboard();
  assert.equal(await copyTextToClipboard(null), false);
  assert.equal(await copyTextToClipboard(''), false);
  assert.deepEqual(clipboardStub.__clipboard.calls, [], '값이 없으면 클립보드를 건드리지 않는다');

  clipboardStub.__clipboard.failNext = true;
  assert.equal(await copyTextToClipboard(NUMBER_A), false, '예외는 throw하지 않고 false');

  clipboardStub.__clipboard.resolveWith = false;
  assert.equal(await copyTextToClipboard(NUMBER_A), false, '라이브러리가 false를 주면 실패');
  clipboardStub.__resetClipboard();
});

test('복사 흐름: 실제 slice 상태 형태(accountDetail.accountId / selectedAccountId)에서 복사가 가능하고, 클립보드에는 서버 원문만 저장된다', async () => {
  clipboardStub.__resetClipboard();
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1', '**********9012')]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', NUMBER_A)));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));

  const state = asset(store);
  // 화면(AccountDetailScreen)과 같은 계산: 상세는 accountDetailAccountId가 선택 계좌와 같을 때만 사용
  const detail =
    state.selectedAccountId != null && state.accountDetailAccountId === state.selectedAccountId
      ? state.accountDetail
      : null;
  const copyable = getCopyableAccountNumber(detail, state.selectedAccountId);
  assert.equal(copyable, NUMBER_A, '식별자 필드가 달라 항상 비활성이 되지 않는다');
  assert.equal(formatAccountNumber(copyable), '0012-3456-789012');

  assert.equal(await copyTextToClipboard(copyable), true);
  assert.equal(clipboardStub.__clipboard.value, NUMBER_A);
  assert.notEqual(clipboardStub.__clipboard.value, state.selectedAccountId);
  assert.notEqual(clipboardStub.__clipboard.value, state.accounts[0].maskedAccountNumber);
  clipboardStub.__resetClipboard();
});

test('계좌번호가 없는 상세(null)는 복사 불가이고 마스킹 번호·accountId로 대체되지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1', '**********9012')]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', null)));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  const state = asset(store);
  assert.equal(state.accountDetail.accountNumber, null);
  assert.equal(getCopyableAccountNumber(state.accountDetail, state.selectedAccountId), null);
});

// ── 계좌 전환 / 늦은 응답 / 사용자 변경 ──

test('계좌 A→B 전환: B의 상세 번호만 복사 대상이 되고, A의 늦은 응답은 B 상태에 닿지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1'), acctRaw('2')]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', NUMBER_A), { delay: LATE }));
  gateway.route('GET', detailPath('2'), rawJsonRoute(detailRaw('2', NUMBER_B)));

  const aInflight = store.dispatch(fetchAccountDetail({ accountId: '1' }));
  store.dispatch(setSelectedAccountId('2'));
  await store.dispatch(fetchAccountDetail({ accountId: '2' }));
  await aInflight;

  const state = asset(store);
  assert.equal(state.selectedAccountId, '2');
  assert.equal(state.accountDetailAccountId, '2');
  assert.equal(state.accountDetail.accountNumber, NUMBER_B);
  assert.equal(getCopyableAccountNumber(state.accountDetail, '2'), NUMBER_B);
  assert.equal(getCopyableAccountNumber(state.accountDetail, '1'), null, 'A 번호는 복사 불가');
});

test('계좌 전환 직후 이전 계좌 상세(번호 포함)가 즉시 비워져 복사할 수 없다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1'), acctRaw('2')]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', NUMBER_A)));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  assert.equal(getCopyableAccountNumber(asset(store).accountDetail, '1'), NUMBER_A);

  store.dispatch(setSelectedAccountId('2'));
  assert.equal(asset(store).accountDetail, null);
  assert.equal(getCopyableAccountNumber(asset(store).accountDetail, '2'), null);
});

test('사용자 변경: 로그아웃 시 이전 사용자의 계좌번호가 상태에 남지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('7', '**********9012')]);
  gateway.route('GET', detailPath('7'), rawJsonRoute(detailRaw('7', NUMBER_A)));
  await store.dispatch(fetchAccountDetail({ accountId: '7' }));
  assert.equal(asset(store).accountDetail.accountNumber, NUMBER_A);

  store.dispatch(logoutUser.pending('rid-logout'));
  const state = asset(store);
  assert.equal(state.accountDetail, null);
  assert.equal(state.accountDetailAccountId, null);
  assert.deepEqual(state.accounts, []);
  assert.equal(JSON.stringify(state).includes(NUMBER_A), false, '상태 어디에도 번호가 없다');
});

test('사용자 변경: A의 요청 중 로그아웃 → B(동일 accountId) 로그인, A의 늦은 응답(번호 포함)은 B 상태에 반영되지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('7')]);
  gateway.route('GET', detailPath('7'), rawJsonRoute(detailRaw('7', NUMBER_A), { delay: LATE }));
  const aInflight = store.dispatch(fetchAccountDetail({ accountId: '7' }));

  store.dispatch(logoutUser.pending('rid-logout'));
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  await loadAccounts(store, [acctRaw('7')]); // B도 같은 accountId를 가진다
  await aInflight;

  assert.equal(asset(store).accountDetail, null, 'A의 응답은 B 상태에 반영되지 않는다');
  assert.equal(JSON.stringify(asset(store)).includes(NUMBER_A), false);
});

// ── 502 ACCOUNT_NUMBER_UNAVAILABLE ──

test('502 ACCOUNT_NUMBER_UNAVAILABLE: 상세 전체 실패로 처리 — 번호·상세 없음, 전용 문구, 계좌 귀속, 재시도 후 복구', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1', '**********9012'), acctRaw('2')]);
  gateway.route('GET', detailPath('1'), jsonRoute(problem502, { status: 502 }));
  const result = await store.dispatch(fetchAccountDetail({ accountId: '1' }));

  assert.equal(result.type.endsWith('/rejected'), true);
  assert.equal(result.payload.accountId, '1');
  assert.equal(result.payload.code, 'ACCOUNT_NUMBER_UNAVAILABLE');
  const failed = asset(store);
  assert.equal(failed.accountDetail, null, '잔액·거래·번호를 정상이라고 가정하지 않는다');
  assert.equal(failed.accountDetailLoading, false);
  assert.equal(failed.accountDetailError, UNAVAILABLE_MESSAGE);
  assert.equal(getCopyableAccountNumber(failed.accountDetail, '1'), null);
  // 마스킹 번호는 목록에만 있고 실제 번호처럼 쓰이지 않는다.
  assert.equal(formatAccountNumber(failed.accounts[0].maskedAccountNumber), null);
  // 계좌 선택은 계속 가능하다.
  store.dispatch(setSelectedAccountId('2'));
  assert.equal(asset(store).selectedAccountId, '2');
  store.dispatch(setSelectedAccountId('1'));

  // 재시도(자동 재시도 없음 → 명시적 dispatch) 성공 시 복구된다.
  const before = gateway.requestsTo(detailPath('1')).length;
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', NUMBER_A)));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  assert.equal(gateway.requestsTo(detailPath('1')).length, before + 1);
  const ok = asset(store);
  assert.equal(ok.accountDetailError, null);
  assert.equal(getCopyableAccountNumber(ok.accountDetail, '1'), NUMBER_A);
});

test('502 오류 중 계좌를 바꾸면 이전 계좌의 늦은 오류가 새 계좌에 남지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1'), acctRaw('2')]);
  gateway.route('GET', detailPath('1'), jsonRoute(problem502, { status: 502, delay: LATE }));
  gateway.route('GET', detailPath('2'), rawJsonRoute(detailRaw('2', NUMBER_B)));
  const aInflight = store.dispatch(fetchAccountDetail({ accountId: '1' }));
  store.dispatch(setSelectedAccountId('2'));
  await store.dispatch(fetchAccountDetail({ accountId: '2' }));
  await aInflight;
  const state = asset(store);
  assert.equal(state.accountDetailError, null);
  assert.equal(state.accountDetail.accountNumber, NUMBER_B);
});

test('API-14 refresh의 502 ACCOUNT_NUMBER_UNAVAILABLE도 전용 문구로 refreshError에 남고 기존 상세를 바꾸지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1')]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw('1', NUMBER_A)));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  gateway.route('POST', refreshPath('1'), jsonRoute(problem502, { status: 502 }));
  await store.dispatch(refreshAccount({ accountId: '1' }));
  const state = asset(store);
  assert.equal(state.refreshError, UNAVAILABLE_MESSAGE);
  assert.equal(state.accountDetail.accountNumber, NUMBER_A);
});

// ── API-52 마스킹 전달 경로 ──

test('목록 마스킹: API-52 maskedAccountNumber가 normalizeAccountList → buildHomeAccountItems까지 서버 값 그대로 전달되고, 전체 번호는 목록에 없다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw('1', '**********9012'), acctRaw('2')]);
  const { accounts } = asset(store);
  assert.equal(accounts[0].maskedAccountNumber, '**********9012');
  assert.equal(accounts[1].maskedAccountNumber, null);
  const items = buildHomeAccountItems(accounts);
  assert.deepEqual(
    items.map(item => item.maskedAccountNumber),
    ['**********9012', null]
  );
  assert.equal(JSON.stringify(normalizeAccountList(accounts)).includes(NUMBER_A), false);
  for (const account of accounts) assert.equal('accountNumber' in account, false);
});

// ── 화면 배선 (정적 분석) ──

const read = rel =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = rel => strip(read(rel));

test('상세 화면 배선: 번호는 getCopyableAccountNumber 결과로만 표시·복사하고 복사는 clipboard 유틸을 쓴다', () => {
  const screen = code('src/screens/asset/AccountDetailScreen.js');
  assert.match(screen, /getCopyableAccountNumber\(detail, selectedAccountId\)/);
  assert.match(screen, /formatAccountNumber\(copyableAccountNumber\)/);
  assert.match(screen, /copyTextToClipboard\(copyableAccountNumber\)/);
  assert.match(screen, /canCopyAccountNumber=\{copyableAccountNumber !== null\}/);
  // accountId·maskedAccountNumber·표시용 문자열은 복사하지 않는다.
  assert.doesNotMatch(screen, /copyTextToClipboard\((?!copyableAccountNumber)/);
  assert.doesNotMatch(screen, /maskedAccountNumber|displayAccountNumber|ACCOUNT-/);
  // 복사 안내는 계좌별로 귀속되어 다른 계좌에는 보이지 않는다.
  assert.match(screen, /copyNotice\.accountId === selectedAccountId/);
  assert.match(screen, /계좌번호를 복사했어요/);
  assert.match(screen, /복사하지 못했어요/);
  // 상세 오류: 오류 문구 + 재시도(fetchAccountDetail), 가짜 번호 없음
  assert.match(screen, /detailError=\{detailErrorMessage\}/);
  assert.match(screen, /onRetryDetail=\{handleRetryDetail\}/);
});

test('상세 뷰 배선: 전체 번호 표시, 번호가 없으면 복사 버튼 비활성, 오류 시 번호 대신 오류+재시도', () => {
  const view = code('src/components/asset/AccountDetailView.js');
  assert.match(view, /accountNumberText \?\? '-'/);
  assert.match(view, /disabled=\{!canCopyAccountNumber\}/);
  assert.match(view, /onPress=\{onCopyAccountNumber\}/);
  assert.match(view, /detailError \? \(/);
  assert.match(view, /onPress=\{onRetryDetail\}/);
  assert.doesNotMatch(view, /maskedAccountNumber|ACCOUNT-/);
});

test('목록/시트/홈 배선: 서버 maskedAccountNumber만 표시하고 전체 accountNumber는 쓰지 않는다', () => {
  for (const file of [
    'src/components/asset/AccountSelectorBottomSheet.js',
    'src/components/home/HomeAccountTab.js',
  ]) {
    const source = code(file);
    assert.match(source, /account\.maskedAccountNumber/, file);
    assert.doesNotMatch(source, /\.accountNumber\b/, file);
  }
});

test('clipboard 유틸은 expo-clipboard setStringAsync만 사용한다', () => {
  const source = code('src/utils/clipboard.js');
  assert.match(source, /from 'expo-clipboard'/);
  assert.match(source, /Clipboard\.setStringAsync\(text\)/);
});
