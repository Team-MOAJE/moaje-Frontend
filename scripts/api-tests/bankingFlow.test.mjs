// Banking 흐름 테스트: API-09 계좌 개설 thunk + API-10 송금 thunk/슬라이스(미확정 송금 보호).
// 모의 Gateway만 사용한다(실제 서버·실제 송금 없음). Android·화면 렌더링은 미검증.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/bankingFlow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import {
  BIG_ACCOUNT_ID,
  everRequested,
  gateway,
  jsonRoute,
  rawJsonRoute,
} from './assetTestEnv.mjs';

const { default: assetReducer } = await import('../../src/features/asset/assetSlice.js');
const { fetchAccounts, openAccount, transferFunds } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const { loginUser, logoutUser } = await import('../../src/features/auth/authApi.js');
const { isValidIdempotencyKey } = await import('../../src/utils/idempotencyKey.js');
const { TRANSFER_ERROR_OUTCOME, TRANSFER_OUTCOME } =
  await import('../../src/features/asset/transferOutcome.js');

const ACCOUNTS_PATH = '/api/v1/banking/accounts';
const TRANSFERS_PATH = '/api/v1/banking/transfers';
const LIST_PATH = '/api/v1/assets/accounts';

const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const OPEN_INPUT = {
  ci: 'MOAJE-DEMO-101',
  userName: '테스트',
  phoneNumber: '+821000000000',
  bankCode: '001',
  productName: 'MOAJE 입출금',
  initialBalance: 500000,
};
const openResponse = (overrides = {}) => ({
  accountId: 777,
  userId: '101',
  bankCode: '001',
  productName: 'MOAJE 입출금',
  balance: 500000,
  status: 'ACTIVE',
  createdAt: '2026-10-13T03:00:00Z',
  canceledAt: null,
  ...overrides,
});

const TRANSFER_INPUT = {
  withdrawalAccountId: BIG_ACCOUNT_ID,
  depositBankCode: '001',
  depositAccountNumber: '00123456789012',
  amount: 10000,
};
const transferResponse = status => ({
  transferId: 456,
  publicTransferId: 'MOAJE-BNK-456',
  status,
  message: '서버 문구(상태 판단에 쓰지 않음)',
  externalTransactionId: null,
});
const transferRoute = (status, extra = {}) => jsonRoute(transferResponse(status), extra);
const bankingError = (status, code) => jsonRoute({ code, message: 'm' }, { status });

const keysSent = () => gateway.requestsTo(TRANSFERS_PATH).map(r => r.headers['idempotency-key']);

// ── API-09 계좌 개설 ──────────────────────────────────────────

test('API-09: 201 성공 → 상태는 완료되고 계좌 목록(accounts)에는 아무것도 추가되지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201 }));

  const result = await store.dispatch(openAccount(OPEN_INPUT));

  assert.equal(openAccount.fulfilled.match(result), true);
  assert.equal(result.payload.accountId, '777');
  assert.equal(asset(store).openAccountLoading, false);
  assert.equal(asset(store).openAccountError, null);
  assert.deepEqual(asset(store).accounts, [], '가짜 계좌를 목록에 넣지 않는다');
  const [request] = gateway.requestsTo(ACCOUNTS_PATH);
  assert.deepEqual(request.body, OPEN_INPUT);
  assert.equal(request.headers['idempotency-key'], undefined, '개설은 멱등 키를 쓰지 않는다');
});

test('API-09: 19자리 accountId를 문자열로 보존한다', async () => {
  const store = makeStore();
  gateway.route(
    'POST',
    ACCOUNTS_PATH,
    rawJsonRoute(
      `{"accountId":${BIG_ACCOUNT_ID},"userId":"101","bankCode":"001","productName":"p","balance":0,"status":"ACTIVE","createdAt":"2026-10-13T03:00:00Z","canceledAt":null}`,
      { status: 201 }
    )
  );
  const result = await store.dispatch(openAccount({ ...OPEN_INPUT, initialBalance: 0 }));
  assert.equal(result.payload.accountId, BIG_ACCOUNT_ID);
});

test('API-09: 필수값 누락·잘못된 값은 요청 자체를 보내지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201 }));
  for (const bad of [
    { ci: '' },
    { userName: undefined },
    { phoneNumber: '  ' },
    { bankCode: null },
    { productName: '' },
    { initialBalance: -1 },
    { initialBalance: 1.5 },
    { initialBalance: '1000' },
  ]) {
    const result = await store.dispatch(openAccount({ ...OPEN_INPUT, ...bad }));
    assert.equal(openAccount.rejected.match(result), true, JSON.stringify(bad));
  }
  assert.equal(
    await store.dispatch(openAccount(undefined)).then(r => r.type),
    'asset/openAccount/rejected'
  );
  assert.equal(gateway.requestsTo(ACCOUNTS_PATH).length, 0);
  assert.equal(asset(store).openAccountLoading, false);
});

test('API-09: 400/401/500 실패는 개설 완료로 표시되지 않고 목록을 바꾸지 않는다(자동 재시도 없음)', async () => {
  for (const [status, route] of [
    [400, bankingError(400, 'INVALID_REQUEST')],
    [500, jsonRoute({ status: 500, error: 'Internal Server Error' }, { status: 500 })],
  ]) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', ACCOUNTS_PATH, route);
    const result = await store.dispatch(openAccount(OPEN_INPUT));
    assert.equal(openAccount.rejected.match(result), true, String(status));
    assert.equal(result.payload.status, status);
    assert.equal(typeof asset(store).openAccountError, 'string');
    assert.deepEqual(asset(store).accounts, []);
    assert.equal(gateway.requestsTo(ACCOUNTS_PATH).length, 1, '자동 재시도 금지');
  }

  // 401(토큰 없음): 요청은 보냈지만 인증 거부
  const store = makeStore();
  gateway.reset(); // 유효 토큰 없음 → INVALID_TOKEN → refresh 시도 후에도 거부
  gateway.rejectAllTokens = true;
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201 }));
  const unauthorized = await store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(openAccount.rejected.match(unauthorized), true);
  assert.equal(asset(store).openAccountLoading, false);
});

test('API-09: 응답 형식이 계약과 다르면 성공으로 보지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute({ accountId: 'abc' }, { status: 201 }));
  const result = await store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(openAccount.rejected.match(result), true);
  assert.equal(asset(store).openAccountError !== null, true);
});

test('API-09: 진행 중 중복 호출은 요청을 보내지 않는다(버튼 연타 방지)', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201, delay: 100 }));
  const first = store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(asset(store).openAccountLoading, true);
  const second = await store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(second.meta.condition, true, '두 번째 dispatch는 취소된다');
  await first;
  assert.equal(gateway.requestsTo(ACCOUNTS_PATH).length, 1);
});

test('API-09: 동일 조합 중복 개설은 서버가 기존 계좌를 201로 돌려줄 수 있고, 앱은 새 계좌·잔액을 단정하지 않는다', async () => {
  const store = makeStore();
  // 서버: 같은 (ci, bankCode, productName)이면 기존 계좌 반환, initialBalance는 무시된다.
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse({ balance: 1234 }), { status: 201 }));
  const first = await store.dispatch(openAccount(OPEN_INPUT));
  const second = await store.dispatch(openAccount({ ...OPEN_INPUT, initialBalance: 999999 }));
  assert.equal(first.payload.accountId, second.payload.accountId);
  assert.equal(second.payload.balance, 1234, '요청한 초기 잔액이 아니라 서버 응답 값을 따른다');
  assert.deepEqual(asset(store).accounts, [], '어느 쪽도 목록에 직접 반영하지 않는다');
});

test('API-09: 개설 성공 후 목록 1회 재조회 — 반영이 지연돼 비어 있어도 자동 반복 조회하지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201 }));
  gateway.route('GET', LIST_PATH, rawJsonRoute('{"accounts":[]}')); // Kafka 반영 전
  const opened = await store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(openAccount.fulfilled.match(opened), true);
  await store.dispatch(fetchAccounts()); // 화면이 성공 확인 후 1회 호출하는 재조회
  await new Promise(resolve => setTimeout(resolve, 80));

  assert.deepEqual(asset(store).accounts, []);
  assert.equal(asset(store).accountsError, null, '빈 목록은 오류가 아니다');
  assert.equal(gateway.requestsTo(LIST_PATH).length, 1, '스스로 다시 조회하지 않는다');

  // 사용자가 직접 다시 조회하면(홈 다시 시도 등) 그때 반영된다.
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      `{"accounts":[{"accountId":"${BIG_ACCOUNT_ID}","balance":500000.0000,"status":"ACTIVE","syncStatus":"SYNC_REQUIRED","lastSyncedAt":null,"createdAt":"2026-10-13T03:00:00"}]}`
    )
  );
  await store.dispatch(fetchAccounts());
  assert.equal(asset(store).accounts.length, 1);
  assert.equal(asset(store).accounts[0].id, BIG_ACCOUNT_ID);
});

test('API-09: 진행 중 로그아웃·사용자 전환 시 이전 응답이 새 세션 상태를 바꾸지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openResponse(), { status: 201, delay: 100 }));
  const inflight = store.dispatch(openAccount(OPEN_INPUT));
  assert.equal(asset(store).openAccountLoading, true);

  store.dispatch(logoutUser.pending('rid-logout'));
  assert.equal(asset(store).openAccountLoading, false);
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  const snapshot = JSON.stringify(asset(store));

  await inflight;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(JSON.stringify(asset(store)), snapshot);
});

// ── API-10 송금: 결과 구분 ─────────────────────────────────────

test('API-10: COMPLETED만 완료이며 미확정 송금이 남지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
  assert.equal(transferFunds.fulfilled.match(result), true);
  assert.equal(asset(store).transferOutcome, TRANSFER_OUTCOME.COMPLETED);
  assert.equal(asset(store).pendingTransfer, null);
  assert.equal(asset(store).transferError, null);

  const [request] = gateway.requestsTo(TRANSFERS_PATH);
  assert.equal(isValidIdempotencyKey(request.headers['idempotency-key']), true);
  assert.deepEqual(request.body, {
    withdrawalAccountId: Number(BIG_ACCOUNT_ID) /* 비교용: 정밀도 검증은 rawBody로 따로 한다 */,
    depositBankCode: '001',
    depositAccountNumber: '00123456789012',
    amount: 10000,
    currency: 'KRW',
  });
});

test('API-10: 출금 계좌 id는 숫자 리터럴 원문(19자리)으로, 입금 계좌번호는 앞자리 0을 보존한 문자열로 전송한다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  await store.dispatch(transferFunds(TRANSFER_INPUT));
  const [request] = gateway.requestsTo(TRANSFERS_PATH);
  assert.match(request.rawBody, new RegExp(`"withdrawalAccountId":${BIG_ACCOUNT_ID},`));
  assert.match(request.rawBody, /"depositAccountNumber":"00123456789012"/);
  assert.match(request.rawBody, /"amount":10000[,}]/);
  // 서버 계약에 없는 필드는 보내지 않는다.
  assert.equal('memo' in request.body, false);
  assert.equal('toRecipient' in request.body, false);
  assert.equal('fromAccountId' in request.body, false);
});

test('API-10: FAILED·REVERSED는 서버가 확정한 결과로 서로 구분되고 미확정으로 남지 않는다', async () => {
  for (const status of ['FAILED', 'REVERSED']) {
    const store = makeStore();
    gateway.route('POST', TRANSFERS_PATH, transferRoute(status));
    const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
    assert.equal(transferFunds.fulfilled.match(result), true);
    assert.equal(asset(store).transferOutcome, TRANSFER_OUTCOME[status], status);
    assert.equal(asset(store).pendingTransfer, null, status);
  }
  assert.notEqual(TRANSFER_OUTCOME.FAILED, TRANSFER_OUTCOME.REVERSED);
});

test('API-10: ACCEPTED·PROCESSING은 완료가 아니며 같은 키·같은 본문이 미확정으로 보관된다', async () => {
  for (const status of ['ACCEPTED', 'PROCESSING']) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, transferRoute(status));
    const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
    assert.equal(transferFunds.fulfilled.match(result), true);
    const state = asset(store);
    assert.equal(state.transferOutcome, TRANSFER_OUTCOME.IN_PROGRESS);
    assert.notEqual(state.transferOutcome, TRANSFER_OUTCOME.COMPLETED);
    assert.equal(state.pendingTransfer.lastStatus, status);
    assert.equal(state.pendingTransfer.idempotencyKey, keysSent()[0]);
    assert.deepEqual(state.pendingTransfer.request, TRANSFER_INPUT);
  }
});

// ── API-10 송금: 오류 분류와 미확정 보호 ───────────────────────

test('API-10: 타임아웃·연결 끊김·5xx·응답 형식 오류는 결과 확인 불가(UNCERTAIN)로 미확정 보관한다', async () => {
  const cases = {
    timeout: transferRoute('COMPLETED', { delay: 600 }),
    disconnect: () => ({ destroy: true }),
    server500: jsonRoute({ status: 500 }, { status: 500 }),
    badBody: jsonRoute({ transferId: 'x' }),
  };
  for (const [name, route] of Object.entries(cases)) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, route);
    const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
    assert.equal(transferFunds.rejected.match(result), true, name);
    assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.UNCERTAIN, name);
    assert.equal(asset(store).pendingTransfer?.lastStatus, 'UNKNOWN', name);
    assert.equal(asset(store).pendingTransfer?.idempotencyKey, keysSent()[0], name);
    assert.equal(asset(store).transferOutcome, null, `${name}: 성공/실패를 단정하지 않는다`);
    assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 1, `${name}: 자동 재송금 없음`);
  }
});

test('API-10: 서버가 실행하지 않았음이 확실한 오류(400/403/404/409 업무 코드)는 미확정으로 남기지 않는다', async () => {
  const cases = [
    [400, 'MISSING_IDEMPOTENCY_KEY'],
    [400, 'INVALID_REQUEST'],
    [403, 'BANKING_ACCOUNT_FORBIDDEN'],
    [404, 'BANKING_ACCOUNT_NOT_FOUND'],
    [409, 'BANKING_ACCOUNT_NOT_ACTIVE'],
  ];
  for (const [status, code] of cases) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, bankingError(status, code));
    const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
    assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.REJECTED, `${status} ${code}`);
    assert.equal(result.payload.code, code);
    assert.equal(asset(store).pendingTransfer, null, `${status} ${code}`);
    assert.equal(typeof asset(store).transferError, 'string');
  }
});

test('API-10: IDEMPOTENCY_KEY_CONFLICT(409)는 확정 거절이 아니므로 미확정을 유지한다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, bankingError(409, 'IDEMPOTENCY_KEY_CONFLICT'));
  const result = await store.dispatch(transferFunds(TRANSFER_INPUT));
  assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.UNCERTAIN);
  assert.notEqual(asset(store).pendingTransfer, null);
});

test('API-10: 인증 실패(401)·요청 전 입력 검증 실패는 요청이 실행되지 않은 것으로 미확정이 아니다', async () => {
  const store = makeStore();
  gateway.reset();
  gateway.rejectAllTokens = true;
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  const unauthorized = await store.dispatch(transferFunds(TRANSFER_INPUT));
  assert.equal(transferFunds.rejected.match(unauthorized), true);
  assert.equal(unauthorized.payload.outcome, TRANSFER_ERROR_OUTCOME.REJECTED);
  assert.equal(asset(store).pendingTransfer, null);

  // 입력 검증 실패(요청 없음): 출금 계좌 없음/잘못된 id, 빈 입금 정보, 금액 정밀도 초과·0·음수·소수
  gateway.reset();
  gateway.validTokens.add('valid');
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  const invalidInputs = [
    { withdrawalAccountId: undefined },
    { withdrawalAccountId: null },
    { withdrawalAccountId: '' },
    { withdrawalAccountId: 'abc' },
    { withdrawalAccountId: 123 }, // Number 거부
    { withdrawalAccountId: '0' },
    { depositBankCode: '' },
    { depositAccountNumber: '   ' },
    { amount: 0 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: 2 ** 53 }, // 안전 정수 초과
    { amount: '10000' },
  ];
  for (const bad of invalidInputs) {
    const result = await store.dispatch(transferFunds({ ...TRANSFER_INPUT, ...bad }));
    assert.equal(transferFunds.rejected.match(result), true, JSON.stringify(bad));
    assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.REJECTED, JSON.stringify(bad));
  }
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 0, '검증 실패는 요청을 보내지 않는다');
  assert.equal(asset(store).pendingTransfer, null);
});

test('API-10: 미확정이 있으면 새 송금(새 키)은 요청을 보내지 않고 차단된다 — 입력을 바꿔도 마찬가지다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
  await store.dispatch(transferFunds(TRANSFER_INPUT));
  const originalKey = keysSent()[0];
  const before = JSON.stringify(asset(store).pendingTransfer);

  for (const changed of [
    TRANSFER_INPUT,
    { ...TRANSFER_INPUT, amount: 20000 },
    { ...TRANSFER_INPUT, depositAccountNumber: '999' },
    { ...TRANSFER_INPUT, idempotencyKey: 'brand-new-key' },
  ]) {
    const result = await store.dispatch(transferFunds(changed));
    assert.equal(transferFunds.rejected.match(result), true);
    assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.BLOCKED);
  }
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 1, '새 송금 요청이 나가지 않았다');
  assert.equal(
    JSON.stringify(asset(store).pendingTransfer),
    before,
    '미확정 요청·키가 바뀌지 않았다'
  );
  assert.equal(asset(store).pendingTransfer.idempotencyKey, originalKey);
});

test('API-10: 다시 확인은 저장된 같은 키·같은 본문으로만 보내고, 확정(COMPLETED)되면 미확정을 해제한다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
  await store.dispatch(transferFunds(TRANSFER_INPUT));

  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  // 호출부가 다른 입력을 넘겨도 무시하고 저장된 요청을 쓴다(입력 변경으로 새 송금이 되지 않는다).
  const recheck = await store.dispatch(
    transferFunds({ recheckPending: true, amount: 99999, depositAccountNumber: '1' })
  );
  assert.equal(transferFunds.fulfilled.match(recheck), true);
  assert.equal(asset(store).transferOutcome, TRANSFER_OUTCOME.COMPLETED);
  assert.equal(asset(store).pendingTransfer, null);

  const [first, second] = gateway.requestsTo(TRANSFERS_PATH);
  assert.equal(second.headers['idempotency-key'], first.headers['idempotency-key']);
  assert.equal(second.rawBody, first.rawBody, '요청 본문(원문)이 동일하다');
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 2);

  // 해제 후에는 새 의도에 새 키를 쓸 수 있다.
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  await store.dispatch(transferFunds({ ...TRANSFER_INPUT, amount: 5000 }));
  const keys = keysSent();
  assert.equal(keys.length, 3);
  assert.notEqual(keys[2], keys[0]);
});

test('API-10: 다시 확인이 FAILED/REVERSED로 확정되면 미확정을 해제한다', async () => {
  for (const status of ['FAILED', 'REVERSED']) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
    await store.dispatch(transferFunds(TRANSFER_INPUT));
    gateway.route('POST', TRANSFERS_PATH, transferRoute(status));
    await store.dispatch(transferFunds({ recheckPending: true }));
    assert.equal(asset(store).pendingTransfer, null, status);
    assert.equal(asset(store).transferOutcome, TRANSFER_OUTCOME[status], status);
  }
});

test('API-10: 다시 확인이 오류(타임아웃·401·4xx 등)로 끝나도 미확정은 유지된다(원래 송금이 실행됐을 수 있다)', async () => {
  const errorRoutes = {
    timeout: transferRoute('COMPLETED', { delay: 600 }),
    server500: jsonRoute({ status: 500 }, { status: 500 }),
    notFound: bankingError(404, 'BANKING_ACCOUNT_NOT_FOUND'),
    conflict: bankingError(409, 'IDEMPOTENCY_KEY_CONFLICT'),
  };
  for (const [name, route] of Object.entries(errorRoutes)) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
    await store.dispatch(transferFunds(TRANSFER_INPUT));
    const kept = JSON.stringify(asset(store).pendingTransfer);

    gateway.route('POST', TRANSFERS_PATH, route);
    const result = await store.dispatch(transferFunds({ recheckPending: true }));
    assert.equal(transferFunds.rejected.match(result), true, name);
    assert.equal(JSON.stringify(asset(store).pendingTransfer), kept, name);
  }

  // 인증 거부로 재확인이 실패해도 유지
  const store = makeStore();
  gateway.reset();
  gateway.validTokens.add('valid');
  gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
  await store.dispatch(transferFunds(TRANSFER_INPUT));
  const kept = JSON.stringify(asset(store).pendingTransfer);
  gateway.rejectAllTokens = true;
  const denied = await store.dispatch(transferFunds({ recheckPending: true }));
  assert.equal(transferFunds.rejected.match(denied), true);
  assert.equal(JSON.stringify(asset(store).pendingTransfer), kept);
});

test('API-10: 확인할 미확정이 없는데 다시 확인을 요청하면 요청하지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
  const result = await store.dispatch(transferFunds({ recheckPending: true }));
  assert.equal(result.payload.outcome, TRANSFER_ERROR_OUTCOME.BLOCKED);
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 0);
});

test('API-10: 진행 중 중복 dispatch는 요청을 보내지 않는다(요청 한 번에 송금 한 번)', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED', { delay: 100 }));
  const first = store.dispatch(transferFunds(TRANSFER_INPUT));
  const second = await store.dispatch(transferFunds(TRANSFER_INPUT));
  const third = await store.dispatch(transferFunds({ recheckPending: true }));
  assert.equal(second.meta.condition, true);
  assert.equal(third.meta.condition, true);
  await first;
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 1);
});

test('API-10: REJECTED 오류 뒤 같은 키로 다시 보내면 같은 키가 사용된다(호출부가 키를 유지)', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, bankingError(400, 'INVALID_REQUEST'));
  const first = await store.dispatch(transferFunds(TRANSFER_INPUT));
  const key = first.payload.idempotencyKey;
  assert.equal(isValidIdempotencyKey(key), true);
  await store.dispatch(transferFunds({ ...TRANSFER_INPUT, idempotencyKey: key }));
  assert.deepEqual(keysSent(), [key, key]);
});

// ── 사용자 전환 격리 ───────────────────────────────────────────

test('사용자 전환: 로그아웃/로그인 시 미확정 송금·키·개설 상태가 폐기되고 다른 사용자에게 재사용되지 않는다', async () => {
  const enders = {
    'logoutUser.pending': () => logoutUser.pending('rid'),
    'logoutUser.fulfilled': () => logoutUser.fulfilled({}, 'rid'),
    logout: () => logout(),
    'loginUser.fulfilled': () => loginUser.fulfilled({ user: { userId: '2' } }, 'rid', {}),
  };
  for (const [name, makeAction] of Object.entries(enders)) {
    const store = makeStore();
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING'));
    await store.dispatch(transferFunds(TRANSFER_INPUT));
    const keyOfA = asset(store).pendingTransfer.idempotencyKey;
    assert.notEqual(asset(store).pendingTransfer, null);

    store.dispatch(makeAction());
    assert.equal(asset(store).pendingTransfer, null, name);
    assert.equal(asset(store).transferOutcome, null, name);
    assert.equal(JSON.stringify(asset(store)).includes(keyOfA), false, `${name}: 이전 키 잔존`);
    assert.equal(
      JSON.stringify(asset(store)).includes(TRANSFER_INPUT.depositAccountNumber),
      false,
      `${name}: 이전 입금 계좌 잔존`
    );

    // 사용자 B는 막히지 않고 새 키로 송금할 수 있다.
    gateway.route('POST', TRANSFERS_PATH, transferRoute('COMPLETED'));
    await store.dispatch(transferFunds({ ...TRANSFER_INPUT, amount: 3000 }));
    const keys = keysSent();
    assert.notEqual(keys[keys.length - 1], keyOfA, `${name}: 키 재사용 금지`);
  }
});

test('사용자 전환: 로그아웃 후 늦게 도착한 송금 응답(PROCESSING·타임아웃)이 새 세션에 미확정을 만들지 않는다', async () => {
  const store = makeStore();
  gateway.route('POST', TRANSFERS_PATH, transferRoute('PROCESSING', { delay: 120 }));
  const inflight = store.dispatch(transferFunds(TRANSFER_INPUT));
  store.dispatch(logoutUser.pending('rid'));
  store.dispatch(loginUser.fulfilled({ user: { userId: '2' } }, 'rid-login', {}));
  await inflight;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(asset(store).pendingTransfer, null);
  assert.equal(asset(store).transferOutcome, null);
  assert.equal(asset(store).transferLoading, false);
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
