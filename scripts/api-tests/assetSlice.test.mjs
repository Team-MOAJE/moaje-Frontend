// Asset Redux(assetApi thunk + assetSlice) 통합 테스트 — 모의 Gateway 사용, 실제 서버·Android 호출 없음.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/assetSlice.test.mjs
// 로그아웃 등 세션 종료 경로는 기존 Auth 액션 생성자만 사용한다(Auth 코드 무수정).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import {
  BIG_ACCOUNT_ID,
  BIG_CURSOR,
  BIG_TX_ID,
  everRequested,
  gateway,
  jsonRoute,
  rawJsonRoute,
} from './assetTestEnv.mjs';
import { authEnvelope } from './mockGateway.mjs';

const { default: assetReducer, ...assetActions } =
  await import('../../src/features/asset/assetSlice.js');
const { setSelectedAccountId, resetTransactions, beginTransactionsRefresh } = assetActions;
const thunks = await import('../../src/features/asset/assetApi.js');
const {
  fetchAccounts,
  fetchAccountDetail,
  refreshAccount,
  fetchTransactions,
  fetchTransactionDetail,
  fetchAccountSummary,
  fetchAvailableBalance,
  transferFunds,
} = thunks;
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { loginUser, logoutUser, registerUser, verifyUnlockPin } =
  await import('../../src/features/auth/authApi.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');

const LIST_PATH = '/api/v1/assets/accounts';
const detailPath = id => `/api/v1/assets/accounts/${id}/detail`;
const txPath = (id, tx) => `/api/v1/assets/accounts/${id}/${tx}/transaction`;
const txListPath = id => `/api/v1/assets/accounts/${id}/transactions`;
const refreshPath = id => `/api/v1/assets/accounts/${id}/refresh`;
const SUMMARY_PATH = API_ENDPOINTS.ASSET.ACCOUNT_SUMMARY;
const AVAILABLE_PATH = API_ENDPOINTS.ASSET.AVAILABLE_BALANCE;
const TRANSFER_PATH = API_ENDPOINTS.BANKING.TRANSFERS;
// API-10 계약 입력/응답(모의 서버 전용 값)
const TRANSFER_INPUT = {
  withdrawalAccountId: '1',
  depositBankCode: '001',
  depositAccountNumber: '110123456789',
  amount: 1000,
};
const transferResponse = (status = 'COMPLETED') => ({
  transferId: 456,
  publicTransferId: 'MOAJE-BNK-456',
  status,
  message: 'm',
  externalTransactionId: null,
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LATE = 120; // 늦은 응답 지연(ms). 요청 타임아웃(300ms)보다 짧게 유지한다.

const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });

// ── 응답 조립 ─────────────────────────────────────────────────

// 최신 명세(20261014) API-52: 루트 배열, 항목은 { accountId, bankCode, bankName, balance, status }.
const acctRaw = ({
  id = '1',
  balance = '10000.0000',
  status = 'ACTIVE',
  bankCode = 'null',
  bankName = 'null',
} = {}) =>
  `{"accountId":"${id}","bankCode":${bankCode},"bankName":${bankName},"balance":${balance},"status":"${status}"}`;
const listRaw = (...items) => `[${items.join(',')}]`;

const txRaw = ({ id = '789', type = 'DEPOSIT', status = 'SUCCESS', amount = '1000' } = {}) =>
  `{"transactionId":"${id}","publicTransactionId":"p${id}","type":"${type}","amount":${amount},"status":"${status}","merchantName":null,"categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}`;
const txListRaw = (txs, { nextCursor = 'null', hasNext = false } = {}) =>
  `{"transactions":[${txs.join(',')}],"nextCursor":${nextCursor},"hasNext":${hasNext}}`;

const detailRaw = ({ accountId = '1', balance = '90000', transactions = [] } = {}) =>
  `{"accountId":"${accountId}","bankCode":null,"bankName":null,"accountNumber":"12345678901234","balance":${balance},"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[${transactions.join(',')}],"nextCursor":null,"hasNext":false}`;

// 계좌 목록을 불러와 선택 계좌까지 준비한다.
const loadAccounts = async (store, items = [acctRaw()]) => {
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(...items)));
  await store.dispatch(fetchAccounts());
};

const asset = store => store.getState().asset;

// 세션 종료 계열 액션 (기존 Auth 액션 생성자 사용)
const sessionEnders = {
  'logout (세션 만료)': () => logout(),
  'logoutUser.pending': () => logoutUser.pending('rid-logout'),
  'logoutUser.fulfilled': () => logoutUser.fulfilled({}, 'rid-logout'),
  'loginUser.fulfilled': () => loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}),
  'registerUser.fulfilled': () => registerUser.fulfilled({ user: { userId: '2' } }, 'rid-reg', {}),
  'verifyUnlockPin.rejected(sessionEnded)': () =>
    verifyUnlockPin.rejected(null, 'rid-unlock', {}, { sessionEnded: true }),
};

// ── 계좌 목록 ─────────────────────────────────────────────────

test('계좌 0개: 정상이며 선택 계좌는 null', async () => {
  const store = makeStore();
  await loadAccounts(store, []);
  assert.deepEqual(asset(store).accounts, []);
  assert.equal(asset(store).selectedAccountId, null);
  assert.equal(asset(store).accountsLoading, false);
  assert.equal(asset(store).accountsError, null);
  assert.equal(gateway.requestsTo(LIST_PATH)[0].query, '');
});

test('계좌 여러 개: 순서·상태·라벨 유지, SUSPENDED/CLOSED도 표시, 기본 선택은 첫 ACTIVE', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: '1', status: 'CLOSED' }),
    acctRaw({ id: '2', status: 'SUSPENDED' }),
    acctRaw({ id: '3', status: 'ACTIVE', balance: '12345.6789' }),
  ]);
  const { accounts, selectedAccountId } = asset(store);
  assert.deepEqual(
    accounts.map(a => [a.id, a.status, a.label]),
    [
      ['1', 'CLOSED', '내 계좌 1'],
      ['2', 'SUSPENDED', '내 계좌 2'],
      ['3', 'ACTIVE', '내 계좌 3'],
    ]
  );
  assert.equal(selectedAccountId, '3');
  assert.equal(accounts[0].balance, 10000);
  assert.equal(accounts[2].balance, null, '소수 잔액은 반올림하지 않고 null');
  assert.equal(accounts[2].balanceExact, false);
  assert.equal(accounts[0].bankName, null);
  assert.equal(accounts[0].tokenId, null);
});

test('ACTIVE 계좌가 없으면 선택값 null (조회용 목록은 그대로)', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: '1', status: 'SUSPENDED' }),
    acctRaw({ id: '2', status: 'CLOSED' }),
  ]);
  assert.equal(asset(store).accounts.length, 2);
  assert.equal(asset(store).selectedAccountId, null);
});

test('선택 보정: 존재하는 SUSPENDED 선택은 유지, 사라진 선택은 기본 ACTIVE로, 없는 ID는 받지 않음', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2', status: 'SUSPENDED' })]);
  assert.equal(asset(store).selectedAccountId, '1');

  store.dispatch(setSelectedAccountId('2'));
  assert.equal(asset(store).selectedAccountId, '2');

  store.dispatch(setSelectedAccountId('99')); // 목록에 없음
  assert.equal(asset(store).selectedAccountId, '2');

  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2', status: 'SUSPENDED' })]);
  assert.equal(asset(store).selectedAccountId, '2', '재조회 후에도 조회용 선택 유지');

  await loadAccounts(store, [acctRaw({ id: '1' })]); // 2번 계좌 사라짐
  assert.equal(asset(store).selectedAccountId, '1');

  await loadAccounts(store, [acctRaw({ id: '5', status: 'CLOSED' })]); // ACTIVE 없음
  assert.equal(asset(store).selectedAccountId, null);
});

test('fetchAccounts 실패: 오류 상태가 남고 이전 계좌 목록은 유지', async () => {
  const store = makeStore();
  await loadAccounts(store);
  gateway.route('GET', LIST_PATH, jsonRoute({ message: 'boom' }, { status: 500 }));
  await store.dispatch(fetchAccounts());
  assert.equal(asset(store).accounts.length, 1);
  assert.ok(asset(store).accountsError);
  assert.equal(asset(store).accountsLoading, false);
});

test('큰 accountId 문자열 보존 및 이후 요청 경로에 그대로 사용', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: BIG_ACCOUNT_ID })]);
  assert.equal(asset(store).accounts[0].id, BIG_ACCOUNT_ID);
  assert.equal(asset(store).selectedAccountId, BIG_ACCOUNT_ID);

  gateway.route('GET', txListPath(BIG_ACCOUNT_ID), rawJsonRoute(txListRaw([txRaw()])));
  await store.dispatch(fetchTransactions({ queryKey: 'all:all' }));
  assert.equal(gateway.requestsTo(txListPath(BIG_ACCOUNT_ID)).length, 1);
});

// ── 거래 목록: 커서 페이지네이션·중복 제거 ────────────────────

test('거래 커서 페이지네이션: 첫 요청 쿼리 없음, 다음은 lastTransactionId=nextCursor, 서버 기간·page·size 미전송', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txListPath('1'), ({ record }) =>
    record.query === ''
      ? {
          rawBody: txListRaw([txRaw({ id: BIG_TX_ID }), txRaw({ id: '700' })], {
            nextCursor: BIG_CURSOR,
            hasNext: true,
          }),
        }
      : { rawBody: txListRaw([txRaw({ id: '600' })], { nextCursor: 'null', hasNext: false }) }
  );

  store.dispatch(resetTransactions({ queryKey: '2026-01-01:2026-10-11' }));
  await store.dispatch(
    fetchTransactions({
      page: 0,
      dateRange: { startKey: '2026-01-01', endKey: '2026-10-11' },
      queryKey: '2026-01-01:2026-10-11',
    })
  );
  let state = asset(store);
  assert.deepEqual(
    state.transactions.map(t => t.id),
    [BIG_TX_ID, '700']
  );
  assert.equal(state.transactionsNextCursor, BIG_CURSOR);
  assert.equal(state.transactionsHasNext, true);
  assert.equal(state.transactionsHasMore, true);
  assert.equal(state.transactionsAccountId, '1');

  await store.dispatch(
    fetchTransactions({
      page: state.transactionsNextPage,
      dateRange: { startKey: '2026-01-01', endKey: '2026-10-11' },
      queryKey: '2026-01-01:2026-10-11',
    })
  );
  state = asset(store);
  assert.deepEqual(
    state.transactions.map(t => t.id),
    [BIG_TX_ID, '700', '600']
  );
  assert.equal(state.transactionsHasNext, false);
  assert.equal(state.transactionsNextCursor, null);

  const [first, second] = gateway.requestsTo(txListPath('1'));
  assert.equal(first.query, '', '첫 페이지는 쿼리 없음(기간 파라미터 미전송)');
  assert.equal(second.query, `lastTransactionId=${BIG_CURSOR}`);
  for (const request of [first, second]) {
    assert.ok(!/page=|size=|startDate|endDate/.test(request.query));
  }

  // 더 불러올 것이 없으면 loadMore는 요청하지 않는다
  await store.dispatch(
    fetchTransactions({ page: state.transactionsNextPage, queryKey: '2026-01-01:2026-10-11' })
  );
  assert.equal(gateway.requestsTo(txListPath('1')).length, 2);
});

test('중복 거래 방지: 다음 페이지에 같은 transactionId가 다시 와도 한 번만', async () => {
  const store = makeStore();
  await loadAccounts(store);
  gateway.route('GET', txListPath('1'), ({ record }) => ({
    rawBody:
      record.query === ''
        ? txListRaw([txRaw({ id: '30' }), txRaw({ id: '20' })], { nextCursor: '20', hasNext: true })
        : txListRaw([txRaw({ id: '20' }), txRaw({ id: '10' })], { hasNext: false }),
  }));
  store.dispatch(resetTransactions({ queryKey: 'k' }));
  await store.dispatch(fetchTransactions({ queryKey: 'k' }));
  await store.dispatch(fetchTransactions({ page: 1, queryKey: 'k' }));
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['30', '20', '10']
  );
});

test('같은 커서 loadMore 연타 차단: 진행 중이면 두 번째 요청을 보내지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store);
  gateway.route('GET', txListPath('1'), ({ record }) =>
    record.query === ''
      ? { rawBody: txListRaw([txRaw({ id: '30' })], { nextCursor: '30', hasNext: true }) }
      : { rawBody: txListRaw([txRaw({ id: '20' })], { hasNext: false }), delay: LATE }
  );
  store.dispatch(resetTransactions({ queryKey: 'k' }));
  await store.dispatch(fetchTransactions({ queryKey: 'k' }));

  const p1 = store.dispatch(fetchTransactions({ page: 1, queryKey: 'k' }));
  const p2 = store.dispatch(fetchTransactions({ page: 1, queryKey: 'k' }));
  await Promise.all([p1, p2]);

  assert.equal(gateway.requestsTo(txListPath('1')).length, 2, '첫 페이지 1 + loadMore 1');
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['30', '20']
  );
  assert.equal(asset(store).transactionsLoadingMore, false);
});

test('라운드(queryKey) 변경: 이전 라운드의 늦은 응답은 무시되고 로딩 상태를 건드리지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store);
  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw({ id: '55' })]), { delay: LATE })
  );
  store.dispatch(resetTransactions({ queryKey: 'old' }));
  const oldRound = store.dispatch(fetchTransactions({ queryKey: 'old' }));
  store.dispatch(resetTransactions({ queryKey: 'new' }));
  await oldRound;
  assert.deepEqual(asset(store).transactions, []);

  store.dispatch(beginTransactionsRefresh());
  assert.equal(asset(store).transactionsLoadingMore, false);
});

// ── 계좌 전환 중 늦은 응답 ────────────────────────────────────

test('계좌 전환: 이전 계좌의 거래·상세·거래 단건 응답이 늦게 와도 현재 선택 계좌 상태를 덮지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  assert.equal(asset(store).selectedAccountId, '1');

  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw({ id: '111' })]), { delay: LATE })
  );
  gateway.route(
    'GET',
    detailPath('1'),
    rawJsonRoute(detailRaw({ accountId: '1', balance: '1.0000' }), { delay: LATE })
  );
  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' }), { delay: LATE }));
  gateway.route('GET', txListPath('2'), rawJsonRoute(txListRaw([txRaw({ id: '222' })])));

  store.dispatch(resetTransactions({ queryKey: 'k' }));
  const pending = [
    store.dispatch(fetchTransactions({ queryKey: 'k' })),
    store.dispatch(fetchAccountDetail()),
    store.dispatch(fetchTransactionDetail({ accountId: '1', transactionId: '111' })),
  ];

  store.dispatch(setSelectedAccountId('2'));
  await store.dispatch(fetchTransactions({ queryKey: 'k' }));
  await Promise.all(pending);

  const state = asset(store);
  assert.equal(state.selectedAccountId, '2');
  assert.deepEqual(
    state.transactions.map(t => t.id),
    ['222']
  );
  assert.equal(state.transactionsAccountId, '2');
  assert.equal(state.accountDetail, null);
  assert.equal(state.accountDetailLoading, false);
  assert.equal(state.transactionDetail, null);
});

test('계좌 전환 시 이전 계좌의 상세·거래·커서를 즉시 비운다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', detailPath('1'), rawJsonRoute(detailRaw({ accountId: '1' })));
  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw()], { nextCursor: '5', hasNext: true }))
  );
  await store.dispatch(fetchAccountDetail());
  await store.dispatch(fetchTransactions({}));
  assert.equal(asset(store).accountDetailAccountId, '1');
  assert.equal(asset(store).transactions.length, 1);

  store.dispatch(setSelectedAccountId('2'));
  const state = asset(store);
  assert.equal(state.accountDetail, null);
  assert.deepEqual(state.transactions, []);
  assert.equal(state.transactionsNextCursor, null);
  assert.equal(state.transactionsHasNext, false);
});

// ── API-11 / API-12 / API-14 ─────────────────────────────────

test('API-11 계좌 상세: 선택 계좌를 사용하고 잔액 정밀도·큰 id를 보존', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: BIG_ACCOUNT_ID })]);
  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(
      detailRaw({
        accountId: BIG_ACCOUNT_ID,
        balance: '12345.6789',
        transactions: [txRaw({ id: BIG_TX_ID, amount: '7000.0000' })],
      })
    )
  );
  await store.dispatch(fetchAccountDetail());
  const { accountDetail } = asset(store);
  assert.equal(accountDetail.accountId, BIG_ACCOUNT_ID);
  assert.equal(accountDetail.balance, null);
  assert.equal(accountDetail.balanceExact, false);
  assert.equal(accountDetail.transactionHistory[0].id, BIG_TX_ID);
  assert.equal(accountDetail.transactionHistory[0].amount, 7000);
  assert.equal(accountDetail.transactionHistory[0].amountExact, true);
});

test('API-12 거래 단건: 큰 id 보존, 선택 계좌 폴백, 유효한 계좌가 없으면 요청 자체를 거부', async () => {
  const store = makeStore();

  // 계좌 목록 없음 → 요청하지 않음
  await store.dispatch(fetchTransactionDetail(BIG_TX_ID));
  assert.ok(asset(store).transactionDetailError);
  assert.equal(gateway.requests.length, 0);

  await loadAccounts(store, [acctRaw({ id: BIG_ACCOUNT_ID })]);
  gateway.route(
    'GET',
    txPath(BIG_ACCOUNT_ID, BIG_TX_ID),
    rawJsonRoute(txRaw({ id: BIG_TX_ID, type: 'TRANSFER', status: 'FAILED' }))
  );
  await store.dispatch(fetchTransactionDetail(BIG_TX_ID)); // 문자열 인자 = 기존 호출 호환
  let { transactionDetail } = asset(store);
  assert.equal(transactionDetail.id, BIG_TX_ID);
  assert.equal(transactionDetail.status, 'FAILED');
  assert.equal(transactionDetail.direction, 'neutral');
  assert.equal(asset(store).transactionDetailError, null);

  // 목록에 없는 계좌 id는 추측하지 않고 거부
  const before = gateway.requests.length;
  await store.dispatch(fetchTransactionDetail({ accountId: '99', transactionId: '1' }));
  assert.equal(gateway.requests.length, before);
  assert.ok(asset(store).transactionDetailError);
});

test('API-14 계좌 새로고침: 중복 호출 차단, 선택 계좌 상세와 목록 잔액만 갱신', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route(
    'POST',
    refreshPath('1'),
    rawJsonRoute(detailRaw({ accountId: '1', balance: '95000.0000' }), { delay: LATE })
  );

  const first = store.dispatch(refreshAccount());
  const second = store.dispatch(refreshAccount());
  await Promise.all([first, second]);

  assert.equal(gateway.requestsTo(refreshPath('1')).length, 1);
  const state = asset(store);
  assert.equal(state.refreshingAccountId, null);
  assert.equal(state.accounts[0].balance, 95000);
  assert.equal(state.accounts[1].balance, 10000, '다른 계좌는 건드리지 않음');
  assert.equal(state.accountDetail.balance, 95000);

  // 자동 재시도·재호출 없이, 실패하면 오류 상태만 남는다
  gateway.route('POST', refreshPath('1'), jsonRoute({ message: 'x' }, { status: 500 }));
  await store.dispatch(refreshAccount());
  assert.ok(asset(store).refreshError);
  assert.equal(asset(store).refreshingAccountId, null);
  assert.equal(gateway.requestsTo(refreshPath('1')).length, 2);
});

// ── 로그아웃·세션 전환 ────────────────────────────────────────

const seedUserA = async store => {
  await loadAccounts(store, [acctRaw({ id: BIG_ACCOUNT_ID, balance: '777.0000' })]);
  gateway.route(
    'GET',
    txListPath(BIG_ACCOUNT_ID),
    rawJsonRoute(txListRaw([txRaw({ id: BIG_TX_ID })], { nextCursor: BIG_CURSOR, hasNext: true }))
  );
  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(detailRaw({ accountId: BIG_ACCOUNT_ID, balance: '777' }))
  );
  gateway.route('GET', SUMMARY_PATH, jsonRoute({ success: true, data: { balance: 777 } }));
  await store.dispatch(resetTransactions({ queryKey: 'k' }));
  await store.dispatch(fetchTransactions({ queryKey: 'k' }));
  await store.dispatch(fetchAccountDetail());
  await store.dispatch(fetchAccountSummary());
  assert.ok(asset(store).accounts.length > 0);
  assert.ok(asset(store).transactions.length > 0);
  assert.ok(asset(store).accountDetail);
};

const isInitialAssetState = (state, previous) => {
  assert.deepEqual(state.accounts, []);
  assert.equal(state.selectedAccountId, null);
  assert.equal(state.accountDetail, null);
  assert.deepEqual(state.transactions, []);
  assert.equal(state.transactionsNextCursor, null);
  assert.equal(state.transactionsHasNext, false);
  assert.equal(state.transactionDetail, null);
  assert.equal(state.summary, null);
  assert.equal(state.availableBalanceDetail, null);
  for (const key of [
    'accountsLoading',
    'accountDetailLoading',
    'transactionsLoading',
    'transactionsLoadingMore',
    'transactionDetailLoading',
    'summaryLoading',
    'availableBalanceLoading',
    'transferLoading',
  ]) {
    assert.equal(state[key], false, key);
  }
  for (const key of [
    'accountsError',
    'accountDetailError',
    'transactionsError',
    'transactionDetailError',
    'summaryError',
    'availableBalanceError',
    'transferError',
    'refreshError',
  ]) {
    assert.equal(state[key], null, key);
  }
  assert.equal(state.refreshingAccountId, null);
  assert.equal(state.accountsRequestId, null);
  assert.ok(state.sessionGeneration > previous.sessionGeneration, 'sessionGeneration은 증가');
  assert.ok(
    state.transactionsActiveQuerySeq > previous.transactionsActiveQuerySeq,
    '거래 라운드 seq는 감소하지 않고 증가'
  );
};

for (const [name, makeAction] of Object.entries(sessionEnders)) {
  test(`세션 종료·전환 시 Asset 상태 전체 초기화: ${name}`, async () => {
    const store = makeStore();
    await seedUserA(store);
    const previous = asset(store);
    store.dispatch(makeAction());
    isInitialAssetState(asset(store), previous);
  });
}

test('logoutUser.pending 직후(fulfilled 대기 전) 이전 계좌 데이터가 즉시 제거된다', async () => {
  const store = makeStore();
  await seedUserA(store);
  store.dispatch(logoutUser.pending('rid-logout'));
  assert.deepEqual(asset(store).accounts, []);
  assert.equal(asset(store).accountDetail, null);
  assert.deepEqual(asset(store).transactions, []);
});

test('세션이 유지되는 경우는 초기화하지 않는다: verifyUnlockPin 일반 실패, restoreSession', async () => {
  const store = makeStore();
  await seedUserA(store);
  store.dispatch(verifyUnlockPin.rejected(null, 'rid', {}, { sessionEnded: false }));
  store.dispatch(verifyUnlockPin.rejected(null, 'rid', {}, undefined));
  store.dispatch(verifyUnlockPin.fulfilled({}, 'rid', {}));
  assert.equal(asset(store).accounts.length, 1);
  assert.ok(asset(store).accountDetail);
});

for (const [name, makeAction] of Object.entries(sessionEnders)) {
  test(`세션 종료 후 늦게 도착하는 모든 관련 응답 차단 (${name}): fulfilled·rejected 모두 상태 불변`, async () => {
    const store = makeStore();
    await seedUserA(store);

    // 모든 경로를 "느린 성공" 또는 "느린 실패"로 시작
    gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '555' })), { delay: LATE }));
    gateway.route(
      'GET',
      detailPath(BIG_ACCOUNT_ID),
      rawJsonRoute(detailRaw({ accountId: BIG_ACCOUNT_ID }), { delay: LATE })
    );
    gateway.route(
      'GET',
      txListPath(BIG_ACCOUNT_ID),
      rawJsonRoute(txListRaw([txRaw({ id: '4444' })]), { delay: LATE })
    );
    gateway.route(
      'GET',
      txPath(BIG_ACCOUNT_ID, '4444'),
      rawJsonRoute(txRaw({ id: '4444' }), { delay: LATE })
    );
    gateway.route(
      'POST',
      refreshPath(BIG_ACCOUNT_ID),
      rawJsonRoute(detailRaw({ accountId: BIG_ACCOUNT_ID }), { delay: LATE })
    );
    gateway.route('GET', SUMMARY_PATH, jsonRoute(authEnvelope({ balance: 999 }), { delay: LATE }));
    gateway.route('GET', AVAILABLE_PATH, jsonRoute({ message: 'x' }, { status: 500, delay: LATE }));
    gateway.route(
      'POST',
      TRANSFER_PATH,
      jsonRoute(transferResponse('PROCESSING'), { delay: LATE })
    );

    store.dispatch(resetTransactions({ queryKey: 'k' }));
    const inflight = [
      store.dispatch(fetchAccounts()),
      store.dispatch(fetchAccountDetail()),
      store.dispatch(fetchTransactions({ queryKey: 'k' })),
      store.dispatch(fetchTransactionDetail({ accountId: BIG_ACCOUNT_ID, transactionId: '4444' })),
      store.dispatch(refreshAccount()),
      store.dispatch(fetchAccountSummary()),
      store.dispatch(fetchAvailableBalance()),
      store.dispatch(transferFunds(TRANSFER_INPUT)),
    ];

    store.dispatch(makeAction());
    const snapshotAfterEnd = JSON.stringify(asset(store));

    await Promise.all(inflight);
    await sleep(20);

    assert.equal(
      JSON.stringify(asset(store)),
      snapshotAfterEnd,
      '세션 종료 이후 도착한 응답이 Redux 상태를 바꾸면 안 된다'
    );
  });
}

test('사용자 A → 로그아웃 → 사용자 B: A의 계좌 데이터는 어떤 상태 변화에서도 다시 나타나지 않는다', async () => {
  const store = makeStore();
  await seedUserA(store);

  // A의 요청이 진행 중인 채로 로그아웃
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(listRaw(acctRaw({ id: BIG_ACCOUNT_ID, balance: '777.0000' })), { delay: LATE })
  );
  const lateA = store.dispatch(fetchAccounts());

  const leaked = [];
  const FORBIDDEN = [BIG_ACCOUNT_ID, BIG_TX_ID, BIG_CURSOR, '777'];
  let loggedOut = false;
  store.subscribe(() => {
    if (!loggedOut) return;
    const serialized = JSON.stringify(asset(store));
    for (const value of FORBIDDEN) {
      if (serialized.includes(value)) leaked.push(value);
    }
  });

  store.dispatch(logoutUser.pending('rid-logout'));
  loggedOut = true;
  store.dispatch(logoutUser.fulfilled({}, 'rid-logout'));

  // 사용자 B 로그인과 B의 요청
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(listRaw(acctRaw({ id: '4242', balance: '5.0000' })))
  );
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login-b', {}));
  await store.dispatch(fetchAccounts());
  await lateA;
  await sleep(LATE);

  assert.deepEqual(leaked, [], 'A의 데이터가 B 세션 상태에 나타났다');
  assert.deepEqual(
    asset(store).accounts.map(a => [a.id, a.balance]),
    [['4242', 5]]
  );
});

test('로그아웃 이후 새로 시작한 요청은 정상 반영되고, 초기화 후 새 송금 dispatch가 막히지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFER_PATH, jsonRoute(transferResponse('COMPLETED'), { delay: LATE }));
  const oldTransfer = store.dispatch(transferFunds(TRANSFER_INPUT));
  assert.equal(asset(store).transferLoading, true);

  store.dispatch(logoutUser.pending('rid-logout'));
  assert.equal(asset(store).transferLoading, false);

  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  gateway.route('POST', TRANSFER_PATH, jsonRoute(transferResponse('COMPLETED')));
  const newTransfer = store.dispatch(transferFunds({ ...TRANSFER_INPUT, amount: 2000 }));
  assert.equal(asset(store).transferLoading, true, '새 송금은 막히지 않는다');
  await Promise.all([oldTransfer, newTransfer]);
  assert.equal(asset(store).transferLoading, false);
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 2);

  await loadAccounts(store, [acctRaw({ id: '9' })]);
  assert.equal(asset(store).accounts[0].id, '9');
});

test('transferFunds 요청 계약 불변: Idempotency-Key 헤더 유지', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFER_PATH, jsonRoute(transferResponse('COMPLETED')));
  await store.dispatch(transferFunds({ ...TRANSFER_INPUT, idempotencyKey: undefined }));
  const [request] = gateway.requestsTo(TRANSFER_PATH);
  assert.ok(request.headers['idempotency-key']);
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
// ═══════════════════════════════════════════════════════════════
// C-3: 거래 상세 reducer 보정(요청 식별 기반) + 거래내역/거래 상세 화면의 요청 프로토콜 모델
// 화면 effect는 렌더러 없이 실행할 수 없으므로, 화면이 따르는 dispatch 규칙(요청 키 게이트·세대·재시도)을
// 아래 모델로 옮겨 실제 Redux 스토어 + 모의 Gateway의 *네트워크 요청 횟수*를 검증한다.
// 화면 소스와의 일치는 assetUiWiring.test.mjs의 정적 단언이 고정한다. (렌더 실행·Android는 미검증)
// ═══════════════════════════════════════════════════════════════

const { clearTransactionDetail } = assetActions;
const failBody = { message: 'boom' };

// ── 상세 reducer ──

test('C-3 상세: route accountId가 선택 계좌와 달라도(둘 다 목록 내) 저장되고 로딩이 풀린다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  assert.equal(asset(store).selectedAccountId, '1');
  gateway.route('GET', txPath('2', '222'), rawJsonRoute(txRaw({ id: '222', type: 'WITHDRAW' })));
  await store.dispatch(fetchTransactionDetail({ accountId: '2', transactionId: '222' }));
  const state = asset(store);
  assert.equal(state.transactionDetail.id, '222');
  assert.equal(state.transactionDetailAccountId, '2');
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(state.transactionDetailRequestId, null);
  assert.equal(state.transactionDetailError, null);
  assert.equal(state.selectedAccountId, '1', '선택 계좌는 바뀌지 않는다');
});

test('C-3 상세: 응답의 거래 id·계좌 id가 요청과 다르면 저장하지 않고 로딩을 풀며 오류를 남긴다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  const arg = { accountId: '1', transactionId: '111' };
  const transaction = JSON.parse(txRaw({ id: '999' }));

  store.dispatch(fetchTransactionDetail.pending('rid-a', arg));
  store.dispatch(fetchTransactionDetail.fulfilled({ accountId: '1', transaction }, 'rid-a', arg));
  let state = asset(store);
  assert.equal(state.transactionDetail, null, '다른 거래는 저장하지 않는다');
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(state.transactionDetailRequestId, null);
  assert.ok(state.transactionDetailError);

  const same = JSON.parse(txRaw({ id: '111' }));
  store.dispatch(fetchTransactionDetail.pending('rid-b', arg));
  store.dispatch(
    fetchTransactionDetail.fulfilled({ accountId: '2', transaction: same }, 'rid-b', arg)
  );
  state = asset(store);
  assert.equal(state.transactionDetail, null, '다른 계좌의 응답은 저장하지 않는다');
  assert.equal(state.transactionDetailLoading, false);
  assert.ok(state.transactionDetailError);
});

test('C-3 상세: 응답이 도착했을 때 요청 계좌가 목록에서 사라졌으면 저장하지 않고 로딩을 푼다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  const arg = { accountId: '2', transactionId: '222' };
  store.dispatch(fetchTransactionDetail.pending('rid-c', arg));
  await loadAccounts(store, [acctRaw({ id: '1' })]); // 계좌 2가 사라진 목록
  store.dispatch(
    fetchTransactionDetail.fulfilled(
      { accountId: '2', transaction: JSON.parse(txRaw({ id: '222' })) },
      'rid-c',
      arg
    )
  );
  const state = asset(store);
  assert.equal(state.transactionDetail, null);
  assert.equal(state.transactionDetailLoading, false);
  assert.ok(state.transactionDetailError);
});

test('C-3 상세: rejected도 선택 계좌와 달라도 로딩을 풀고, 낡은 requestId는 무시한다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', txPath('2', '222'), jsonRoute(failBody, { status: 500 }));
  await store.dispatch(fetchTransactionDetail({ accountId: '2', transactionId: '222' }));
  let state = asset(store);
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(state.transactionDetailRequestId, null);
  assert.ok(state.transactionDetailError);

  const arg = { accountId: '2', transactionId: '222' };
  store.dispatch(fetchTransactionDetail.pending('rid-new', arg));
  store.dispatch(fetchTransactionDetail.rejected(null, 'rid-old', arg, { message: 'late' }));
  state = asset(store);
  assert.equal(
    state.transactionDetailLoading,
    true,
    '낡은 요청의 실패가 현재 요청을 끝내지 않는다'
  );
  assert.equal(state.transactionDetailRequestId, 'rid-new');
});

test('C-3 상세: 새 요청의 pending은 다른 거래의 이전 상세를 즉시 비운다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' })));
  await store.dispatch(fetchTransactionDetail({ accountId: '1', transactionId: '111' }));
  assert.equal(asset(store).transactionDetail.id, '111');
  store.dispatch(
    fetchTransactionDetail.pending('rid-next', {
      accountId: '1',
      transactionId: '222',
    })
  );
  assert.equal(asset(store).transactionDetail, null);
  assert.equal(asset(store).transactionDetailAccountId, null);
});

test('C-3 상세: 요청 중 계좌 전환 → 데이터·오류·로딩이 모두 없는 무효화 상태, 늦은 응답은 무시', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' }), { delay: LATE }));
  const inflight = store.dispatch(fetchTransactionDetail({ accountId: '1', transactionId: '111' }));
  store.dispatch(setSelectedAccountId('2'));
  const state = asset(store);
  assert.equal(state.transactionDetail, null);
  assert.equal(state.transactionDetailError, null);
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(state.transactionDetailRequestId, null);
  await inflight;
  assert.equal(asset(store).transactionDetail, null, '늦은 응답은 반영되지 않는다');
  assert.equal(asset(store).transactionDetailLoading, false);
});

test('C-3 상세: 사용자 A 요청 중 로그아웃 → 사용자 B(동일 accountId) 로그인, A의 늦은 응답은 B 상태에 닿지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '7' })]);
  gateway.route(
    'GET',
    txPath('7', '70'),
    rawJsonRoute(txRaw({ id: '70', amount: '111' }), { delay: LATE })
  );
  const aInflight = store.dispatch(fetchTransactionDetail({ accountId: '7', transactionId: '70' }));
  const generationA = asset(store).sessionGeneration;

  store.dispatch(logoutUser.pending('rid-logout'));
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  assert.ok(asset(store).sessionGeneration > generationA, '세션 세대가 달라진다');
  await loadAccounts(store, [acctRaw({ id: '7' })]); // B도 같은 accountId를 가진다
  await aInflight;
  assert.equal(asset(store).transactionDetail, null, 'A의 응답은 B 상태에 반영되지 않는다');
  assert.equal(asset(store).transactionDetailLoading, false);

  gateway.route('GET', txPath('7', '70'), rawJsonRoute(txRaw({ id: '70', amount: '222' })));
  await store.dispatch(fetchTransactionDetail({ accountId: '7', transactionId: '70' }));
  assert.equal(asset(store).transactionDetail.amount, 222, 'B의 요청은 별도로 정상 반영된다');
});

// ── 계좌 목록 요청 횟수 ──

test('C-3 계좌 0개 정상 응답/조회 실패: 스토어는 스스로 재요청하지 않고, 명시적 재dispatch만 요청을 늘린다', async () => {
  const store = makeStore();
  await loadAccounts(store, []);
  await sleep(40);
  assert.equal(gateway.requestsTo(LIST_PATH).length, 1);
  assert.deepEqual(asset(store).accounts, []);
  assert.equal(asset(store).accountsError, null);

  gateway.route('GET', LIST_PATH, jsonRoute(failBody, { status: 500 }));
  await store.dispatch(fetchAccounts());
  await sleep(40);
  assert.equal(gateway.requestsTo(LIST_PATH).length, 2);
  assert.ok(asset(store).accountsError);
  assert.equal(asset(store).accountsLoading, false);

  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' }))));
  await store.dispatch(fetchAccounts()); // "다시 시도"
  assert.equal(gateway.requestsTo(LIST_PATH).length, 3);
  assert.equal(asset(store).accounts.length, 1);
});

// ── 거래 상세 화면 프로토콜 모델 (소스의 요청 effect/다시 시도 규칙) ──

const makeDetailScreen = (store, accountId, transactionId) => {
  const s = { key: null, requestedKey: null };
  const pending = [];
  const known = () => asset(store).accounts.some(account => account.id === accountId);
  // effect: deps [sessionGeneration, accountId, transactionId, accountKnown] — accountsLoading은 조건이 아니다
  const effect = () => {
    if (!known()) {
      s.key = null;
      return;
    }
    const key = `${asset(store).sessionGeneration}|${accountId}|${transactionId}`;
    if (s.key === key) return;
    s.key = key;
    s.requestedKey = key;
    store.dispatch(clearTransactionDetail());
    pending.push(store.dispatch(fetchTransactionDetail({ accountId, transactionId })));
  };
  const retry = () => {
    const a = asset(store);
    if (a.transactionDetailLoading && a.transactionDetailRequestId !== null) return;
    if (!known()) return;
    s.key = `${a.sessionGeneration}|${accountId}|${transactionId}`;
    s.requestedKey = s.key;
    store.dispatch(clearTransactionDetail());
    pending.push(store.dispatch(fetchTransactionDetail({ accountId, transactionId })));
  };
  const settle = () => Promise.all(pending.splice(0));
  return { effect, retry, settle, state: s };
};

const detailCalls = (id, tx) => gateway.requestsTo(txPath(id, tx)).length;

test('C-3 상세 화면: 목록이 있는 상태에서 다른 화면의 fetchAccounts 진행 중 진입해도 즉시 1회 요청하고, 로딩 해제 뒤 누락·중복·취소가 없다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' })), { delay: LATE }));
  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' }), { delay: LATE / 2 }));
  const listInflight = store.dispatch(fetchAccounts());
  assert.equal(asset(store).accountsLoading, true);

  const screen = makeDetailScreen(store, '1', '111');
  screen.effect(); // 마운트: accountKnown=true, accountsLoading=true
  await sleep(20); // 요청이 Gateway에 도달할 시간
  assert.equal(detailCalls('1', '111'), 1, '로딩 중이어도 즉시 요청');
  await listInflight; // accountsLoading=false
  screen.effect(); // deps 불변 → 재실행되지 않음(재실행되어도 키 게이트가 막음)
  await screen.settle();
  assert.equal(detailCalls('1', '111'), 1);
  assert.equal(asset(store).transactionDetail.id, '111');
  assert.equal(asset(store).transactionDetailLoading, false);
});

test('C-3 상세 화면: 목록 재조회 결과에서 요청 계좌가 사라지면 저장하지 않고 로딩이 풀리며 요청은 늘지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', txPath('2', '222'), rawJsonRoute(txRaw({ id: '222' }), { delay: LATE }));
  const screen = makeDetailScreen(store, '2', '222');
  screen.effect();
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' }))));
  await store.dispatch(fetchAccounts());
  screen.effect();
  await screen.settle();
  const state = asset(store);
  assert.equal(state.transactionDetail, null);
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(detailCalls('2', '222'), 1, '요청 계좌가 사라진 뒤 추가 요청 없음');
});

test('C-3 상세 화면: 실패 후 자동 재시도 없음 → 다시 시도 때만 +1, 연타해도 마지막 요청 하나', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txPath('1', '111'), jsonRoute(failBody, { status: 500 }));
  const screen = makeDetailScreen(store, '1', '111');
  screen.effect();
  await screen.settle();
  screen.effect();
  screen.effect();
  await sleep(40);
  assert.equal(detailCalls('1', '111'), 1, '자동 재시도 0');
  assert.ok(asset(store).transactionDetailError);
  assert.equal(asset(store).transactionDetailLoading, false);

  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' }), { delay: LATE / 2 }));
  screen.retry();
  screen.retry(); // 진행 중 연타는 무시
  await screen.settle();
  assert.equal(detailCalls('1', '111'), 2);
  assert.equal(asset(store).transactionDetail.id, '111');
  assert.equal(asset(store).transactionDetailError, null);
});

test('C-3 상세 화면: 요청 무효화(계좌 전환) 뒤에는 자동 재요청 없이 안내 상태로 남고, 다시 시도 때만 +1', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' }), { delay: LATE }));
  const screen = makeDetailScreen(store, '1', '111');
  screen.effect();
  store.dispatch(setSelectedAccountId('2')); // 무효화
  screen.effect(); // accountKnown 그대로 → 요청 없음
  await screen.settle();
  const state = asset(store);
  assert.equal(state.transactionDetail, null);
  assert.equal(state.transactionDetailError, null);
  assert.equal(state.transactionDetailLoading, false);
  assert.equal(state.transactionDetailRequestId, null);
  assert.equal(
    screen.state.requestedKey,
    screen.state.key,
    '요청을 보냈지만 무효화된 상태(재시도 안내)'
  );
  assert.equal(detailCalls('1', '111'), 1);

  gateway.route('GET', txPath('1', '111'), rawJsonRoute(txRaw({ id: '111' })));
  screen.retry();
  await screen.settle();
  assert.equal(detailCalls('1', '111'), 2);
  assert.equal(asset(store).transactionDetail.id, '111');
});

// ── 거래내역 화면 프로토콜 모델 ──

const makeHistoryScreen = store => {
  const s = {
    key: null,
    accountId: null,
    retryPending: false,
    kind: null,
    gen: 0,
    refreshing: false,
  };
  const pending = [];
  const readyId = () => {
    const a = asset(store);
    return a.accounts.some(account => account.id === a.selectedAccountId)
      ? a.selectedAccountId
      : null;
  };
  // 첫 페이지 effect: deps [sessionGeneration, readyAccountId, routeSeedPending, refreshGeneration]
  const effect = () => {
    const id = readyId();
    if (id === null) {
      s.key = null;
      s.accountId = null;
      s.retryPending = false;
      return;
    }
    const key = `${asset(store).sessionGeneration}#${id}#${s.gen}`;
    if (s.key === key) return;
    s.key = key;
    s.retryPending = false;
    const queryKey = `account:${id}`;
    if (s.accountId === id) store.dispatch(beginTransactionsRefresh());
    else store.dispatch(resetTransactions({ queryKey }));
    s.accountId = id;
    s.kind = 'first';
    pending.push(store.dispatch(fetchTransactions({ accountId: id, queryKey })));
  };
  const refresh = async () => {
    const a = asset(store);
    if (s.refreshing || a.accountsLoading || a.transactionsLoading) return;
    s.refreshing = true;
    const started = readyId();
    try {
      const result = await store.dispatch(fetchAccounts());
      if (!fetchAccounts.fulfilled.match(result)) return;
      if (started === null) return;
      const fresh = asset(store);
      if (fresh.selectedAccountId === started && fresh.accounts.some(x => x.id === started)) {
        s.gen += 1;
      }
    } finally {
      s.refreshing = false;
    }
    effect();
  };
  const firstPageRetry = () => {
    if (readyId() === null || s.retryPending || asset(store).transactionsLoading) return;
    s.retryPending = true;
    s.gen += 1;
    effect();
  };
  const nextPage = () => {
    const a = asset(store);
    const id = readyId();
    if (id === null || a.transactionsAccountId !== id) return;
    if (!a.transactionsHasNext || a.transactionsLoading || a.transactionsLoadingMore) return;
    s.kind = 'more';
    pending.push(
      store.dispatch(
        fetchTransactions({
          accountId: id,
          cursor: a.transactionsNextCursor,
          queryKey: `account:${id}`,
        })
      )
    );
  };
  const settle = () => Promise.all(pending.splice(0));
  return { effect, refresh, firstPageRetry, nextPage, settle, state: s };
};

const listCalls = id => gateway.requestsTo(txListPath(id)).length;

test('C-3 거래내역 화면: 최초 진입 1회, 같은 키 effect 재실행(StrictMode)·accountsLoading 토글은 요청 0', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw({ id: '10' })]), { delay: 30 })
  );
  const screen = makeHistoryScreen(store);
  screen.effect();
  screen.effect(); // 동일 effect 2회
  const seqAfterFirst = asset(store).transactionsActiveQuerySeq;
  screen.effect();
  assert.equal(
    asset(store).transactionsActiveQuerySeq,
    seqAfterFirst,
    '중복은 요청 전에 차단(seq 미증가)'
  );
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' }))));
  await store.dispatch(fetchAccounts()); // accountsLoading true→false, 배열 교체
  screen.effect();
  await screen.settle();
  assert.equal(listCalls('1'), 1);
  assert.equal(asset(store).transactions.length, 1);
});

test('C-3 거래내역 화면: 새로고침 1회 = 계좌 조회 1 + 첫 페이지 1, 진행 중 연타는 추가 0, 기존 목록은 교체', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txListPath('1'), rawJsonRoute(txListRaw([txRaw({ id: '10' })])));
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();
  const listBefore = gateway.requestsTo(LIST_PATH).length;

  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' })), { delay: 40 }));
  gateway.route('GET', txListPath('1'), rawJsonRoute(txListRaw([txRaw({ id: '11' })])));
  const first = screen.refresh();
  const second = screen.refresh(); // 진행 중 연타
  await Promise.all([first, second]);
  await screen.settle();
  assert.equal(gateway.requestsTo(LIST_PATH).length, listBefore + 1);
  assert.equal(listCalls('1'), 2);
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['11']
  );
});

test('C-3 거래내역 화면: 새로고침 중 계좌 조회 실패 → 거래 요청 0, 로딩 고착 없음', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txListPath('1'), rawJsonRoute(txListRaw([txRaw({ id: '10' })])));
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();
  gateway.route('GET', LIST_PATH, jsonRoute(failBody, { status: 500 }));
  await screen.refresh();
  await screen.settle();
  assert.equal(listCalls('1'), 1);
  assert.equal(asset(store).transactionsLoading, false);
  assert.equal(asset(store).accountsLoading, false);
  assert.equal(asset(store).transactions.length, 1, '기존 목록 유지');
});

test('C-3 거래내역 화면: 계좌 목록 오류 → 거래 0 → 다시 시도 성공 시 첫 페이지 1회', async () => {
  const store = makeStore();
  gateway.route('GET', LIST_PATH, jsonRoute(failBody, { status: 500 }));
  await store.dispatch(fetchAccounts());
  const screen = makeHistoryScreen(store);
  screen.effect();
  assert.equal(listCalls('1'), 0);
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' }))));
  gateway.route('GET', txListPath('1'), rawJsonRoute(txListRaw([txRaw({ id: '10' })])));
  await screen.refresh(); // 조회 가능 상태가 되면 effect가 1회 요청
  screen.effect();
  await screen.settle();
  assert.equal(listCalls('1'), 1);
});

test('C-3 거래내역 화면: 계좌 A→B 변경 시 B만 1회 조회, A의 늦은 응답 무시 / 계좌가 사라지면 0, 같은 id로 복귀하면 1', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw({ id: '10' })]), { delay: LATE })
  );
  gateway.route('GET', txListPath('2'), rawJsonRoute(txListRaw([txRaw({ id: '20' })])));
  const screen = makeHistoryScreen(store);
  screen.effect();
  store.dispatch(setSelectedAccountId('2'));
  screen.effect();
  await screen.settle();
  assert.equal(listCalls('1'), 1);
  assert.equal(listCalls('2'), 1);
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['20']
  );
  assert.equal(asset(store).transactionsAccountId, '2');

  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw(acctRaw({ id: '1' }))));
  await store.dispatch(fetchAccounts()); // 계좌 2 사라짐 → 선택 보정
  screen.effect();
  await screen.settle();
  assert.equal(listCalls('2'), 1, '사라진 계좌는 더 조회하지 않음');

  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(listRaw(acctRaw({ id: '1' }), acctRaw({ id: '2' })))
  );
  await store.dispatch(fetchAccounts());
  store.dispatch(setSelectedAccountId('2'));
  screen.effect();
  await screen.settle();
  assert.equal(listCalls('2'), 2, '복귀하면 정상적으로 1회 다시 조회');
});

test('C-3 거래내역 화면: 첫 페이지 실패 → 다시 시도 → 성공(총 2회), 연타해도 +1', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  let call = 0;
  gateway.route('GET', txListPath('1'), () => {
    call += 1;
    return call === 1
      ? { status: 500, body: failBody }
      : { rawBody: txListRaw([txRaw({ id: '10' })]), delay: 30 };
  });
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();
  assert.ok(asset(store).transactionsError);
  assert.equal(screen.state.kind, 'first');
  assert.equal(asset(store).transactionsLoading, false);

  screen.effect();
  screen.effect();
  await sleep(40);
  assert.equal(listCalls('1'), 1, '자동 반복 없음');

  screen.firstPageRetry();
  screen.firstPageRetry(); // 연타
  await screen.settle();
  assert.equal(listCalls('1'), 2);
  assert.equal(asset(store).transactionsError, null);
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['10']
  );
  assert.equal(asset(store).transactionsLoading, false);
});

test('C-3 거래내역 화면: 첫 페이지 실패 → 다시 시도 → 재실패 후 로딩 고착·자동 반복 없음, 다시 누르면 +1', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  gateway.route('GET', txListPath('1'), jsonRoute(failBody, { status: 500 }));
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();
  screen.firstPageRetry();
  await screen.settle();
  assert.equal(listCalls('1'), 2);
  assert.ok(asset(store).transactionsError);
  assert.equal(asset(store).transactionsLoading, false);
  screen.effect();
  await sleep(60);
  assert.equal(listCalls('1'), 2, '재실패 뒤 자동 반복 없음');
  screen.firstPageRetry();
  await screen.settle();
  assert.equal(listCalls('1'), 3);
});

test('C-3 거래내역 화면: 다음 페이지 실패 → 같은 cursor로 재시도, 목록 유지·중복 없음, 오류 종류 구분', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  let call = 0;
  gateway.route('GET', txListPath('1'), () => {
    call += 1;
    if (call === 1) {
      return {
        rawBody: txListRaw([txRaw({ id: '10' })], {
          nextCursor: BIG_CURSOR,
          hasNext: true,
        }),
      };
    }
    if (call === 2) return { status: 500, body: failBody };
    return { rawBody: txListRaw([txRaw({ id: '10' }), txRaw({ id: '9' })]) };
  });
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();
  screen.nextPage();
  await screen.settle();
  assert.equal(screen.state.kind, 'more');
  assert.ok(asset(store).transactionsError);
  assert.equal(asset(store).transactionsNextCursor, BIG_CURSOR, '실패해도 커서 유지');

  screen.nextPage();
  await screen.settle();
  const queries = gateway.requestsTo(txListPath('1')).map(r => r.query);
  assert.equal(queries.length, 3);
  assert.equal(queries[0], '');
  assert.equal(queries[1], `lastTransactionId=${BIG_CURSOR}`);
  assert.equal(queries[2], queries[1], '동일 cursor 재시도');
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['10', '9'],
    '중복 거래 없음'
  );
  assert.equal(asset(store).transactionsError, null);
});

test('C-3 거래내역 화면: 재시도 직후 계좌 변경/로그아웃 → 이전 요청의 늦은 응답 무시, 재시도 의도 폐기', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' }), acctRaw({ id: '2' })]);
  gateway.route('GET', txListPath('1'), jsonRoute(failBody, { status: 500 }));
  const screen = makeHistoryScreen(store);
  screen.effect();
  await screen.settle();

  gateway.route(
    'GET',
    txListPath('1'),
    rawJsonRoute(txListRaw([txRaw({ id: '10' })]), { delay: LATE })
  );
  gateway.route('GET', txListPath('2'), rawJsonRoute(txListRaw([txRaw({ id: '20' })])));
  screen.firstPageRetry();
  store.dispatch(setSelectedAccountId('2'));
  screen.effect();
  await screen.settle();
  assert.equal(asset(store).transactionsAccountId, '2');
  assert.deepEqual(
    asset(store).transactions.map(t => t.id),
    ['20']
  );

  // 로그아웃 후에는 재시도 의도가 폐기되고 요청이 없다
  store.dispatch(logoutUser.pending('rid-lo'));
  const before = gateway.requests.length;
  screen.firstPageRetry();
  screen.effect();
  await sleep(30);
  assert.equal(gateway.requests.length, before, '로그아웃 후 거래 요청 0');
  assert.equal(asset(store).transactions.length, 0);
});

// ── 최신 명세(20261014): 계좌별 서버 은행 정보 ───────────────────

test('계좌 목록: 서버 bankCode·bankName이 계좌별 라벨이 되고 여러 은행이 섞이지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: '123456789012345679', bankCode: '"001"', bankName: '"카카오뱅크"' }),
    acctRaw({ id: '123456789012345680', bankCode: '"008"', bankName: '"토스뱅크"' }),
    acctRaw({ id: '123456789012345681', bankCode: '"008"', bankName: 'null' }), // 코드 매핑
    acctRaw({ id: '123456789012345682' }), // 은행 정보 없음 → 기존 중립 라벨
  ]);
  const { accounts } = asset(store);
  assert.deepEqual(
    accounts.map(a => [a.id, a.bankCode, a.bankName, a.label]),
    [
      ['123456789012345679', '001', '카카오뱅크', '카카오뱅크'],
      ['123456789012345680', '008', '토스뱅크', '토스뱅크 1'],
      ['123456789012345681', '008', '토스뱅크', '토스뱅크 2'],
      ['123456789012345682', null, null, '내 계좌 4'],
    ]
  );
  // API-52에서 제거된 필드는 만들어 내지 않는다.
  assert.ok(accounts.every(a => a.syncStatus === null && a.createdAt === null));
});

test('계좌 목록: 은행 정보가 없는 기존 계좌 1개는 기존처럼 "내 계좌"', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1' })]);
  assert.equal(asset(store).accounts[0].label, '내 계좌');
  assert.equal(asset(store).accounts[0].bankName, null);
});

test('사용자 A → 로그아웃 → 사용자 B: A의 은행 정보가 B 상태에 남지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [acctRaw({ id: '1', bankCode: '"001"', bankName: '"카카오뱅크"' })]);
  assert.equal(asset(store).accounts[0].bankName, '카카오뱅크');

  store.dispatch(logoutUser.pending('rid-logout'));
  assert.deepEqual(asset(store).accounts, []);
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  await loadAccounts(store, [acctRaw({ id: '2' })]);
  assert.equal(asset(store).accounts[0].bankName, null);
  assert.equal(asset(store).accounts[0].label, '내 계좌');
});
