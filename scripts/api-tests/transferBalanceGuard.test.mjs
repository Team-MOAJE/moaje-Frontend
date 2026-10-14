// 송금 잔액 초과 방지 테스트 — 모의 Gateway만 사용, 실제 서버·Android·실제 송금 없음.
// React 렌더러가 없어 화면 규칙은 순수 함수(assetScreenLogic) + Redux 스토어 + 소스 정적 분석으로 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/transferBalanceGuard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { BIG_ACCOUNT_ID, gateway, jsonRoute, rawJsonRoute } from './assetTestEnv.mjs';

const { default: assetReducer } = await import('../../src/features/asset/assetSlice.js');
const { fetchAccounts, transferFunds } = await import('../../src/features/asset/assetApi.js');
const { default: authReducer } = await import('../../src/features/auth/authSlice.js');
const {
  TRANSFER_AMOUNT_ISSUE,
  EXCEEDS_BALANCE_MESSAGE,
  getTransferAmountIssue,
  validateTransferAtConfirm,
} = await import('../../src/features/asset/assetScreenLogic.js');
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');

const LIST_PATH = '/api/v1/assets/accounts';
const TRANSFER_PATH = API_ENDPOINTS.BANKING.TRANSFERS;
const KAKAO = '101';
const WOORI = '202';
const USER = 'user-1';

const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const acctRaw = ({ id, bankName, status = 'ACTIVE', balance }) =>
  `{"accountId":"${id}","bankCode":"X","bankName":${JSON.stringify(bankName)},"balance":${balance},"status":"${status}"}`;
const loadAccounts = async (store, items) => {
  gateway.route('GET', LIST_PATH, rawJsonRoute(`[${items.join(',')}]`));
  await store.dispatch(fetchAccounts());
};
const twoBanks = () => [
  acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '500000.0000' }),
  acctRaw({ id: WOORI, bankName: '우리은행', balance: '100000.0000' }),
];
const accountOf = (store, id) => asset(store).accounts.find(account => account.id === id);

// 화면이 쓰는 최신 상태 형태: auth.user는 별도로 주입한다(스토어 reducer 상태 위에 덮어쓴다).
const stateOf = (store, user = { userId: USER }) => ({ ...store.getState(), auth: { user } });
const intent = (overrides = {}) => ({
  accountId: KAKAO,
  amount: 300000,
  depositBankCode: '001',
  depositAccountNumber: '110123456789',
  ...overrides,
});
const snapshotOf = (store, overrides = {}) => ({
  userId: USER,
  sessionGeneration: asset(store).sessionGeneration,
  ...intent(),
  ...overrides,
});

// 화면의 확인 흐름 모델: 재검증을 통과해야만 API-10을 호출한다.
const confirmAndSend = async (store, snapshot, current, key = 'key-1') => {
  const reason = validateTransferAtConfirm({ state: stateOf(store), snapshot, current });
  if (reason !== null) return { sent: false, reason };
  await store.dispatch(
    transferFunds({
      withdrawalAccountId: snapshot.accountId,
      depositBankCode: snapshot.depositBankCode,
      depositAccountNumber: snapshot.depositAccountNumber,
      amount: snapshot.amount,
      idempotencyKey: key,
    })
  );
  return { sent: true, reason: null };
};
const processingRoute = () =>
  jsonRoute({
    transferId: 456,
    publicTransferId: 'MOAJE-BNK-456',
    status: 'PROCESSING',
    message: 'm',
    externalTransactionId: null,
  });

// ── 순수 금액 판정 ───────────────────────────────────────────

test('금액 판정: 잔액 이하·잔액과 동일한 금액은 정상(null)이다', () => {
  const account = { balance: 2000000, balanceExact: true };
  assert.equal(getTransferAmountIssue({ account, amount: 1000000 }), null);
  assert.equal(getTransferAmountIssue({ account, amount: 2000000 }), null);
  assert.equal(getTransferAmountIssue({ account, amount: 1 }), null);
});

test('금액 판정: 잔액 초과(2,000,000 잔액에 2,020,000 입력)는 EXCEEDS_BALANCE다', () => {
  const account = { balance: 2000000, balanceExact: true };
  assert.equal(
    getTransferAmountIssue({ account, amount: 2020000 }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
  );
  assert.equal(
    getTransferAmountIssue({ account, amount: 2000001 }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
  );
});

test('금액 판정: 잔액 0원이면 어떤 양수 금액도 차단된다', () => {
  const account = { balance: 0, balanceExact: true };
  assert.equal(
    getTransferAmountIssue({ account, amount: 1 }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
  );
});

test('금액 판정: 잔액 정보가 없거나 부정확하면 차단된다(송금 가능 금액을 만들지 않는다)', () => {
  assert.equal(
    getTransferAmountIssue({ account: null, amount: 100 }),
    TRANSFER_AMOUNT_ISSUE.NO_BALANCE_INFO
  );
  assert.equal(
    getTransferAmountIssue({ account: undefined, amount: 100 }),
    TRANSFER_AMOUNT_ISSUE.NO_BALANCE_INFO
  );
  for (const account of [
    { balance: 2000000, balanceExact: false },
    { balance: 2000000 },
    { balance: null, balanceExact: true },
    { balance: undefined, balanceExact: true },
    { balance: 2000000.5, balanceExact: true },
    { balance: Number.MAX_SAFE_INTEGER + 2, balanceExact: true },
    { balance: '2000000', balanceExact: true },
  ]) {
    assert.equal(
      getTransferAmountIssue({ account, amount: 100 }),
      TRANSFER_AMOUNT_ISSUE.NO_BALANCE_INFO,
      JSON.stringify(account)
    );
  }
});

test('금액 판정: 0·음수·소수·NaN·Infinity·안전 정수 초과·문자열 금액은 INVALID_AMOUNT다', () => {
  const account = { balance: 2000000, balanceExact: true };
  for (const amount of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    1e21,
    '1000',
    null,
    undefined,
  ]) {
    assert.equal(
      getTransferAmountIssue({ account, amount }),
      TRANSFER_AMOUNT_ISSUE.INVALID_AMOUNT,
      String(amount)
    );
  }
});

test('금액 판정: 계좌 ID는 문자열 그대로 두고 Number로 바꾸지 않는다(19자리 ID 계좌도 판정 가능)', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: BIG_ACCOUNT_ID, bankName: '우리은행', balance: '100000.0000' }),
  ]);
  const account = accountOf(store, BIG_ACCOUNT_ID);
  assert.equal(account.id, BIG_ACCOUNT_ID);
  assert.equal(getTransferAmountIssue({ account, amount: 100000 }), null);
  assert.equal(
    getTransferAmountIssue({ account, amount: 100001 }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
  );
});

// ── 출금 계좌 변경 시 재검증 ──────────────────────────────────

test('출금 계좌 변경: 카카오(500,000)에서 300,000 정상 → 우리(100,000)로 바꾸면 초과 → 다시 카카오면 정상', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const amount = 300000;
  assert.equal(getTransferAmountIssue({ account: accountOf(store, KAKAO), amount }), null);
  assert.equal(
    getTransferAmountIssue({ account: accountOf(store, WOORI), amount }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE,
    '금액은 그대로 유지한 채 선택 계좌 기준으로 다시 판정된다'
  );
  assert.equal(getTransferAmountIssue({ account: accountOf(store, KAKAO), amount }), null);
});

// ── 전액 버튼 ────────────────────────────────────────────────

test('전액 버튼: 화면은 balanceExact인 안전한 양의 정수 잔액일 때만 maxAmount를 만들고, 그 금액은 항상 통과한다', async () => {
  const source = codeOf('src/screens/asset/TransferScreen.js');
  assert.match(source, /selectedAccount\.balanceExact === true/);
  assert.match(source, /Number\.isSafeInteger\(selectedAccount\.balance\)/);
  assert.match(source, /selectedAccount\.balance > 0/);
  assert.match(source, /if \(hasPending \|\| maxAmount == null\) return;/);

  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const account = accountOf(store, WOORI);
  assert.equal(getTransferAmountIssue({ account, amount: account.balance }), null);
  assert.equal(
    getTransferAmountIssue({ account, amount: account.balance + 1 }),
    TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
  );
});

test('전액 버튼: 잔액이 0원이거나 부정확하면 송금 가능한 금액이 없다', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '0.0000' }),
    acctRaw({ id: WOORI, bankName: '우리은행', balance: '9007199254740993.0000' }),
  ]);
  const zero = accountOf(store, KAKAO);
  assert.equal(zero.balance, 0);
  assert.equal(getTransferAmountIssue({ account: zero, amount: 1 }), 'EXCEEDS_BALANCE');
  const huge = accountOf(store, WOORI);
  assert.notEqual(huge.balanceExact, true, '안전 범위를 넘는 잔액은 정확한 값이 아니다');
  assert.equal(getTransferAmountIssue({ account: huge, amount: 1 }), 'NO_BALANCE_INFO');
});

// ── 송금 직전 재검증 + API-10 미호출 ──────────────────────────

test('직전 재검증 통과: 같은 계좌·금액·잔액 이하면 API-10을 호출한다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route('POST', TRANSFER_PATH, processingRoute());
  const result = await confirmAndSend(store, snapshotOf(store), intent());
  assert.equal(result.sent, true);
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 1);
  assert.equal(gateway.requestsTo(TRANSFER_PATH)[0].headers['idempotency-key'], 'key-1');
});

test('직전 재검증: 확인창을 연 뒤 서버 잔액이 줄어 초과가 되면 API-10을 호출하지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const snapshot = snapshotOf(store); // 확인창을 연 시점 (잔액 500,000, 금액 300,000)
  await loadAccounts(store, [
    acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '200000.0000' }),
    acctRaw({ id: WOORI, bankName: '우리은행', balance: '100000.0000' }),
  ]);
  const result = await confirmAndSend(store, snapshot, intent());
  assert.deepEqual(result, { sent: false, reason: TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE });
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 0);
  assert.equal(asset(store).pendingTransfer, null, '미호출이므로 미확정 송금도 생기지 않는다');
});

test('직전 재검증: 잔액 초과 금액은 처음부터 API-10을 호출하지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const bad = intent({ accountId: WOORI, amount: 300000 });
  const result = await confirmAndSend(store, snapshotOf(store, bad), bad);
  assert.equal(result.reason, TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE);
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 0);
});

test('직전 재검증: 잔액이 0원이거나 정확한 잔액을 알 수 없으면 호출하지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '0.0000' }),
    acctRaw({ id: WOORI, bankName: '우리은행', balance: '9007199254740993.0000' }),
  ]);
  for (const accountId of [KAKAO, WOORI]) {
    const current = intent({ accountId, amount: 1000 });
    const result = await confirmAndSend(store, snapshotOf(store, current), current);
    assert.equal(result.sent, false, accountId);
  }
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 0);
});

test('직전 재검증: 확인창을 연 뒤 출금 계좌·금액·받는 계좌가 바뀌면 중단한다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const snapshot = snapshotOf(store);
  for (const changed of [
    intent({ accountId: WOORI }),
    intent({ amount: 301000 }),
    intent({ depositBankCode: '004' }),
    intent({ depositAccountNumber: '110123456780' }),
  ]) {
    const result = await confirmAndSend(store, snapshot, changed);
    assert.deepEqual(result, { sent: false, reason: 'CHANGED' }, JSON.stringify(changed));
  }
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 0);
});

test('직전 재검증: 사용자·세션이 바뀌었거나 선택 계좌가 목록에서 사라지거나 ACTIVE가 아니면 중단한다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const snapshot = snapshotOf(store);
  const check = state => validateTransferAtConfirm({ state, snapshot, current: intent() });

  assert.equal(check(stateOf(store, { userId: 'user-2' })), 'CHANGED', '다른 사용자');
  assert.equal(check(stateOf(store, null)), 'CHANGED', '로그아웃');
  assert.equal(
    check({ ...stateOf(store), asset: { ...asset(store), sessionGeneration: 99 } }),
    'CHANGED',
    '세션 전환'
  );
  assert.equal(
    check({ ...stateOf(store), asset: { ...asset(store), accounts: [accountOf(store, WOORI)] } }),
    'CHANGED',
    '계좌 삭제'
  );
  assert.equal(
    check({
      ...stateOf(store),
      asset: {
        ...asset(store),
        accounts: asset(store).accounts.map(a =>
          a.id === KAKAO ? { ...a, status: 'SUSPENDED' } : a
        ),
      },
    }),
    'CHANGED',
    'ACTIVE 아님'
  );
  assert.equal(check(stateOf(store)), null, '변화 없으면 통과');
});

test('직전 재검증: 송금 진행 중(transferLoading)이거나 미확정 송금이 있으면 새 송금을 막는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const snapshot = snapshotOf(store);
  const base = stateOf(store);
  assert.equal(
    validateTransferAtConfirm({
      state: { ...base, asset: { ...base.asset, transferLoading: true } },
      snapshot,
      current: intent(),
    }),
    'BLOCKED'
  );
  assert.equal(
    validateTransferAtConfirm({
      state: {
        ...base,
        asset: { ...base.asset, pendingTransfer: { request: {}, idempotencyKey: 'k' } },
      },
      snapshot,
      current: intent(),
    }),
    'BLOCKED'
  );
});

// ── 멱등성·미확정 송금 보호 ────────────────────────────────────

test('미확정 송금 재확인은 잔액이 부족해져도 막히지 않고 같은 요청·같은 키로 전송된다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route('POST', TRANSFER_PATH, processingRoute());
  await confirmAndSend(store, snapshotOf(store), intent(), 'key-pending');
  const pendingBefore = JSON.stringify(asset(store).pendingTransfer);
  assert.ok(asset(store).pendingTransfer);

  // 이후 잔액이 0원이 됐다.
  await loadAccounts(store, [
    acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '0.0000' }),
    acctRaw({ id: WOORI, bankName: '우리은행', balance: '100000.0000' }),
  ]);
  assert.equal(JSON.stringify(asset(store).pendingTransfer), pendingBefore, '미확정은 그대로');

  await store.dispatch(transferFunds({ recheckPending: true }));
  const requests = gateway.requestsTo(TRANSFER_PATH);
  assert.equal(requests.length, 2, '재확인 요청이 전송된다(잔액 검증 없음)');
  assert.equal(requests[1].headers['idempotency-key'], 'key-pending');
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(requests[1].body.amount, 300000);
});

test('미확정 송금이 있으면 잔액이 충분해도 새 송금은 보내지 않는다(기존 보호 유지)', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route('POST', TRANSFER_PATH, processingRoute());
  await confirmAndSend(store, snapshotOf(store), intent(), 'key-pending');
  await store.dispatch(
    transferFunds({
      withdrawalAccountId: KAKAO,
      depositBankCode: '001',
      depositAccountNumber: '110123456789',
      amount: 1000,
      idempotencyKey: 'key-new',
    })
  );
  assert.equal(gateway.requestsTo(TRANSFER_PATH).length, 1);
  assert.equal(asset(store).pendingTransfer.idempotencyKey, 'key-pending');
});

// ── 화면 배선(정적) ───────────────────────────────────────────

function codeOf(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
const between = (text, start, end) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} ~ ${end}`);
  return text.slice(from, to);
};

test('화면 배선: 보내기 활성 조건에 잔액 판정이 들어가고, 경고 문구는 인라인(빨간색)이며 입력값을 바꾸지 않는다', () => {
  const screen = codeOf('src/screens/asset/TransferScreen.js');
  const logic = codeOf('src/features/asset/assetScreenLogic.js');
  assert.match(logic, /계좌 잔액을 초과하는 금액은 송금할 수 없어요\./);
  assert.equal(EXCEEDS_BALANCE_MESSAGE, '계좌 잔액을 초과하는 금액은 송금할 수 없어요.');
  assert.match(screen, /getTransferAmountIssue\(\{ account: selectedAccount, amount \}\)/);
  const active = between(screen, 'const isNewTransferActive =', 'const isActive');
  assert.match(active, /amountOverflow === null/);
  assert.match(active, /amountIssue === null/);
  assert.match(screen, /styles\.amountError/);
  assert.match(screen, /color: colors\.red/);
  // 잔액에 맞춰 입력을 자동 변경하지 않는다: setAmount는 입력·빠른 금액·전액·초과 상태 초기화에서만 호출된다.
  assert.doesNotMatch(screen, /setAmount\(Math\.min|setAmount\(.*balance/);
  // 경고는 Alert이 아니라 화면에 표시한다(입력 중 Alert 없음).
  const changeHandler = between(screen, 'const handleAmountChange', 'const handleQuickAmount');
  assert.doesNotMatch(changeHandler, /Alert\./);
});

test('화면 배선: 안전 정수 초과 입력은 이전 값 유지가 아니라 오류 상태(0원 + 오류 문구)가 되어 송금이 차단된다', () => {
  const screen = codeOf('src/screens/asset/TransferScreen.js');
  const handler = between(screen, 'const handleAmountChange', 'const handleQuickAmount');
  assert.match(handler, /Number\.isSafeInteger\(n\)/);
  assert.match(handler, /setAmountOverflow\(digits\);\s*setAmount\(0\);/);
  assert.match(screen, /AMOUNT_TOO_LARGE_MESSAGE/);
  // 오류 상태에서는 입력한 숫자를 그대로 보여준다.
  assert.match(screen, /!hasPending && amountOverflow !== null\s*\? amountOverflow/);
  // 정상 금액으로 고치면 오류 상태가 풀린다.
  assert.match(handler, /setAmountOverflow\(null\);\s*setAmount\(n\);/);
});

test('화면 배선: 확인 시점 재검증은 최신 store 상태를 쓰고, 통과해야만 submitTransfer를 호출하며, 재확인 경로에는 적용하지 않는다', () => {
  const screen = codeOf('src/screens/asset/TransferScreen.js');
  assert.match(screen, /useStore\(\)/);
  const press = between(screen, 'const handleTransferPress', 'const handleBottomHomePress');
  // 재확인 분기는 검증 호출보다 먼저 return한다.
  assert.ok(
    press.indexOf('recheckPending: true') < press.indexOf('validateTransferAtConfirm'),
    '재확인 분기가 먼저'
  );
  assert.match(press, /store\.getState\(\)/);
  assert.match(press, /currentIntentRef\.current/);
  // 확인창을 열기 전과 확인 버튼 시점, 두 번 검증한다.
  assert.equal((press.match(/blockIfInvalid\(\)/g) ?? []).length, 2); // 호출 2회(정의 제외)
  const onPress = between(press, 'onPress: () => {', '},\n        },');
  assert.ok(onPress.indexOf('blockIfInvalid()') < onPress.indexOf('submitTransfer({'));
  // API-10 요청 본문 계약과 멱등성 키 흐름은 그대로다.
  assert.match(
    press,
    /submitTransfer\(\{\s*withdrawalAccountId: selectedAccount\.id,\s*depositBankCode,\s*depositAccountNumber,\s*amount,\s*idempotencyKey: getCurrentTransferKey\(\),\s*\}\)/
  );
  assert.equal((screen.match(/recheckPending/g) ?? []).length, 1);
  assert.doesNotMatch(screen, /(?<![A-Za-z])Number\(/);
});

test('실서버 미호출: 이 테스트의 요청은 모의 Gateway(127.0.0.1)뿐이다', async () => {
  const { everRequested } = await import('./assetTestEnv.mjs');
  for (const request of everRequested) {
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(request.host), String(request.host));
  }
});
