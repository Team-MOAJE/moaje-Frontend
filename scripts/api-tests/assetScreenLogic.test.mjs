// Asset 화면 표시 로직(assetScreenLogic) 단위 테스트. 순수 함수, 서버 호출·렌더링 없음.
// 화면 렌더링/Android 동작은 이 테스트로 검증되지 않는다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/assetScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BIG_ACCOUNT_ID, BIG_TX_ID } from './assetTestEnv.mjs';

const logic = await import('../../src/features/asset/assetScreenLogic.js');
const {
  formatExactMoney,
  getAccountStatusLabel,
  getAccountStatusNotice,
  canTransferFrom,
  describeSyncStatus,
  resolveHomeAccountsState,
  buildHomeAccountItems,
  getTxTypeLabel,
  resolveTxTitle,
  formatTxAmount,
  txAmountTone,
  matchesTxFilter,
  formatServerDate,
  formatServerDateTime,
  groupKeyOf,
  buildHistoryViewModel,
  resolveHistoryTarget,
  UNKNOWN_DATE_GROUP,
} = logic;
const { normalizeAccountList, normalizeTransaction } =
  await import('../../src/utils/apiMappers.js');

const account = (id, status = 'ACTIVE', balance = 10000, exact = true) => ({
  accountId: id,
  balance,
  balanceExact: exact,
  status,
  syncStatus: 'SYNCED',
  lastSyncedAt: null,
  createdAt: '2026-10-01T09:00:00',
});
const tx = (overrides = {}) =>
  normalizeTransaction({
    transactionId: '1',
    publicTransactionId: 'p1',
    type: 'DEPOSIT',
    amount: 5000,
    amountExact: true,
    status: 'SUCCESS',
    merchantName: null,
    categoryCode: null,
    createdAt: '2026-10-10T09:30:00',
    ...overrides,
  });

// ── 금액 ─────────────────────────────────────────────────────

test('formatExactMoney: exact 정수만 표시, null·부정확·비정수는 "-" (0원 아님)', () => {
  assert.equal(formatExactMoney(10000, true), '10,000원');
  assert.equal(formatExactMoney(0, true), '0원');
  assert.equal(formatExactMoney(null, true), '-');
  assert.equal(formatExactMoney(null, false), '-');
  assert.equal(formatExactMoney(10000, false), '-');
  assert.equal(formatExactMoney(10000, undefined), '-');
  assert.equal(formatExactMoney(12.5, true), '-');
  assert.equal(formatExactMoney(9007199254740993, true), '-');
  assert.equal(formatExactMoney('10000', true), '-');
});

// ── 계좌 상태 ────────────────────────────────────────────────

test('계좌 상태: ACTIVE는 배지·안내 없음, SUSPENDED/CLOSED는 조회 전용 안내, 송금 가능은 ACTIVE만', () => {
  assert.equal(getAccountStatusLabel({ status: 'ACTIVE' }), null);
  assert.equal(getAccountStatusLabel({ status: 'SUSPENDED' }), '일시 중지');
  assert.equal(getAccountStatusLabel({ status: 'CLOSED' }), '해지');
  assert.equal(getAccountStatusLabel({ status: 'WHATEVER' }), null);
  assert.equal(getAccountStatusNotice({ status: 'ACTIVE' }), null);
  assert.match(getAccountStatusNotice({ status: 'SUSPENDED' }), /조회만 가능/);
  assert.match(getAccountStatusNotice({ status: 'CLOSED' }), /조회만 가능/);
  assert.equal(canTransferFrom({ status: 'ACTIVE' }), true);
  assert.equal(canTransferFrom({ status: 'SUSPENDED' }), false);
  assert.equal(canTransferFrom({ status: 'CLOSED' }), false);
  assert.equal(canTransferFrom(null), false);
});

test('동기화 상태: 서버 message를 그대로 쓰고, 정상(SYNCED)이면 표시 없음', () => {
  assert.equal(describeSyncStatus(null), null);
  assert.equal(
    describeSyncStatus({ syncStatus: 'SYNCED', refreshing: false, refreshFailed: false }),
    null
  );
  assert.deepEqual(
    describeSyncStatus({
      syncStatus: 'RECONCILING',
      refreshing: true,
      refreshFailed: false,
      message: '갱신 중입니다',
    }),
    { label: '갱신 중', message: '갱신 중입니다', tone: 'progress' }
  );
  assert.deepEqual(
    describeSyncStatus({
      syncStatus: 'STALE',
      refreshing: false,
      refreshFailed: true,
      message: '실패',
    }),
    { label: '새로고침 실패', message: '실패', tone: 'error' }
  );
  assert.equal(
    describeSyncStatus({ syncStatus: 'STALE', refreshFailed: true }).message,
    null,
    'message 없으면 만들지 않음'
  );
  assert.equal(describeSyncStatus({ syncStatus: 'SYNC_REQUIRED' }).tone, 'notice');
});

// ── 홈 ───────────────────────────────────────────────────────

test('홈 상태: 오류와 0개를 구분, 요청 전은 loading, 데이터가 있으면 로딩/오류 중에도 list', () => {
  assert.equal(resolveHomeAccountsState({ accounts: [], loading: true, error: null }), 'loading');
  assert.equal(resolveHomeAccountsState({ accounts: [], loading: false, error: '실패' }), 'error');
  assert.equal(resolveHomeAccountsState({ accounts: [], loading: false, error: null }), 'empty');
  assert.equal(
    resolveHomeAccountsState({ accounts: [], loading: false, error: null, fetched: false }),
    'loading'
  );
  assert.equal(
    resolveHomeAccountsState({ accounts: [{ id: '1' }], loading: true, error: null }),
    'list'
  );
  assert.equal(
    resolveHomeAccountsState({ accounts: [{ id: '1' }], loading: false, error: '실패' }),
    'list'
  );
  assert.equal(resolveHomeAccountsState(), 'empty');
});

test('홈 행 모델: 0개/1개/여러 개 라벨, 상태 배지, 잔액 "-", 은행명·토큰·총잔액 필드 없음', () => {
  assert.deepEqual(buildHomeAccountItems([]), []);
  assert.deepEqual(buildHomeAccountItems(undefined), []);

  const one = buildHomeAccountItems(normalizeAccountList([account('1')]));
  assert.equal(one.length, 1);
  assert.deepEqual(one[0], {
    id: '1',
    label: '내 계좌',
    status: 'ACTIVE',
    statusLabel: null,
    balanceText: '10,000원',
  });

  const many = buildHomeAccountItems(
    normalizeAccountList([
      account(BIG_ACCOUNT_ID, 'ACTIVE', 1234567),
      account('2', 'SUSPENDED', 0),
      account('3', 'CLOSED', 12345.6789, false),
    ])
  );
  assert.deepEqual(
    many.map(i => i.label),
    ['내 계좌 1', '내 계좌 2', '내 계좌 3']
  );
  assert.equal(many[0].id, BIG_ACCOUNT_ID, '큰 accountId 문자열 보존');
  assert.equal(typeof many[0].id, 'string');
  assert.deepEqual(
    many.map(i => i.statusLabel),
    [null, '일시 중지', '해지']
  );
  assert.deepEqual(
    many.map(i => i.balanceText),
    ['1,234,567원', '0원', '-']
  );
  for (const item of many) {
    assert.equal('bankName' in item, false);
    assert.equal('tokenId' in item, false);
    assert.equal('accountNumber' in item, false);
  }
});

test('홈: 로그아웃 초기화 후(빈 계좌) 이전 계좌 항목이 만들어지지 않음, 총잔액 계산 함수는 없음', () => {
  assert.deepEqual(buildHomeAccountItems([]), []);
  for (const name of Object.keys(logic)) {
    assert.equal(/total|sum/i.test(name), false, `총잔액/합산 함수가 없어야 함: ${name}`);
  }
});

// ── 거래 표시 ────────────────────────────────────────────────

test('거래 방향·부호: DEPOSIT +, WITHDRAW -, TRANSFER/REVERSAL 부호 없음 + 중립색', () => {
  const deposit = tx({ type: 'DEPOSIT' });
  const withdraw = tx({ type: 'WITHDRAW' });
  const transfer = tx({ type: 'TRANSFER' });
  const reversal = tx({ type: 'REVERSAL' });
  assert.equal(formatTxAmount(deposit), '+5,000원');
  assert.equal(formatTxAmount(withdraw), '-5,000원');
  assert.equal(formatTxAmount(transfer), '5,000원');
  assert.equal(formatTxAmount(reversal), '5,000원');
  assert.equal(txAmountTone(deposit), 'positive');
  for (const item of [withdraw, transfer, reversal]) assert.equal(txAmountTone(item), 'default');
});

test('거래 금액: amountExact false·null은 "-" (0원·반올림 없음), 서버 값이 없으면 만들지 않음', () => {
  assert.equal(formatTxAmount(tx({ amount: 12345.6789, amountExact: false })), '-');
  assert.equal(formatTxAmount(tx({ amount: null, amountExact: false })), '-');
  assert.equal(formatTxAmount(tx({ amount: 0, amountExact: true })), '+0원');
  assert.equal(formatTxAmount(null), '-');
  assert.equal(txAmountTone(tx({ amount: null, amountExact: false })), 'default');
});

test('거래 제목: 서버 이름이 있으면 그것, 없으면 유형 라벨(가짜 상대방·메모 생성 안 함)', () => {
  assert.equal(resolveTxTitle(tx({ merchantName: '스타벅스' })), '스타벅스');
  assert.equal(resolveTxTitle(tx({ merchantName: '   ' })), '입금');
  assert.equal(resolveTxTitle(tx({ type: 'WITHDRAW' })), '출금');
  assert.equal(resolveTxTitle(tx({ type: 'TRANSFER' })), '이체');
  assert.equal(resolveTxTitle(tx({ type: 'REVERSAL' })), '정정');
  assert.equal(getTxTypeLabel({ type: 'UNKNOWN_TYPE' }), '거래');
  const normalized = tx();
  for (const key of ['memo', 'fee', 'completedAt']) {
    assert.equal(key in normalized, false, `${key} 필드를 만들지 않음`);
  }
});

test('유형 필터: type 기준(status 아님), REVERSAL은 전체에서만', () => {
  const list = [
    tx({ transactionId: '1', type: 'DEPOSIT', status: 'PENDING' }),
    tx({ transactionId: '2', type: 'WITHDRAW', status: 'FAILED' }),
    tx({ transactionId: '3', type: 'TRANSFER', status: 'CANCELED' }),
    tx({ transactionId: '4', type: 'REVERSAL', status: 'SUCCESS' }),
  ];
  const ids = f => list.filter(t => matchesTxFilter(t, f)).map(t => t.id);
  assert.deepEqual(ids('전체'), ['1', '2', '3', '4']);
  assert.deepEqual(ids('입금'), ['1']);
  assert.deepEqual(ids('출금'), ['2']);
  assert.deepEqual(ids('송금'), ['3']);
});

// ── 날짜 ─────────────────────────────────────────────────────

test('날짜 포매터: 서버 문자열을 변환 없이 표시 (Z/오프셋도 그대로 읽음), 읽을 수 없으면 "-"', () => {
  assert.equal(formatServerDate('2026-10-10T09:30:00'), '2026.10.10');
  assert.equal(formatServerDateTime('2026-10-10T09:30:00'), '2026.10.10 09:30');
  assert.equal(formatServerDateTime('2026-10-10 09:30:00'), '2026.10.10 09:30');
  assert.equal(formatServerDateTime('2026-10-10T23:59:59Z'), '2026.10.10 23:59');
  assert.equal(formatServerDateTime('2026-10-10T23:59:59+09:00'), '2026.10.10 23:59');
  assert.equal(formatServerDateTime('2026-10-10'), '2026.10.10');
  for (const bad of [null, undefined, '', 'abc', 1760000000000]) {
    assert.equal(formatServerDateTime(bad), '-');
    assert.equal(groupKeyOf(bad), UNKNOWN_DATE_GROUP);
  }
  assert.equal(groupKeyOf('2026-10-10T00:00:00'), '2026.10.10');
  assert.equal(groupKeyOf('2026-10-10T23:59:59'), '2026.10.10', '날짜 경계: 같은 날짜 그룹');
  assert.equal(groupKeyOf('2026-10-11T00:00:00'), '2026.10.11');
});

test('날짜 포매터는 기기 시간대(TZ)에 따라 결과가 바뀌지 않고, 소스에 Date 사용이 없음', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../src/features/asset/assetScreenLogic.js', import.meta.url)),
    'utf8'
  );
  const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, ''); // 주석 제외
  assert.equal(/\bnew Date\b|\bDate\.|Intl\./.test(code), false);

  const moduleUrl = pathToFileURL(
    fileURLToPath(new URL('../../src/features/asset/assetScreenLogic.js', import.meta.url))
  ).href;
  const loaderPath = fileURLToPath(new URL('./loader.mjs', import.meta.url));
  const script = `
    const m = await import(${JSON.stringify(moduleUrl)});
    const inputs = ['2026-10-10T23:59:59Z', '2026-10-10T00:00:00', '2026-12-31T23:30:00+09:00'];
    console.log(JSON.stringify(inputs.map(v => [m.formatServerDateTime(v), m.groupKeyOf(v)])));
  `;
  const outputs = ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati'].map(tz =>
    execFileSync(
      process.execPath,
      ['--import', pathToFileURL(loaderPath).href, '--input-type=module', '-e', script],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' }
    ).trim()
  );
  assert.equal(new Set(outputs).size, 1, `TZ별 결과 동일: ${outputs.join(' | ')}`);
  assert.equal(
    outputs[0],
    JSON.stringify([
      ['2026.10.10 23:59', '2026.10.10'],
      ['2026.10.10 00:00', '2026.10.10'],
      ['2026.12.31 23:30', '2026.12.31'],
    ])
  );
});

// ── 거래내역 뷰모델 ──────────────────────────────────────────

test('거래내역 뷰모델: 기간은 불러온 거래에만 클라이언트 적용, 그룹은 서버 날짜, 최신순 유지', () => {
  const list = [
    tx({ transactionId: '5', createdAt: '2026-10-11T00:00:00' }),
    tx({ transactionId: '4', createdAt: '2026-10-10T23:59:59' }),
    tx({ transactionId: '3', createdAt: '2026-10-10T08:00:00', type: 'WITHDRAW' }),
    tx({ transactionId: '2', createdAt: '2026-09-30T12:00:00' }),
    tx({ transactionId: '1', createdAt: null }),
  ];
  const all = buildHistoryViewModel({ transactions: list });
  assert.deepEqual(
    all.groups.map(g => g.group),
    ['2026.10.11', '2026.10.10', '2026.09.30', UNKNOWN_DATE_GROUP]
  );
  assert.deepEqual(
    all.groups[1].items.map(t => t.id),
    ['4', '3']
  );
  assert.equal(all.loadedCount, 5);

  const period = buildHistoryViewModel({
    transactions: list,
    period: { startKey: '2026-10-10', endKey: '2026-10-10' },
  });
  assert.deepEqual(
    period.groups.map(g => g.group),
    ['2026.10.10'],
    '경계(23:59:59 포함, 00:00:00 다음 날 제외)'
  );
  assert.equal(period.count, 2);
  assert.equal(period.loadedCount, 5, '불러온 거래 수는 필터와 무관');

  const typed = buildHistoryViewModel({ transactions: list, filter: '출금' });
  assert.deepEqual(
    typed.groups.flatMap(g => g.items.map(t => t.id)),
    ['3']
  );

  assert.deepEqual(buildHistoryViewModel({ transactions: [] }).groups, []);
  assert.deepEqual(buildHistoryViewModel().groups, []);
});

test('거래내역 조회 대상: 계좌 로드 전·오류·0개·미선택에서는 ready가 아니라 요청 금지', () => {
  const accounts = normalizeAccountList([account('1'), account(BIG_ACCOUNT_ID, 'SUSPENDED')]);
  assert.deepEqual(resolveHistoryTarget({ accounts: [], accountsLoading: true }), {
    kind: 'loading',
  });
  assert.deepEqual(resolveHistoryTarget({ accounts: [], fetched: false }), { kind: 'loading' });
  assert.deepEqual(resolveHistoryTarget({ accounts: [], accountsError: '실패' }), {
    kind: 'error',
    message: '실패',
  });
  assert.deepEqual(resolveHistoryTarget({ accounts: [] }), { kind: 'empty' });
  assert.deepEqual(resolveHistoryTarget({ accounts, selectedAccountId: null }), {
    kind: 'noSelection',
  });
  assert.deepEqual(resolveHistoryTarget({ accounts, selectedAccountId: '999' }), {
    kind: 'noSelection',
  });

  const ready = resolveHistoryTarget({ accounts, selectedAccountId: '1' });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.accountId, '1');

  // SUSPENDED/CLOSED는 조회용으로 ready가 될 수 있고, 큰 ID는 문자열 그대로
  const viewOnly = resolveHistoryTarget({ accounts, selectedAccountId: BIG_ACCOUNT_ID });
  assert.equal(viewOnly.kind, 'ready');
  assert.equal(viewOnly.accountId, BIG_ACCOUNT_ID);
  assert.equal(canTransferFrom(viewOnly.account), false);

  // 계좌 목록 갱신 오류가 나도 이미 있는 계좌로는 계속 조회
  assert.equal(
    resolveHistoryTarget({ accounts, selectedAccountId: '1', accountsError: '갱신 실패' }).kind,
    'ready'
  );
});

test('route params로 넘길 ID는 문자열 그대로 유지 (Number 변환 없음)', () => {
  const t = normalizeTransaction({
    transactionId: BIG_TX_ID,
    publicTransactionId: 'p',
    type: 'DEPOSIT',
    amount: 1,
    amountExact: true,
    status: 'SUCCESS',
    merchantName: null,
    categoryCode: null,
    createdAt: '2026-10-10T09:30:00',
  });
  const params = { accountId: BIG_ACCOUNT_ID, transactionId: t.id };
  assert.equal(params.transactionId, BIG_TX_ID);
  assert.equal(typeof params.accountId, 'string');
  assert.equal(typeof params.transactionId, 'string');
});

test('C-2: 거래 아이템 상태 변환은 FAILED/CANCELED를 서로 다르게, 확인 중과도 다르게 유지한다', async () => {
  const { mapTransactionStatus } = await import('../../src/utils/mapTransactionStatus.js');
  assert.equal(mapTransactionStatus('FAILED', 'WITHDRAW'), 'failed');
  assert.equal(mapTransactionStatus('CANCELED', 'TRANSFER'), 'canceled');
  assert.equal(mapTransactionStatus('UNKNOWN', 'DEPOSIT'), 'checking');
  assert.equal(mapTransactionStatus('PENDING', 'DEPOSIT'), 'pending');
});

test('C-2: 로그아웃 후 빈 계좌 상태는 홈 행을 만들지 않는다', () => {
  assert.deepEqual(buildHomeAccountItems([]), []);
  assert.deepEqual(buildHomeAccountItems(undefined), []);
});
