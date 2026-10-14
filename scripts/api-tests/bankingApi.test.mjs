// Banking API 통신 레이어(API-09~10) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/bankingApi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_ACCOUNT_ID,
  everRequested,
  gateway,
  jsonRoute,
  rawJsonRoute,
  rejectionOf,
} from './assetTestEnv.mjs';

const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const { ASSET_ERROR_TYPE, ASSET_REQUEST_ERROR, getAssetErrorType } =
  await import('../../src/features/asset/assetResponse.js');
const { OnboardingRequestError } = await import('../../src/features/onboarding/onboardingApi.js');
const {
  buildOpenAccountRequestBody,
  buildTransferRequestBody,
  openBankingAccount,
  requestTransfer,
} = await import('../../src/features/asset/bankingApi.js');
const { isValidIdempotencyKey } = await import('../../src/utils/idempotencyKey.js');

const ACCOUNTS_PATH = '/api/v1/banking/accounts';
const TRANSFERS_PATH = '/api/v1/banking/transfers';

const openInput = (overrides = {}) => ({
  ci: 'TEST-CI-001',
  userName: '테스트',
  phoneNumber: '01000000000',
  bankCode: '001',
  productName: '입출금통장',
  initialBalance: 100000,
  ...overrides,
});

const transferInput = (overrides = {}) => ({
  withdrawalAccountId: BIG_ACCOUNT_ID,
  depositBankCode: '001',
  depositAccountNumber: 'TEST-RECIPIENT-001',
  amount: 10000,
  ...overrides,
});

const openFixture = (overrides = {}) => ({
  accountId: 123,
  userId: '123',
  bankCode: '001',
  productName: '입출금통장',
  balance: 100000,
  status: 'ACTIVE',
  createdAt: '2026-10-11T03:00:00Z',
  canceledAt: null,
  ...overrides,
});

const transferFixture = (overrides = {}) => ({
  transferId: 456,
  publicTransferId: 'MOAJE-BNK-20261011-ABC',
  status: 'COMPLETED',
  message: '송금이 완료되었습니다.',
  externalTransactionId: 'MOCK-TX-001',
  ...overrides,
});

test('엔드포인트 상수: 명세 경로(Gateway /api/v1/banking/...)와 일치', () => {
  assert.equal(API_ENDPOINTS.BANKING.ACCOUNTS, ACCOUNTS_PATH);
  assert.equal(API_ENDPOINTS.BANKING.TRANSFERS, TRANSFERS_PATH);
});

// ── API-09 ───────────────────────────────────────────────────

test('API-09: POST, Bearer, 명세 키 이름 본문(userId 미전송), 멱등 키 없음, 응답 변환', async () => {
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openFixture(), { status: 201 }));

  const account = await openBankingAccount(openInput());

  const [request] = gateway.requestsTo(ACCOUNTS_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.deepEqual(request.body, openInput());
  assert.equal('userId' in request.body, false);

  assert.deepEqual(account, {
    accountId: '123',
    userId: '123',
    bankCode: '001',
    productName: '입출금통장',
    balance: 100000,
    status: 'ACTIVE',
    createdAt: '2026-10-11T03:00:00Z',
    canceledAt: null,
  });
});

test('API-09: 19자리 accountId 응답을 정밀도 손실 없이 문자열로 받는다', async () => {
  gateway.route(
    'POST',
    ACCOUNTS_PATH,
    rawJsonRoute(
      `{"accountId":${BIG_ACCOUNT_ID},"userId":"123","bankCode":"001","productName":"p","balance":0,"status":"ACTIVE","createdAt":"2026-10-11T03:00:00Z","canceledAt":null}`,
      { status: 201 }
    )
  );
  const account = await openBankingAccount(openInput({ initialBalance: 0 }));
  assert.equal(account.accountId, BIG_ACCOUNT_ID);
});

test('API-09: 응답 형식 위반 → invalidResponse (id·status·balance·필수 필드)', async () => {
  for (const body of [
    openFixture({ accountId: 'abc' }),
    openFixture({ accountId: 0 }),
    openFixture({ accountId: 1.5 }),
    openFixture({ status: 'OPEN' }),
    openFixture({ balance: '100000' }),
    openFixture({ bankCode: '' }),
    [],
  ]) {
    gateway.route('POST', ACCOUNTS_PATH, jsonRoute(body, { status: 201 }));
    const error = await rejectionOf(openBankingAccount(openInput()));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
    assert.equal(getAssetErrorType(error), ASSET_ERROR_TYPE.INVALID_RESPONSE);
  }
});

test('API-09: 요청 입력 검증 실패는 네트워크 요청 없이 거부, 메시지에 입력 값 없음', async () => {
  for (const bad of [
    openInput({ ci: '' }),
    openInput({ phoneNumber: 12345 }),
    openInput({ initialBalance: -1 }),
    openInput({ initialBalance: 1.5 }),
    openInput({ initialBalance: '100' }),
  ]) {
    const error = await rejectionOf(openBankingAccount(bad));
    assert.ok(error instanceof OnboardingRequestError);
    assert.equal(getAssetErrorType(error), ASSET_ERROR_TYPE.INVALID_REQUEST);
    assert.ok(!JSON.stringify(error.message).includes('TEST-CI-001'));
  }
  assert.throws(() => buildOpenAccountRequestBody(null), OnboardingRequestError);
  assert.equal(gateway.requests.length, 0);
});

// ── API-10 ───────────────────────────────────────────────────

test('API-10: 본문 키 이름·withdrawalAccountId 숫자 리터럴 원문·currency 기본 KRW·Idempotency-Key 헤더', async () => {
  gateway.route('POST', TRANSFERS_PATH, jsonRoute(transferFixture()));

  const { transfer, idempotencyKey } = await requestTransfer(transferInput());

  const [request] = gateway.requestsTo(TRANSFERS_PATH);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['idempotency-key'], idempotencyKey);
  assert.ok(isValidIdempotencyKey(idempotencyKey));
  assert.equal(
    request.rawBody,
    `{"withdrawalAccountId":${BIG_ACCOUNT_ID},"depositBankCode":"001","depositAccountNumber":"TEST-RECIPIENT-001","amount":10000,"currency":"KRW"}`,
    '출금 계좌 id는 숫자 리터럴 원문(문자열 아님, 반올림 없음)'
  );

  assert.deepEqual(transfer, {
    transferId: '456',
    publicTransferId: 'MOAJE-BNK-20261011-ABC',
    status: 'COMPLETED',
    message: '송금이 완료되었습니다.',
    externalTransactionId: 'MOCK-TX-001',
  });
});

test('API-10: 호출부가 준 키를 그대로 쓰고, 같은 키로 재시도해도 키가 바뀌지 않는다', async () => {
  gateway.route('POST', TRANSFERS_PATH, jsonRoute(transferFixture({ status: 'PROCESSING' })));

  const first = await requestTransfer(transferInput(), { idempotencyKey: 'demo-transfer-001' });
  const second = await requestTransfer(transferInput(), { idempotencyKey: first.idempotencyKey });
  const fresh = await requestTransfer(transferInput());

  const keys = gateway.requestsTo(TRANSFERS_PATH).map(r => r.headers['idempotency-key']);
  assert.deepEqual(keys.slice(0, 2), ['demo-transfer-001', 'demo-transfer-001']);
  assert.notEqual(keys[2], 'demo-transfer-001', '새 송금 의도는 새 키');
  assert.equal(fresh.idempotencyKey, keys[2]);
});

test('API-10: status 5종을 구분해 그대로 전달, externalTransactionId 생략/null은 null', async () => {
  for (const status of ['ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED']) {
    const { externalTransactionId: _omitted, ...withoutExternal } = transferFixture({ status });
    gateway.route('POST', TRANSFERS_PATH, jsonRoute(withoutExternal));
    const { transfer } = await requestTransfer(transferInput());
    assert.equal(transfer.status, status);
    assert.equal(transfer.externalTransactionId, null);
  }
});

test('API-10: 응답 형식 위반(알 수 없는 status·id·message 누락) → invalidResponse, 성공으로 취급하지 않음', async () => {
  for (const body of [
    transferFixture({ status: 'DONE' }),
    transferFixture({ transferId: 'x' }),
    transferFixture({ publicTransferId: '' }),
    { transferId: 1, publicTransferId: 'p', status: 'COMPLETED' },
    {},
  ]) {
    gateway.route('POST', TRANSFERS_PATH, jsonRoute(body));
    const error = await rejectionOf(requestTransfer(transferInput()));
    assert.equal(error.invalidResponse, true, JSON.stringify(body));
  }
});

test('API-10: 요청 입력 검증(숫자 계좌 id 문자열·금액·필수 문자열) 실패는 요청 없이 거부', async () => {
  for (const bad of [
    transferInput({ withdrawalAccountId: 123 }), // Number 거부
    transferInput({ withdrawalAccountId: '12a' }),
    transferInput({ withdrawalAccountId: '0' }),
    transferInput({ withdrawalAccountId: '9223372036854775808' }), // Long 범위 초과
    transferInput({ depositBankCode: '' }),
    transferInput({ depositAccountNumber: '  ' }),
    transferInput({ amount: 0 }),
    transferInput({ amount: -5 }),
    transferInput({ amount: 1.5 }),
    transferInput({ amount: '10000' }),
  ]) {
    const error = await rejectionOf(requestTransfer(bad));
    assert.ok(error instanceof OnboardingRequestError, JSON.stringify(bad));
  }
  const idError = await rejectionOf(requestTransfer(transferInput({ withdrawalAccountId: 5 })));
  assert.equal(idError.code, ASSET_REQUEST_ERROR.INVALID_ACCOUNT_ID);
  assert.throws(() => buildTransferRequestBody(undefined), OnboardingRequestError);
  assert.equal(gateway.requests.length, 0);
});

test('API-10: 서버 오류는 Banking 본문 code를 보존하고 상태별로 분류, 자동 재시도 없음', async () => {
  const cases = [
    [400, 'MISSING_IDEMPOTENCY_KEY', ASSET_ERROR_TYPE.BAD_REQUEST],
    [403, 'BANKING_ACCOUNT_FORBIDDEN', ASSET_ERROR_TYPE.FORBIDDEN],
    [404, 'BANKING_ACCOUNT_NOT_FOUND', ASSET_ERROR_TYPE.NOT_FOUND],
    [409, 'IDEMPOTENCY_KEY_CONFLICT', ASSET_ERROR_TYPE.CLIENT_ERROR],
    [500, 'INTERNAL', ASSET_ERROR_TYPE.SERVER],
  ];
  for (const [status, code, type] of cases) {
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route(
      'POST',
      TRANSFERS_PATH,
      jsonRoute({ code, message: '오류', timestamp: '2026-10-11T03:00:00Z' }, { status })
    );
    const error = await rejectionOf(requestTransfer(transferInput()));
    assert.equal(getAssetErrorType(error), type, `HTTP ${status}`);
    assert.equal(error.code, code);
    assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 1, '자동 재시도 없음');
  }
});

test('API-10: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK (재실행하지 않음)', async () => {
  gateway.route('POST', TRANSFERS_PATH, jsonRoute({}, { delay: 600 }));
  assert.equal(
    getAssetErrorType(await rejectionOf(requestTransfer(transferInput()))),
    ASSET_ERROR_TYPE.TIMEOUT
  );
  gateway.route('POST', TRANSFERS_PATH, () => ({ destroy: true }));
  assert.equal(
    getAssetErrorType(await rejectionOf(requestTransfer(transferInput()))),
    ASSET_ERROR_TYPE.NETWORK
  );
  assert.equal(gateway.requestsTo(TRANSFERS_PATH).length, 2, '호출 횟수만큼만 요청');
});

test('토큰이 없으면 401 → UNAUTHORIZED (API-09/10)', async () => {
  const { tokenService } = await import('./assetTestEnv.mjs');
  await tokenService.clearTokens();
  gateway.route('POST', ACCOUNTS_PATH, jsonRoute(openFixture(), { status: 201 }));
  gateway.route('POST', TRANSFERS_PATH, jsonRoute(transferFixture()));

  for (const call of [
    () => openBankingAccount(openInput()),
    () => requestTransfer(transferInput()),
  ]) {
    const error = await rejectionOf(call());
    assert.equal(getAssetErrorType(error), ASSET_ERROR_TYPE.UNAUTHORIZED);
  }
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});
