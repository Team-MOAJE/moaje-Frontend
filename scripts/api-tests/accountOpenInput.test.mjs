// 시연용 테스트 CI 규칙 + 개설 입력 구성, 송금 결과/오류 분류 단위 테스트(서버 호출 없음).
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/accountOpenInput.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  DEMO_BANK_CODE,
  DEMO_CI_PREFIX,
  DEMO_PRODUCT_NAME,
  MAX_DEMO_INITIAL_BALANCE,
  OPEN_ACCOUNT_BLOCK_REASON,
  buildDemoCi,
  buildOpenAccountInput,
} = await import('../../src/features/asset/accountOpenInput.js');
const {
  TRANSFER_ERROR_OUTCOME,
  TRANSFER_OUTCOME,
  classifyTransferError,
  classifyTransferStatus,
  describePendingTransfer,
  describeTransferOutcome,
  isValidDepositInput,
  sanitizeDigits,
} = await import('../../src/features/asset/transferOutcome.js');
const { createApiError, API_ERROR_KIND } = await import('../../src/services/apiResponse.js');
const { requestError, ASSET_REQUEST_ERROR } =
  await import('../../src/features/asset/assetResponse.js');

const USER_A = { userId: '101', name: '김모아', phoneNumber: '+821011112222' };
const USER_B = { userId: '102', name: '이모아', phoneNumber: '+821033334444' };

// ── 테스트 CI ─────────────────────────────────────────────────

test('테스트 CI: 사용자별로 서로 다르고, 같은 사용자는 항상 같다(호출마다 새로 만들지 않는다)', () => {
  assert.equal(buildDemoCi('101'), 'MOAJE-DEMO-101');
  assert.notEqual(buildDemoCi('101'), buildDemoCi('102'));
  for (let i = 0; i < 5; i += 1) assert.equal(buildDemoCi('101'), buildDemoCi('101'));
  assert.equal(DEMO_CI_PREFIX, 'MOAJE-DEMO-');
});

test('테스트 CI: 큰 정수 사용자 id도 문자열 그대로 사용한다(Number 변환 없음)', () => {
  assert.equal(buildDemoCi('9223372036854775807'), 'MOAJE-DEMO-9223372036854775807');
  assert.equal(buildDemoCi('1234567890123456789'), 'MOAJE-DEMO-1234567890123456789');
});

test('테스트 CI: 사용자 id를 확인할 수 없으면 만들지 않는다(임의 id·고정 값·Number 거부)', () => {
  for (const bad of [undefined, null, '', ' ', 'abc', '0', '-1', '1.5', 101, 1e21, {}, [], true]) {
    assert.equal(buildDemoCi(bad), null, String(bad));
  }
  assert.equal(buildDemoCi('9223372036854775808'), null, 'Long 범위 초과');
});

// ── 개설 입력 ─────────────────────────────────────────────────

test('개설 입력: 로그인 사용자의 저장된 이름·전화번호와 고정 은행·상품, 사용자별 CI만으로 구성한다', () => {
  const built = buildOpenAccountInput({ user: USER_A, initialBalance: 500000 });
  assert.deepEqual(built, {
    ok: true,
    input: {
      ci: 'MOAJE-DEMO-101',
      userName: '김모아',
      phoneNumber: '+821011112222',
      bankCode: DEMO_BANK_CODE,
      productName: DEMO_PRODUCT_NAME,
      initialBalance: 500000,
    },
  });
  assert.equal(DEMO_BANK_CODE, '001');
  // 두 사용자의 입력은 CI·이름·전화번호가 서로 섞이지 않는다.
  const b = buildOpenAccountInput({ user: USER_B, initialBalance: 0 });
  assert.equal(b.input.ci, 'MOAJE-DEMO-102');
  assert.equal(b.input.userName, '이모아');
  assert.equal(b.input.phoneNumber, '+821033334444');
  assert.equal('userId' in b.input, false, '서버는 본문 userId를 쓰지 않는다');
});

test('개설 입력: 필수 정보가 없으면 만들지 않고 이유를 구분한다(값을 지어내지 않는다)', () => {
  const reason = args => buildOpenAccountInput(args).reason;
  assert.equal(
    reason({ user: { ...USER_A, userId: null }, initialBalance: 0 }),
    OPEN_ACCOUNT_BLOCK_REASON.USER_ID
  );
  assert.equal(
    reason({ user: { ...USER_A, name: null }, initialBalance: 0 }),
    OPEN_ACCOUNT_BLOCK_REASON.USER_NAME
  );
  assert.equal(
    reason({ user: { ...USER_A, name: '  ' }, initialBalance: 0 }),
    OPEN_ACCOUNT_BLOCK_REASON.USER_NAME
  );
  assert.equal(
    reason({ user: { ...USER_A, phoneNumber: null }, initialBalance: 0 }),
    OPEN_ACCOUNT_BLOCK_REASON.PHONE_NUMBER
  );
  assert.equal(reason({ user: null, initialBalance: 0 }), OPEN_ACCOUNT_BLOCK_REASON.USER_ID);
  assert.equal(reason(undefined), OPEN_ACCOUNT_BLOCK_REASON.USER_ID);
  for (const bad of [
    -1,
    1.5,
    '1000',
    null,
    undefined,
    NaN,
    2 ** 53,
    MAX_DEMO_INITIAL_BALANCE + 1,
  ]) {
    assert.equal(
      reason({ user: USER_A, initialBalance: bad }),
      OPEN_ACCOUNT_BLOCK_REASON.INITIAL_BALANCE,
      String(bad)
    );
  }
  assert.equal(buildOpenAccountInput({ user: USER_A, initialBalance: 0 }).ok, true);
  assert.equal(
    buildOpenAccountInput({ user: USER_A, initialBalance: MAX_DEMO_INITIAL_BALANCE }).ok,
    true
  );
});

// ── 송금 결과 분류 ────────────────────────────────────────────

test('송금 상태 분류: COMPLETED만 완료, ACCEPTED/PROCESSING은 처리 중, FAILED·REVERSED는 별도', () => {
  assert.equal(classifyTransferStatus('COMPLETED'), TRANSFER_OUTCOME.COMPLETED);
  assert.equal(classifyTransferStatus('ACCEPTED'), TRANSFER_OUTCOME.IN_PROGRESS);
  assert.equal(classifyTransferStatus('PROCESSING'), TRANSFER_OUTCOME.IN_PROGRESS);
  assert.equal(classifyTransferStatus('FAILED'), TRANSFER_OUTCOME.FAILED);
  assert.equal(classifyTransferStatus('REVERSED'), TRANSFER_OUTCOME.REVERSED);
  for (const unknown of ['SUCCEEDED', 'UNKNOWN', '', null, undefined, 1]) {
    assert.equal(classifyTransferStatus(unknown), null, String(unknown));
  }
});

test('송금 안내: 상태별 문구가 서로 다르고, 처리 중·결과 불명은 완료 문구를 쓰지 않는다', () => {
  const notices = Object.values(TRANSFER_OUTCOME).map(o => describeTransferOutcome(o));
  assert.equal(new Set(notices.map(n => n.title)).size, 4);
  const completed = describeTransferOutcome(TRANSFER_OUTCOME.COMPLETED);
  for (const pending of [
    describePendingTransfer({ lastStatus: 'PROCESSING' }),
    describePendingTransfer({ lastStatus: 'ACCEPTED' }),
    describePendingTransfer({ lastStatus: 'UNKNOWN' }),
  ]) {
    assert.notEqual(pending.message, completed.message);
    assert.doesNotMatch(pending.message, /송금이 완료됐어요/);
  }
  assert.equal(describePendingTransfer({ lastStatus: 'UNKNOWN' }).tone, 'unknown');
  assert.equal(describePendingTransfer({ lastStatus: 'PROCESSING' }).tone, 'progress');
  assert.equal(describePendingTransfer(null), null);
  assert.equal(describeTransferOutcome(TRANSFER_OUTCOME.REVERSED).tone, 'reversed');
  assert.equal(describeTransferOutcome(TRANSFER_OUTCOME.FAILED).tone, 'failure');
});

test('송금 오류 분류: 확정 거절은 REJECTED, 결과 불명은 UNCERTAIN(애매하면 UNCERTAIN)', () => {
  const http = (kind, status, code) => {
    const error = createApiError({ kind, status, message: 'm' });
    error.code = code ?? error.code;
    return error;
  };
  const { REJECTED, UNCERTAIN } = TRANSFER_ERROR_OUTCOME;
  assert.equal(
    classifyTransferError(requestError(ASSET_REQUEST_ERROR.INVALID_AMOUNT, 'x')),
    REJECTED
  );
  assert.equal(classifyTransferError(http(API_ERROR_KIND.CONFIG)), REJECTED);
  assert.equal(classifyTransferError(http(API_ERROR_KIND.AUTH_REQUIRED, 401)), REJECTED);
  assert.equal(classifyTransferError(http(API_ERROR_KIND.TOKEN_INVALID, 401)), REJECTED);
  assert.equal(classifyTransferError(http(API_ERROR_KIND.SESSION_EXPIRED, 401)), REJECTED);
  for (const status of [400, 403, 404, 409, 422, 429]) {
    assert.equal(classifyTransferError(http(API_ERROR_KIND.HTTP_4XX, status)), REJECTED, status);
  }
  assert.equal(
    classifyTransferError(http(API_ERROR_KIND.HTTP_4XX, 409, 'IDEMPOTENCY_KEY_CONFLICT')),
    UNCERTAIN
  );
  assert.equal(classifyTransferError(http(API_ERROR_KIND.HTTP_4XX, 408)), UNCERTAIN);
  for (const kind of [
    API_ERROR_KIND.NETWORK,
    API_ERROR_KIND.TIMEOUT,
    API_ERROR_KIND.HTTP_5XX,
    API_ERROR_KIND.CANCELED,
  ]) {
    assert.equal(
      classifyTransferError(http(kind, kind === API_ERROR_KIND.HTTP_5XX ? 500 : null)),
      UNCERTAIN,
      kind
    );
  }
  const invalid = http(API_ERROR_KIND.BUSINESS);
  invalid.invalidResponse = true;
  assert.equal(classifyTransferError(invalid), UNCERTAIN);
  assert.equal(classifyTransferError(new Error('unknown')), UNCERTAIN);
  assert.equal(classifyTransferError(undefined), UNCERTAIN);
});

// ── 입금 정보 입력 ────────────────────────────────────────────

test('입금 정보: 숫자만 허용하고 앞자리 0을 보존하며, 비거나 잘못되면 무효', () => {
  assert.equal(sanitizeDigits('001-2345 6789'), '00123456789');
  assert.equal(sanitizeDigits('abc'), '');
  assert.equal(sanitizeDigits(undefined), '');
  assert.equal(sanitizeDigits('0012'), '0012');
  assert.equal(
    isValidDepositInput({ depositBankCode: '001', depositAccountNumber: '00123456789012' }),
    true
  );
  for (const bad of [
    { depositBankCode: '', depositAccountNumber: '123' },
    { depositBankCode: '001', depositAccountNumber: '' },
    { depositBankCode: '0a1', depositAccountNumber: '123' },
    { depositBankCode: '001', depositAccountNumber: '12 34' },
    { depositBankCode: '001', depositAccountNumber: 123 },
    { depositBankCode: 1, depositAccountNumber: '123' },
    { depositBankCode: '1'.repeat(21), depositAccountNumber: '123' },
    { depositBankCode: '001', depositAccountNumber: '1'.repeat(101) },
  ]) {
    assert.equal(isValidDepositInput(bad), false, JSON.stringify(bad));
  }
});
