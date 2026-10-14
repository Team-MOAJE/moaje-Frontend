// Asset 매퍼·선택 유틸·상태 매핑·거래 어댑터 단위 테스트 (순수 함수, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/assetMappers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIG_ACCOUNT_ID, BIG_TX_ID, everRequested } from './assetTestEnv.mjs';

const {
  normalizeAccount,
  normalizeAccountList,
  normalizeAccountDetail,
  normalizeTransaction,
  normalizeSummary,
  normalizeDailyLimit,
} = await import('../../src/utils/apiMappers.js');
const { mapTransactionStatus } = await import('../../src/utils/mapTransactionStatus.js');
const { selectDefaultAccount, resolveSelectedAccountId, resolveActiveAccount } =
  await import('../../src/utils/selectDefaultAccount.js');
const { buildTransactionsCursorQuery, extractTransactionListResult, filterByPeriod } =
  await import('../../src/features/asset/transactionQueryAdapter.js');

const accountModel = (overrides = {}) => ({
  accountId: '1',
  balance: 10000,
  balanceExact: true,
  status: 'ACTIVE',
  syncStatus: 'SYNCED',
  lastSyncedAt: null,
  createdAt: '2026-10-11T03:00:00',
  ...overrides,
});

const txModel = (overrides = {}) => ({
  transactionId: '789',
  publicTransactionId: 'p',
  type: 'DEPOSIT',
  amount: 1000,
  amountExact: true,
  targetAccountId: null,
  status: 'SUCCESS',
  merchantName: null,
  categoryCode: 'INCOME',
  createdAt: '2026-10-11T03:00:00',
  ...overrides,
});

// ── 계좌 매퍼 ────────────────────────────────────────────────

test('normalizeAccount: 서버에 없는 은행명·토큰·주 계좌를 만들지 않고, 정확하지 않은 잔액은 null', () => {
  assert.deepEqual(normalizeAccount(accountModel()), {
    id: '1',
    balance: 10000,
    balanceExact: true,
    status: 'ACTIVE',
    syncStatus: 'SYNCED',
    lastSyncedAt: null,
    createdAt: '2026-10-11T03:00:00',
    bankName: null,
    tokenId: null,
    isPrimary: false,
    isActive: true,
    label: null,
  });

  const inexact = normalizeAccount(accountModel({ balance: null, balanceExact: false }));
  assert.equal(inexact.balance, null);
  assert.equal(inexact.balanceExact, false);

  // exact가 아니면 balance 값이 와도 화면에 전달하지 않는다
  const forged = normalizeAccount(accountModel({ balance: 123, balanceExact: false }));
  assert.equal(forged.balance, null);
});

test('normalizeAccountList: 1개면 "내 계좌", 여러 개면 서버 순서대로 "내 계좌 N", 0개면 빈 배열', () => {
  assert.deepEqual(normalizeAccountList([]), []);
  assert.deepEqual(
    normalizeAccountList([accountModel()]).map(a => a.label),
    ['내 계좌']
  );
  assert.deepEqual(
    normalizeAccountList([
      accountModel({ accountId: '1' }),
      accountModel({ accountId: '2', status: 'CLOSED' }),
      accountModel({ accountId: '3', status: 'SUSPENDED' }),
    ]).map(a => [a.id, a.label, a.status]),
    [
      ['1', '내 계좌 1', 'ACTIVE'],
      ['2', '내 계좌 2', 'CLOSED'],
      ['3', '내 계좌 3', 'SUSPENDED'],
    ]
  );
});

test('큰 accountId·transactionId를 문자열로 보존', () => {
  assert.equal(normalizeAccount(accountModel({ accountId: BIG_ACCOUNT_ID })).id, BIG_ACCOUNT_ID);
  assert.equal(normalizeTransaction(txModel({ transactionId: BIG_TX_ID })).id, BIG_TX_ID);
  assert.equal(
    normalizeAccountDetail({ accountId: BIG_ACCOUNT_ID, nextCursor: BIG_TX_ID }).accountId,
    BIG_ACCOUNT_ID
  );
});

// ── 거래 매퍼 ────────────────────────────────────────────────

test('normalizeTransaction: 방향은 DEPOSIT/WITHDRAW만 정하고 TRANSFER/REVERSAL은 중립', () => {
  const direction = type => normalizeTransaction(txModel({ type })).direction;
  assert.equal(direction('DEPOSIT'), 'in');
  assert.equal(direction('WITHDRAW'), 'out');
  assert.equal(direction('TRANSFER'), 'neutral');
  assert.equal(direction('REVERSAL'), 'neutral');
});

test('normalizeTransaction: 서버에 없는 메모·수수료·완료 시간·상대방 이름을 만들지 않는다', () => {
  const tx = normalizeTransaction(txModel({ type: 'WITHDRAW', merchantName: '카페' }));
  assert.equal(tx.counterparty, '카페');
  assert.equal(tx.merchantName, '카페');
  assert.equal('memo' in tx, false);
  assert.equal('fee' in tx, false);
  assert.equal('completedAt' in tx, false);

  const noMerchant = normalizeTransaction(txModel());
  assert.equal(noMerchant.counterparty, null);
  assert.equal(noMerchant.merchantName, null);
});

test('normalizeTransaction: createdAt은 시간대 변환 없이 그대로, 정확하지 않은 amount는 null', () => {
  const tx = normalizeTransaction(txModel({ createdAt: '2026-10-11T23:59:59' }));
  assert.equal(tx.createdAt, '2026-10-11T23:59:59');
  assert.equal(tx.requestedAt, '2026-10-11T23:59:59');

  const inexact = normalizeTransaction(txModel({ amount: null, amountExact: false }));
  assert.equal(inexact.amount, null);
  assert.equal(inexact.amountExact, false);
  assert.equal(normalizeTransaction(txModel({ amount: 5, amountExact: false })).amount, null);
});

test('normalizeAccountDetail: 서버 값을 그대로 전달하고 거래는 normalizeTransaction으로 변환', () => {
  const detail = normalizeAccountDetail({
    accountId: '1',
    bankCode: null,
    bankName: null,
    displayAccountNumber: 'ACCOUNT-1',
    maskedAccountNumber: 'ACCOUNT-1',
    balance: null,
    balanceExact: false,
    syncStatus: 'RECONCILING',
    refreshing: true,
    refreshFailed: false,
    message: null,
    lastSyncedAt: null,
    transactionHistory: [txModel({ type: 'TRANSFER' })],
    nextCursor: '55',
    hasNext: true,
  });
  assert.equal(detail.balance, null);
  assert.equal(detail.balanceExact, false);
  assert.equal(detail.refreshing, true);
  assert.equal(detail.transactionHistory[0].direction, 'neutral');
  assert.equal(detail.nextCursor, '55');
  assert.equal(detail.hasNext, true);
});

test('기존 normalizeSummary·normalizeDailyLimit은 그대로 동작', () => {
  assert.equal(normalizeSummary({ balance: 10 }).currentBalance, 10);
  assert.equal(normalizeDailyLimit({ dailyLimit: 5 }).amount, 5);
});

// ── 상태 매핑 ────────────────────────────────────────────────

test('mapTransactionStatus: FAILED/CANCELED/UNKNOWN/PENDING/SUCCESS가 서로 구별된다', () => {
  assert.equal(mapTransactionStatus('FAILED'), 'failed');
  assert.equal(mapTransactionStatus('CANCELED'), 'canceled');
  assert.equal(mapTransactionStatus('UNKNOWN'), 'checking');
  assert.equal(mapTransactionStatus('PENDING'), 'pending');
  assert.equal(mapTransactionStatus('SUCCESS'), 'completed');

  const values = ['FAILED', 'CANCELED', 'UNKNOWN', 'PENDING', 'SUCCESS'].map(s =>
    mapTransactionStatus(s)
  );
  assert.equal(new Set(values).size, values.length);
  assert.notEqual(mapTransactionStatus('FAILED'), 'checking');
  assert.notEqual(mapTransactionStatus('CANCELED'), 'completed');
});

test('mapTransactionStatus: SUCCESS는 type으로 입금/출금 완료를 구분하고 방향 모를 때는 중립 completed', () => {
  assert.equal(mapTransactionStatus('SUCCESS', 'DEPOSIT'), 'depositCompleted');
  assert.equal(mapTransactionStatus('SUCCESS', 'WITHDRAW'), 'expenseCompleted');
  assert.equal(mapTransactionStatus('SUCCESS', 'TRANSFER'), 'completed');
  assert.equal(mapTransactionStatus('SUCCESS', 'REVERSAL'), 'completed');
  assert.equal(mapTransactionStatus('SUCCESS'), 'completed');
});

test('mapTransactionStatus: 기존 매핑 유지, 알 수 없는 값은 checking', () => {
  assert.equal(mapTransactionStatus('REQUESTED'), 'pending');
  assert.equal(mapTransactionStatus('COMPLETED'), 'completed');
  assert.equal(mapTransactionStatus('DEPOSIT_COMPLETED'), 'depositCompleted');
  assert.equal(mapTransactionStatus('EXPENSE_COMPLETED'), 'expenseCompleted');
  assert.equal(mapTransactionStatus('SOMETHING_NEW'), 'checking');
  assert.equal(mapTransactionStatus(undefined), 'checking');
});

// ── 계좌 선택 ────────────────────────────────────────────────

const acct = (id, status) => ({ id, status });

test('selectDefaultAccount: 첫 ACTIVE 계좌만, ACTIVE가 없으면 null (SUSPENDED/CLOSED/목록 첫 계좌로 대체하지 않음)', () => {
  assert.equal(selectDefaultAccount(null), null);
  assert.equal(selectDefaultAccount([]), null);
  assert.equal(selectDefaultAccount([acct('1', 'SUSPENDED'), acct('2', 'CLOSED')]), null);
  assert.equal(
    selectDefaultAccount([acct('1', 'CLOSED'), acct('2', 'ACTIVE'), acct('3', 'ACTIVE')]).id,
    '2'
  );
  // 기존 isPrimary 개념은 서버에 없다
  assert.equal(
    selectDefaultAccount([
      { id: '1', status: 'ACTIVE' },
      { id: '2', status: 'ACTIVE', isPrimary: true },
    ]).id,
    '1'
  );
});

test('resolveSelectedAccountId: 존재하면 상태와 무관하게 유지, 사라졌으면 기본 ACTIVE, 없으면 null, 없는 ID 생성 안 함', () => {
  const list = [acct('1', 'ACTIVE'), acct('2', 'SUSPENDED'), acct('3', 'CLOSED')];
  assert.equal(resolveSelectedAccountId(list, '2'), '2');
  assert.equal(resolveSelectedAccountId(list, '3'), '3');
  assert.equal(resolveSelectedAccountId(list, '99'), '1');
  assert.equal(resolveSelectedAccountId(list, null), '1');
  assert.equal(resolveSelectedAccountId([acct('2', 'SUSPENDED')], '99'), null);
  assert.equal(resolveSelectedAccountId([acct('2', 'SUSPENDED')], null), null);
  assert.equal(resolveSelectedAccountId([], '1'), null);
  assert.equal(resolveSelectedAccountId(undefined, '1'), null);
});

test('resolveActiveAccount: 출금 후보는 ACTIVE만, 선택 계좌가 비ACTIVE면 기본 ACTIVE, 없으면 null', () => {
  const list = [acct('1', 'ACTIVE'), acct('2', 'SUSPENDED'), acct('3', 'ACTIVE')];
  assert.equal(resolveActiveAccount(list, '3').id, '3');
  assert.equal(resolveActiveAccount(list, '2').id, '1');
  assert.equal(resolveActiveAccount(list, '99').id, '1');
  assert.equal(resolveActiveAccount(list, null).id, '1');
  assert.equal(resolveActiveAccount([acct('2', 'SUSPENDED'), acct('3', 'CLOSED')], '2'), null);
  assert.equal(resolveActiveAccount([], '1'), null);
});

// ── 거래 목록 어댑터 ─────────────────────────────────────────

test('buildTransactionsCursorQuery: 첫 페이지는 빈 쿼리, 다음 페이지는 lastTransactionId만 (기간·page·size 없음)', () => {
  assert.deepEqual(buildTransactionsCursorQuery(), {});
  assert.deepEqual(buildTransactionsCursorQuery({ cursor: null }), {});
  assert.deepEqual(buildTransactionsCursorQuery({ cursor: BIG_TX_ID }), {
    lastTransactionId: BIG_TX_ID,
  });
  assert.throws(() => buildTransactionsCursorQuery({ cursor: 12 }));
  assert.throws(() => buildTransactionsCursorQuery({ cursor: '1.5' }));
});

test('extractTransactionListResult: hasNext/nextCursor는 서버 값 그대로 (꽉 찬 페이지로 추정하지 않음)', () => {
  const full = Array.from({ length: 50 }, (_, i) => txModel({ transactionId: String(i + 1) }));
  assert.deepEqual(
    extractTransactionListResult({ transactions: full, nextCursor: null, hasNext: false }),
    { items: full, nextCursor: null, hasNext: false }
  );
  assert.equal(
    extractTransactionListResult({ transactions: [], nextCursor: '9', hasNext: true }).hasNext,
    true
  );
  assert.deepEqual(extractTransactionListResult(undefined), {
    items: [],
    nextCursor: null,
    hasNext: false,
  });
});

test('filterByPeriod: createdAt 날짜부를 문자열로만 비교(경계 포함, 시간대 변환 없음)', () => {
  const txs = [
    { id: 'a', createdAt: '2026-10-01T00:00:00' },
    { id: 'b', createdAt: '2026-10-11T23:59:59' },
    { id: 'c', createdAt: '2026-10-12T00:00:00' },
    { id: 'd', createdAt: '2026-09-30T23:59:59' },
    { id: 'e', createdAt: null },
  ];
  const ids = list => list.map(t => t.id);

  assert.deepEqual(ids(filterByPeriod(txs, { startKey: null, endKey: null })), [
    'a',
    'b',
    'c',
    'd',
    'e',
  ]);
  assert.deepEqual(ids(filterByPeriod(txs, { startKey: '2026-10-01', endKey: '2026-10-11' })), [
    'a',
    'b',
  ]);
  assert.deepEqual(ids(filterByPeriod(txs, { startKey: '2026-10-12', endKey: '2026-10-12' })), [
    'c',
  ]);
  assert.deepEqual(ids(filterByPeriod(txs, { startKey: '2026-10-11', endKey: null })), ['b', 'c']);
  // 형식이 아닌 경계는 무시
  assert.deepEqual(ids(filterByPeriod(txs, { startKey: 'bad', endKey: '2026-09-30' })), ['d']);
  assert.deepEqual(filterByPeriod(undefined, { startKey: '2026-10-01' }), []);
});

test('실제 서버 미호출', () => {
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
