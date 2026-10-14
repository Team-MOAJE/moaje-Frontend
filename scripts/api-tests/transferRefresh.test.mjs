// 송금 COMPLETED 후 계좌 데이터 갱신·잔액 신선도 테스트 — 모의 Gateway 사용, 실서버·Android·실송금 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/transferRefresh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { gateway, jsonRoute, rawJsonRoute } from './assetTestEnv.mjs';

const {
  default: assetReducer,
  accountDataInvalidated,
  resetTransactions,
  setSelectedAccountId,
} = await import('../../src/features/asset/assetSlice.js');
const { fetchAccounts, fetchAccountDetail, refreshAccount, fetchTransactions, transferFunds } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer } = await import('../../src/features/auth/authSlice.js');
const logic = await import('../../src/features/asset/assetScreenLogic.js');
const { isBalanceStale, validateTransferAtConfirm, buildHomeAccountItems } = logic;
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');

const LIST_PATH = '/api/v1/assets/accounts';
const detailPath = id => `/api/v1/assets/accounts/${id}/detail`;
const txListPath = id => `/api/v1/assets/accounts/${id}/transactions`;
const refreshPath = id => `/api/v1/assets/accounts/${id}/refresh`;
const TRANSFER_PATH = API_ENDPOINTS.BANKING.TRANSFERS;
const TRANSFER_INPUT = {
  withdrawalAccountId: '1',
  depositBankCode: '001',
  depositAccountNumber: '110123456789',
  amount: 100000,
};

const COMPLETED_BODY = {
  transferId: 456,
  publicTransferId: 'MOAJE-BNK-456',
  status: 'COMPLETED',
  message: 'm',
  externalTransactionId: null,
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const acct = (id, balance) =>
  `{"accountId":"${id}","bankCode":null,"bankName":null,"balance":${balance},"status":"ACTIVE"}`;
const list = (...items) => rawJsonRoute(`[${items.join(',')}]`);
const detail = (id, balance) =>
  rawJsonRoute(
    `{"accountId":"${id}","bankCode":null,"bankName":null,"accountNumber":"12345678901234","balance":${balance},"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[],"nextCursor":null,"hasNext":false}`
  );
const txs = (...ids) =>
  rawJsonRoute(
    `{"transactions":[${ids
      .map(
        id =>
          `{"transactionId":"${id}","publicTransactionId":"p${id}","type":"DEPOSIT","amount":100000,"status":"SUCCESS","merchantName":null,"categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}`
      )
      .join(',')}],"nextCursor":null,"hasNext":false}`
  );

// 송금 전: 계좌 1(2,000,000원) + 상세 + 거래 1건 조회, 선택 계좌 1
const prepare = async () => {
  const store = makeStore();
  gateway.route('GET', LIST_PATH, list(acct('1', '2000000.0000'), acct('2', '500000.0000')));
  gateway.route('GET', detailPath('1'), detail('1', '2000000'));
  gateway.route('GET', txListPath('1'), txs('101'));
  await store.dispatch(fetchAccounts());
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  store.dispatch(resetTransactions({ queryKey: 'account:1' })); // 화면이 첫 조회 전에 하는 것과 같다
  await store.dispatch(fetchTransactions({ accountId: '1', queryKey: 'account:1' }));
  assert.equal(asset(store).selectedAccountId, '1');
  assert.equal(asset(store).accounts[0].balance, 2000000);
  return store;
};

test('무효화: 상세·거래는 비우고 목록은 유지하며 계좌를 stale로 표시, 송금 상태는 그대로', async () => {
  const store = await prepare();
  gateway.route('POST', TRANSFER_PATH, jsonRoute(COMPLETED_BODY));
  await store.dispatch(transferFunds({ ...TRANSFER_INPUT, idempotencyKey: 'key-1' }));
  const before = asset(store);
  const outcome = before.transferOutcome;
  assert.equal(before.pendingTransfer, null);

  store.dispatch(accountDataInvalidated());
  const s = asset(store);
  assert.equal(s.accountDetail, null);
  assert.deepEqual(s.transactions, []);
  assert.deepEqual(s.staleBalanceAccountIds, ['1', '2']);
  assert.equal(s.accountDataVersion, before.accountDataVersion + 1);
  assert.equal(s.accounts.length, 2, '목록 자체는 지우지 않는다');
  assert.equal(s.selectedAccountId, '1');
  assert.equal(s.transferOutcome, outcome);
  assert.equal(s.pendingTransfer, null);
});

test('재조회 대기 중: 이전 잔액은 stale로 구분된다(홈 목록은 "-")', async () => {
  const store = await prepare();
  store.dispatch(accountDataInvalidated());
  const s = asset(store);
  assert.equal(isBalanceStale(s.staleBalanceAccountIds, '1'), true);
  assert.equal(isBalanceStale(s.staleBalanceAccountIds, '3'), false);
  const items = buildHomeAccountItems(s.accounts, s.staleBalanceAccountIds);
  assert.deepEqual(
    items.map(i => i.balanceText),
    ['-', '-']
  );
  assert.notEqual(
    buildHomeAccountItems(s.accounts)[0].balanceText,
    '-',
    'stale이 아니면 기존 표시'
  );
});

test('API-52 성공: 서버 잔액이 반영되고 stale 해제, 재진입 시 이전 상세가 남지 않음', async () => {
  const store = await prepare();
  store.dispatch(accountDataInvalidated());
  gateway.route('GET', LIST_PATH, list(acct('1', '1900000.0000'), acct('2', '600000.0000')));
  await store.dispatch(fetchAccounts());
  const s = asset(store);
  assert.equal(s.accounts[0].balance, 1900000);
  assert.deepEqual(s.staleBalanceAccountIds, []);
  assert.equal(s.accountDetail, null, '이전 상세(2,000,000)는 복원되지 않는다');
});

test('API-11 성공: 서버 상세 잔액을 목록에도 반영하고 해당 계좌 stale 해제', async () => {
  const store = await prepare();
  store.dispatch(accountDataInvalidated());
  gateway.route('GET', detailPath('1'), detail('1', '1900000'));
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  const s = asset(store);
  assert.equal(s.accountDetail.balance, 1900000);
  assert.equal(s.accounts[0].balance, 1900000);
  assert.deepEqual(s.staleBalanceAccountIds, ['2'], '다른 계좌는 아직 미확인');
});

test('송금 후 거래내역: 무효화 뒤 첫 페이지를 다시 받으면 최신 서버 거래가 반영된다', async () => {
  const store = await prepare();
  store.dispatch(accountDataInvalidated());
  assert.deepEqual(asset(store).transactions, []);
  gateway.route('GET', txListPath('1'), txs('102', '101'));
  await store.dispatch(fetchTransactions({ accountId: '1', queryKey: 'account:1' }));
  // 무효화로 라운드가 바뀌었으므로 화면은 beginTransactionsRefresh 후 요청한다(여기서는 같은 queryKey/seq 규칙 확인)
  const s = asset(store);
  assert.deepEqual(
    s.transactions.map(t => t.id),
    ['102', '101']
  );
});

test('재조회 실패: stale 유지(이전 잔액을 최신으로 인정 안 함), 송금 성공 상태는 유지', async () => {
  const store = await prepare();
  gateway.route('POST', TRANSFER_PATH, jsonRoute(COMPLETED_BODY));
  await store.dispatch(transferFunds({ ...TRANSFER_INPUT, idempotencyKey: 'key-2' }));
  const outcome = asset(store).transferOutcome;
  const transferCalls = gateway.requestsTo(TRANSFER_PATH).length;

  store.dispatch(accountDataInvalidated());
  gateway.route('GET', LIST_PATH, jsonRoute({ message: 'x' }, { status: 500 }));
  gateway.route('GET', detailPath('1'), jsonRoute({ message: 'x' }, { status: 500 }));
  await store.dispatch(fetchAccounts());
  await store.dispatch(fetchAccountDetail({ accountId: '1' }));
  const s = asset(store);
  assert.deepEqual(s.staleBalanceAccountIds, ['1', '2']);
  assert.equal(s.accounts[0].balance, 2000000, '값은 그대로지만 stale로만 구분');
  assert.ok(s.accountsError);
  assert.equal(s.transferOutcome, outcome);
  assert.equal(s.pendingTransfer, null);
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, transferCalls, '추가 API-10 요청 없음');
});

test('송금 전 시작된 API-52의 늦은 응답은 accounts를 덮어쓰거나 stale을 해제하지 못한다', async () => {
  const store = await prepare();
  gateway.route('GET', LIST_PATH, (...a) => ({
    rawBody: `[${acct('1', '2000000.0000')},${acct('2', '500000.0000')}]`,
    delay: 150,
  }));
  const oldReq = store.dispatch(fetchAccounts()); // 송금 이전에 시작된 요청(이전 잔액)
  await sleep(40);
  store.dispatch(accountDataInvalidated());
  gateway.route('GET', LIST_PATH, list(acct('1', '1900000.0000'), acct('2', '500000.0000')));
  await store.dispatch(fetchAccounts()); // 송금 후 새 요청 — 이전 요청이 남아 있어도 차단되지 않는다
  assert.equal(asset(store).accounts[0].balance, 1900000);
  assert.deepEqual(asset(store).staleBalanceAccountIds, []);
  await oldReq; // 늦은 이전 응답 도착
  assert.equal(asset(store).accounts[0].balance, 1900000, '오래된 잔액으로 덮어쓰지 않는다');
  assert.equal(asset(store).accountsLoading, false);
});

test('무효화 후 이전 응답만 늦게 오면 stale이 유지된다', async () => {
  const store = await prepare();
  gateway.route('GET', LIST_PATH, () => ({
    rawBody: `[${acct('1', '2000000.0000')},${acct('2', '500000.0000')}]`,
    delay: 100,
  }));
  const oldReq = store.dispatch(fetchAccounts());
  await sleep(30);
  store.dispatch(accountDataInvalidated());
  await oldReq;
  assert.deepEqual(asset(store).staleBalanceAccountIds, ['1', '2']);
  assert.equal(asset(store).accountsLoading, false);
});

test('무효화 이전의 API-11/API-13/API-14 늦은 응답은 반영되지 않는다', async () => {
  const store = await prepare();
  gateway.route('GET', detailPath('1'), () => ({ ...detail('1', '2000000')(), delay: 100 }));
  gateway.route('GET', txListPath('1'), () => ({ ...txs('100')(), delay: 100 }));
  gateway.route('POST', refreshPath('1'), () => ({ ...detail('1', '2000000')(), delay: 100 }));
  const pending = [
    store.dispatch(fetchAccountDetail({ accountId: '1' })),
    store.dispatch(fetchTransactions({ accountId: '1', queryKey: 'account:1' })),
    store.dispatch(refreshAccount({ accountId: '1' })),
  ];
  await sleep(30);
  store.dispatch(accountDataInvalidated());
  await Promise.all(pending);
  const s = asset(store);
  assert.equal(s.accountDetail, null);
  assert.deepEqual(s.transactions, []);
  assert.equal(s.refreshingAccountId, null);
  assert.deepEqual(s.staleBalanceAccountIds, ['1', '2'], '늦은 이전 응답은 stale을 해제하지 못함');
});

test('계좌 전환: 다른 계좌 stale·잔액이 섞이지 않는다', async () => {
  const store = await prepare();
  store.dispatch(accountDataInvalidated());
  store.dispatch(setSelectedAccountId('2'));
  gateway.route('GET', detailPath('2'), detail('2', '777000'));
  gateway.route('GET', detailPath('1'), () => ({ ...detail('1', '1900000')(), delay: 80 }));
  const late = store.dispatch(fetchAccountDetail({ accountId: '1' }));
  await sleep(20);
  store.dispatch(setSelectedAccountId('2'));
  await store.dispatch(fetchAccountDetail({ accountId: '2' }));
  await late;
  const s = asset(store);
  assert.equal(s.accountDetailAccountId, '2');
  assert.equal(s.accountDetail.balance, 777000);
  assert.equal(s.accounts.find(a => a.id === '2').balance, 777000);
  assert.equal(s.accounts.find(a => a.id === '1').balance, 2000000, '계좌 1 잔액은 건드리지 않음');
  assert.deepEqual(s.staleBalanceAccountIds, ['1']);
});

// ── stale 잔액으로 새 송금 차단 ──
const confirmArgs = (store, over = {}) => {
  const state = { auth: { user: { userId: 'u1' } }, asset: asset(store) };
  const snapshot = {
    userId: 'u1',
    sessionGeneration: state.asset.sessionGeneration,
    accountId: '1',
    amount: 100000,
    depositBankCode: '001',
    depositAccountNumber: '110123456789',
  };
  const { snapshot: s2, ...rest } = over;
  return { state, snapshot: { ...snapshot, ...(s2 ?? {}) }, current: { ...snapshot }, ...rest };
};

test('stale 계좌에서는 새 송금이 확인 시점에 차단되고, 확인 후에는 기존 검증이 적용된다', async () => {
  const store = await prepare();
  assert.equal(validateTransferAtConfirm(confirmArgs(store)), null, 'stale 아님 → 통과');
  store.dispatch(accountDataInvalidated());
  assert.equal(validateTransferAtConfirm(confirmArgs(store)), 'STALE_BALANCE');

  gateway.route('GET', LIST_PATH, list(acct('1', '50000.0000'), acct('2', '500000.0000')));
  await store.dispatch(fetchAccounts());
  assert.equal(
    validateTransferAtConfirm(confirmArgs(store)),
    'EXCEEDS_BALANCE',
    'stale 해제 후 잔액 초과 검증 정상 적용'
  );
});

test('stale 중에도 미확정 송금(pendingTransfer) 재확인 경로는 막지 않는다', async () => {
  const src = read('src/screens/asset/TransferScreen.js');
  assert.match(src, /const isActive = hasPending \? !transferLoading : isNewTransferActive;/);
  assert.match(src, /amountIssue === null &&\s*!isSelectedStale &&/);
  const slice = read('src/features/asset/assetSlice.js');
  const body = slice.slice(slice.indexOf('accountDataInvalidated: state'));
  const fn = body.slice(0, body.indexOf('clearTransactionDetail'));
  assert.doesNotMatch(fn, /pendingTransfer|transferOutcome|transferRequestId/);
});

// ── 정적 배선 검사 ──
function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('accountDataInvalidated는 COMPLETED 분기에서만 호출된다', () => {
  const src = read('src/screens/asset/TransferScreen.js');
  assert.equal(src.match(/accountDataInvalidated\(\)/g).length, 1);
  const call = src.indexOf('dispatch(accountDataInvalidated())');
  const completed = src.indexOf('if (outcome === TRANSFER_OUTCOME.COMPLETED) {');
  const inProgress = src.indexOf('outcome !== TRANSFER_OUTCOME.IN_PROGRESS');
  assert.ok(completed !== -1 && call > completed && call < inProgress);
});

test('화면 재조회 트리거: AccountDetail·TransactionHistory가 accountDataVersion을 의존성으로 쓴다', () => {
  const detailSrc = read('src/screens/asset/AccountDetailScreen.js');
  assert.match(detailSrc, /routeSeedPending, accountDataVersion\]/);
  const history = read('src/screens/asset/TransactionHistoryScreen.js');
  assert.match(history, /#\$\{accountDataVersion\}/);
});
