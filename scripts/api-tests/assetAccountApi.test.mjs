// Asset 계좌 API 통신 레이어(API-11~14) 단위 테스트 (모의 Gateway 사용, 실제 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/assetAccountApi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BIG_ACCOUNT_ID,
  BIG_CURSOR,
  BIG_TX_ID,
  everRequested,
  gateway,
  jsonRoute,
  rawJsonRoute,
  rejectionOf,
  tokenService,
} from './assetTestEnv.mjs';

const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');
const {
  ASSET_ERROR_TYPE,
  ASSET_REQUEST_ERROR,
  getAssetErrorType,
  isAccountNumberUnavailableError,
} = await import('../../src/features/asset/assetResponse.js');
const { OnboardingRequestError } = await import('../../src/features/onboarding/onboardingApi.js');
const {
  buildTransactionsQuery,
  fetchAccountDetail,
  fetchAccountList,
  fetchAccountTransaction,
  fetchAccountTransactions,
  refreshAccount,
} = await import('../../src/features/asset/assetAccountApi.js');

const detailPath = id => `/api/v1/assets/accounts/${id}/detail`;
const txPath = (id, tx) => `/api/v1/assets/accounts/${id}/${tx}/transaction`;
const txListPath = id => `/api/v1/assets/accounts/${id}/transactions`;
const refreshPath = id => `/api/v1/assets/accounts/${id}/refresh`;

const txFixture = (overrides = {}) => ({
  transactionId: 789,
  publicTransactionId: 'MOAJE-BNK-456',
  type: 'TRANSFER',
  amount: 10000,
  targetAccountId: null,
  status: 'SUCCESS',
  merchantName: null,
  categoryCode: 'TRANSFER',
  createdAt: '2026-10-11T03:00:00',
  ...overrides,
});

const detailFixture = (overrides = {}) => ({
  accountId: 123,
  bankCode: null,
  bankName: null,
  accountNumber: '12345678901234',
  balance: 90000,
  syncStatus: 'SYNCED',
  refreshing: false,
  refreshFailed: false,
  message: null,
  lastSyncedAt: '2026-10-11T03:00:00',
  transactionHistory: [txFixture()],
  nextCursor: null,
  hasNext: false,
  ...overrides,
});

test('엔드포인트 상수: 명세 경로(Gateway /api/v1/assets/accounts/...)와 일치', () => {
  assert.equal(API_ENDPOINTS.ASSET.ACCOUNT_DETAIL(BIG_ACCOUNT_ID), detailPath(BIG_ACCOUNT_ID));
  assert.equal(
    API_ENDPOINTS.ASSET.ACCOUNT_TRANSACTION(BIG_ACCOUNT_ID, BIG_TX_ID),
    txPath(BIG_ACCOUNT_ID, BIG_TX_ID)
  );
  assert.equal(
    API_ENDPOINTS.ASSET.ACCOUNT_TRANSACTIONS(BIG_ACCOUNT_ID),
    txListPath(BIG_ACCOUNT_ID)
  );
  assert.equal(API_ENDPOINTS.ASSET.ACCOUNT_REFRESH(BIG_ACCOUNT_ID), refreshPath(BIG_ACCOUNT_ID));
});

// ── API-11 ───────────────────────────────────────────────────

test('API-11: GET, Bearer, 본문·쿼리 없음, 응답을 camelCase 모델로 변환(부호·날짜 변환 없음)', async () => {
  gateway.route('GET', detailPath('123'), jsonRoute(detailFixture()));

  const detail = await fetchAccountDetail('123');

  const [request] = gateway.requestsTo(detailPath('123'));
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined);
  assert.equal(request.query, '');

  assert.deepEqual(detail, {
    accountId: '123',
    bankCode: null,
    bankName: null,
    accountNumber: '12345678901234',
    balance: 90000,
    balanceExact: true,
    syncStatus: 'SYNCED',
    refreshing: false,
    refreshFailed: false,
    message: null,
    lastSyncedAt: '2026-10-11T03:00:00',
    transactionHistory: [
      {
        transactionId: '789',
        publicTransactionId: 'MOAJE-BNK-456',
        type: 'TRANSFER',
        amount: 10000,
        amountExact: true,
        targetAccountId: null,
        status: 'SUCCESS',
        merchantName: null,
        categoryCode: 'TRANSFER',
        createdAt: '2026-10-11T03:00:00',
      },
    ],
    nextCursor: null,
    hasNext: false,
  });
});

test('API-11: 19자리 accountId·transactionId·nextCursor를 문자열로 보존, 경로에 정확히 사용', async () => {
  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(
      `{"accountId":${BIG_ACCOUNT_ID},"accountNumber":"12345678901234","balance":1,"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"lastSyncedAt":null,"transactionHistory":[{"transactionId":${BIG_TX_ID},"publicTransactionId":"p","type":"DEPOSIT","amount":1,"status":"SUCCESS","categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}],"nextCursor":${BIG_CURSOR},"hasNext":true}`
    )
  );

  const detail = await fetchAccountDetail(BIG_ACCOUNT_ID);

  assert.equal(detail.accountId, BIG_ACCOUNT_ID);
  assert.equal(detail.transactionHistory[0].transactionId, BIG_TX_ID);
  assert.equal(detail.nextCursor, BIG_CURSOR);
  assert.equal(detail.hasNext, true);
  assert.equal(detail.bankCode, null, '생략된 nullable 필드는 null');
  assert.equal(gateway.requestsTo(detailPath(BIG_ACCOUNT_ID)).length, 1);
});

test('API-11: RECONCILING/STALE 상태와 안내 메시지를 서버 값 그대로 전달', async () => {
  gateway.route(
    'GET',
    detailPath('123'),
    jsonRoute(
      detailFixture({
        syncStatus: 'RECONCILING',
        refreshing: true,
        message: '계좌 정보를 업데이트하고 있습니다.',
      })
    )
  );
  const reconciling = await fetchAccountDetail('123');
  assert.equal(reconciling.syncStatus, 'RECONCILING');
  assert.equal(reconciling.refreshing, true);
  assert.equal(reconciling.message, '계좌 정보를 업데이트하고 있습니다.');

  gateway.route(
    'GET',
    detailPath('123'),
    jsonRoute(detailFixture({ syncStatus: 'STALE', refreshFailed: true, message: '새로고침 불가' }))
  );
  const stale = await fetchAccountDetail('123');
  assert.equal(stale.refreshFailed, true);
});

test('API-11: 거래 0건(빈 배열)·잔액 0은 정상', async () => {
  gateway.route(
    'GET',
    detailPath('123'),
    jsonRoute(detailFixture({ balance: 0, transactionHistory: [] }))
  );
  const detail = await fetchAccountDetail('123');
  assert.equal(detail.balance, 0);
  assert.deepEqual(detail.transactionHistory, []);
});

test('API-11: 응답 형식 위반 → invalidResponse', async () => {
  for (const body of [
    detailFixture({ syncStatus: 'OK' }),
    detailFixture({ balance: '90000' }),
    detailFixture({ refreshing: 'false' }),
    detailFixture({ transactionHistory: null }),
    detailFixture({ transactionHistory: [txFixture({ type: 'PAY' })] }),
    detailFixture({ transactionHistory: [txFixture({ amount: -1 })] }),
    detailFixture({ transactionHistory: [txFixture({ categoryCode: 'FUN' })] }),
    detailFixture({ hasNext: true, nextCursor: null }), // 다음 페이지가 있는데 커서가 없음
    detailFixture({ accountId: 0 }),
    [detailFixture()],
  ]) {
    gateway.route('GET', detailPath('123'), jsonRoute(body));
    const error = await rejectionOf(fetchAccountDetail('123'));
    assert.equal(error.invalidResponse, true, JSON.stringify(body).slice(0, 120));
    assert.equal(getAssetErrorType(error), ASSET_ERROR_TYPE.INVALID_RESPONSE);
  }
});

// ── API-12 ───────────────────────────────────────────────────

test('API-12: 경로 두 id를 문자열 그대로 사용하고 거래 1건을 변환', async () => {
  gateway.route(
    'GET',
    txPath(BIG_ACCOUNT_ID, BIG_TX_ID),
    rawJsonRoute(
      `{"transactionId":${BIG_TX_ID},"publicTransactionId":"MOAJE-BNK-456","type":"WITHDRAW","amount":3500,"targetAccountId":"token-1","status":"PENDING","merchantName":"카페","categoryCode":"CAFE","createdAt":"2026-10-11T03:00:00"}`
    )
  );

  const tx = await fetchAccountTransaction(BIG_ACCOUNT_ID, BIG_TX_ID);

  assert.equal(
    gateway.requestsTo(txPath(BIG_ACCOUNT_ID, BIG_TX_ID))[0].headers.authorization,
    'Bearer valid'
  );
  assert.deepEqual(tx, {
    transactionId: BIG_TX_ID,
    publicTransactionId: 'MOAJE-BNK-456',
    type: 'WITHDRAW',
    amount: 3500,
    amountExact: true,
    targetAccountId: 'token-1',
    status: 'PENDING',
    merchantName: '카페',
    categoryCode: 'CAFE',
    createdAt: '2026-10-11T03:00:00',
  });
});

test('API-12: 응답 형식 위반 → invalidResponse', async () => {
  gateway.route('GET', txPath('123', '789'), jsonRoute(txFixture({ status: 'DONE' })));
  assert.equal((await rejectionOf(fetchAccountTransaction('123', '789'))).invalidResponse, true);
  gateway.route('GET', txPath('123', '789'), jsonRoute({ transactions: [] }));
  assert.equal((await rejectionOf(fetchAccountTransaction('123', '789'))).invalidResponse, true);
});

// ── API-13 ───────────────────────────────────────────────────

test('API-13: 첫 페이지는 쿼리 없음, 다음 페이지는 lastTransactionId=nextCursor 원문', async () => {
  gateway.route(
    'GET',
    txListPath(BIG_ACCOUNT_ID),
    rawJsonRoute(
      `{"transactions":[{"transactionId":${BIG_TX_ID},"publicTransactionId":"p","type":"DEPOSIT","amount":1,"status":"SUCCESS","categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}],"nextCursor":${BIG_CURSOR},"hasNext":true}`
    )
  );

  const first = await fetchAccountTransactions(BIG_ACCOUNT_ID);
  assert.equal(first.nextCursor, BIG_CURSOR);
  assert.equal(first.hasNext, true);
  assert.equal(first.transactions[0].transactionId, BIG_TX_ID);

  await fetchAccountTransactions(BIG_ACCOUNT_ID, { lastTransactionId: first.nextCursor });

  const [r1, r2] = gateway.requestsTo(txListPath(BIG_ACCOUNT_ID));
  assert.equal(r1.query, '');
  assert.equal(r2.query, `lastTransactionId=${BIG_CURSOR}`);
  assert.equal(r2.body, undefined);
});

test('API-13: 마지막 페이지(hasNext=false, nextCursor=null)·빈 목록은 정상', async () => {
  gateway.route(
    'GET',
    txListPath('123'),
    jsonRoute({ transactions: [], nextCursor: null, hasNext: false })
  );
  assert.deepEqual(await fetchAccountTransactions('123'), {
    transactions: [],
    nextCursor: null,
    hasNext: false,
  });
});

test('API-13: lastTransactionId 입력 검증(숫자 문자열만)·응답 위반', async () => {
  for (const bad of [123, '12x', '0', '']) {
    const error = await rejectionOf(fetchAccountTransactions('123', { lastTransactionId: bad }));
    assert.ok(error instanceof OnboardingRequestError, String(bad));
    assert.equal(error.code, ASSET_REQUEST_ERROR.INVALID_CURSOR);
  }
  assert.deepEqual(buildTransactionsQuery(undefined), {});
  assert.deepEqual(buildTransactionsQuery({ lastTransactionId: null }), {});
  assert.equal(gateway.requests.length, 0);

  gateway.route('GET', txListPath('123'), jsonRoute({ transactions: {}, hasNext: false }));
  assert.equal((await rejectionOf(fetchAccountTransactions('123'))).invalidResponse, true);
});

// ── API-14 ───────────────────────────────────────────────────

test('API-14: 본문 없는 POST(빈 객체 미전송), 멱등 키 없음, 상세와 같은 모델로 변환', async () => {
  gateway.route('POST', refreshPath('123'), jsonRoute(detailFixture({ balance: 95000 })));

  const detail = await refreshAccount('123');

  const [request] = gateway.requestsTo(refreshPath('123'));
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.rawBody, undefined, '본문 없음');
  assert.equal(request.headers['idempotency-key'], undefined);
  assert.equal(detail.balance, 95000);
  assert.equal(detail.accountId, '123');
});

test('API-14: 서버 오류는 HTTP 상태별로 분류하고 자동 재시도하지 않는다', async () => {
  const cases = [
    [400, ASSET_ERROR_TYPE.BAD_REQUEST],
    [403, ASSET_ERROR_TYPE.FORBIDDEN],
    [404, ASSET_ERROR_TYPE.NOT_FOUND],
    [500, ASSET_ERROR_TYPE.SERVER],
  ];
  for (const [status, type] of cases) {
    gateway.reset();
    gateway.validTokens.add('valid');
    gateway.route(
      'POST',
      refreshPath('123'),
      jsonRoute(
        { title: 'ACCOUNT_REFRESH_FAILED', status, detail: '실패', msg: '실패' },
        { status }
      )
    );
    const error = await rejectionOf(refreshAccount('123'));
    assert.equal(getAssetErrorType(error), type, `HTTP ${status}`);
    assert.equal(gateway.requestsTo(refreshPath('123')).length, 1);
  }
});

// ── 공통 ─────────────────────────────────────────────────────

test('accountId·transactionId 입력 검증: Number·비숫자·0·Long 초과는 요청 없이 거부', async () => {
  for (const bad of [123, '1a', '0', '-5', '', null, undefined, '9223372036854775808']) {
    for (const call of [
      () => fetchAccountDetail(bad),
      () => fetchAccountTransactions(bad),
      () => refreshAccount(bad),
      () => fetchAccountTransaction(bad, '789'),
    ]) {
      const error = await rejectionOf(call());
      assert.ok(error instanceof OnboardingRequestError);
      assert.equal(error.code, ASSET_REQUEST_ERROR.INVALID_ACCOUNT_ID);
    }
  }
  const txError = await rejectionOf(fetchAccountTransaction('123', 789));
  assert.equal(txError.code, ASSET_REQUEST_ERROR.INVALID_TRANSACTION_ID);
  assert.equal(gateway.requests.length, 0);
});

test('오류 분류: 응답 지연 → TIMEOUT, 연결 끊김 → NETWORK, 토큰 없음 → UNAUTHORIZED', async () => {
  gateway.route('GET', detailPath('123'), jsonRoute({}, { delay: 600 }));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchAccountDetail('123'))),
    ASSET_ERROR_TYPE.TIMEOUT
  );

  gateway.route('GET', detailPath('123'), () => ({ destroy: true }));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchAccountDetail('123'))),
    ASSET_ERROR_TYPE.NETWORK
  );

  await tokenService.clearTokens();
  gateway.route('GET', detailPath('123'), jsonRoute(detailFixture()));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchAccountDetail('123'))),
    ASSET_ERROR_TYPE.UNAUTHORIZED
  );
});

// ── API-52 계좌 목록 ─────────────────────────────────────────

const LIST_PATH = '/api/v1/assets/accounts';

// 최신 명세(20261014): 루트 배열, 항목 { accountId(문자열), bankCode, bankName, balance, status }.
const listItemRaw = ({
  accountId = '"1"',
  balance = '10000.0000',
  status = 'ACTIVE',
  bankCode = 'null',
  bankName = 'null',
} = {}) =>
  `{"accountId":${accountId},"bankCode":${bankCode},"bankName":${bankName},"balance":${balance},"status":"${status}"}`;

const listRaw = (...items) => `[${items.join(',')}]`;

const balancesOf = async rawBalances => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(listRaw(...rawBalances.map(balance => listItemRaw({ balance }))))
  );
  const { accounts } = await fetchAccountList();
  return accounts.map(({ balance, balanceExact }) => ({ balance, balanceExact }));
};

test('API-52: GET, Bearer, 본문·쿼리 없음, 모델은 은행 정보를 포함한 5개 필드(+정확 여부)뿐', async () => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(listRaw(listItemRaw({ bankCode: '"001"', bankName: '"카카오뱅크"' })))
  );

  const result = await fetchAccountList();

  const [request] = gateway.requestsTo(LIST_PATH);
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.authorization, 'Bearer valid');
  assert.equal(request.body, undefined);
  assert.equal(request.query, '');
  assert.deepEqual(result, {
    accounts: [
      {
        accountId: '1',
        bankCode: '001',
        bankName: '카카오뱅크',
        maskedAccountNumber: null,
        balance: 10000,
        balanceExact: true,
        status: 'ACTIVE',
      },
    ],
  });
  // 최신 명세에서 제거된 필드를 만들어 내지 않는다.
  for (const key of [
    'syncStatus',
    'lastSyncedAt',
    'createdAt',
    'displayAccountNumber',
    'accountNumber',
  ]) {
    assert.equal(key in result.accounts[0], false);
  }
});

test('API-52: bankCode·bankName이 null이거나 키가 없어도 정상(null)이며 코드의 앞자리 0을 보존', async () => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      listRaw(
        listItemRaw(),
        listItemRaw({ bankCode: '"008"' }),
        '{"accountId":"3","balance":1,"status":"ACTIVE"}'
      )
    )
  );
  const { accounts } = await fetchAccountList();
  assert.deepEqual(
    accounts.map(a => [a.accountId, a.bankCode, a.bankName]),
    [
      ['1', null, null],
      ['1', '008', null],
      ['3', null, null],
    ]
  );
});

test('API-52: 빈 배열은 정상, 여러 계좌는 서버 순서와 상태를 그대로 유지', async () => {
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw()));
  assert.deepEqual(await fetchAccountList(), { accounts: [] });

  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      listRaw(
        listItemRaw({ accountId: '"3"', status: 'CLOSED' }),
        listItemRaw({ accountId: '"1"', status: 'ACTIVE' }),
        listItemRaw({ accountId: '"2"', status: 'SUSPENDED' })
      )
    )
  );
  const { accounts } = await fetchAccountList();
  assert.deepEqual(
    accounts.map(a => [a.accountId, a.status]),
    [
      ['3', 'CLOSED'],
      ['1', 'ACTIVE'],
      ['2', 'SUSPENDED'],
    ]
  );
});

test('API-52: 9223372036854775807 accountId는 JSON 문자열·JSON 숫자 어느 쪽이어도 정확히 보존', async () => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      listRaw(
        listItemRaw({ accountId: '"9223372036854775807"' }),
        listItemRaw({ accountId: '9223372036854775806' })
      )
    )
  );

  const { accounts } = await fetchAccountList();

  assert.deepEqual(
    accounts.map(a => a.accountId),
    ['9223372036854775807', '9223372036854775806']
  );
  assert.ok(accounts.every(a => typeof a.accountId === 'string'));
});

test('API-52: 19자리 문자열 accountId 두 개가 서로 구별되어 보존된다(Number 반올림 없음)', async () => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      listRaw(
        listItemRaw({ accountId: '"123456789012345679"' }),
        listItemRaw({ accountId: '"123456789012345678"' })
      )
    )
  );
  const { accounts } = await fetchAccountList();
  assert.deepEqual(
    accounts.map(a => a.accountId),
    ['123456789012345679', '123456789012345678']
  );
});

test('API-52: balance 원문 판정 — 정수·소수부 0은 정확, 소수부/범위 초과/지수는 추측 없이 null', async () => {
  assert.deepEqual(
    await balancesOf([
      '10000.0000',
      '0',
      '0.0000',
      '-5000',
      '9007199254740991',
      '12345.6789',
      '0.0001',
      '9007199254740993',
      '12345678901234567890',
      '1e3',
      '1.5E2',
    ]),
    [
      { balance: 10000, balanceExact: true },
      { balance: 0, balanceExact: true },
      { balance: 0, balanceExact: true },
      { balance: -5000, balanceExact: true },
      { balance: 9007199254740991, balanceExact: true },
      { balance: null, balanceExact: false },
      { balance: null, balanceExact: false },
      { balance: null, balanceExact: false },
      { balance: null, balanceExact: false },
      { balance: null, balanceExact: false },
      { balance: null, balanceExact: false },
    ]
  );
});

test('API-52: 파싱 후 정수로 보이는 소수(1.00000000000000001)도 원문으로 구분하고 다른 키의 balance 문자열은 건드리지 않는다', async () => {
  assert.deepEqual(await balancesOf(['1.00000000000000001', '5.00']), [
    { balance: null, balanceExact: false },
    { balance: 5, balanceExact: true },
  ]);

  const { quoteBalanceTokens } = await import('../../src/features/asset/assetAccountApi.js');
  assert.equal(
    quoteBalanceTokens('{"memo":"\\"balance\\":1.5","x":1.5}'),
    '{"memo":"\\"balance\\":1.5","x":1.5}'
  );
});

test('API-52: 응답 형식 위반 → invalidResponse (값 보정·항목 제외 없음)', async () => {
  const bad = [
    '{}',
    '{"accounts":[]}', // 구 소스의 객체형은 최신 계약이 아니다
    '{"accounts":null}',
    'null',
    '[null]',
    listRaw(listItemRaw({ status: 'DELETED' })),
    listRaw(listItemRaw({ accountId: '"abc"' })),
    listRaw(listItemRaw({ accountId: '0' })),
    listRaw(listItemRaw({ balance: '"100"' })),
    listRaw(listItemRaw({ balance: 'null' })),
    listRaw(listItemRaw({ bankCode: '1' })),
    listRaw(listItemRaw({ bankName: '123' })),
    '[{"accountId":"1","status":"ACTIVE"}]',
    '[{"balance":1,"status":"ACTIVE"}]',
    'not json',
  ];
  for (const raw of bad) {
    gateway.route('GET', LIST_PATH, rawJsonRoute(raw));
    const error = await rejectionOf(fetchAccountList());
    assert.equal(error.invalidResponse, true, raw.slice(0, 100));
  }
});

test('API-52: 오류 분류(401·타임아웃·네트워크)와 재시도 없음', async () => {
  gateway.route('GET', LIST_PATH, jsonRoute({}, { delay: 600 }));
  assert.equal(getAssetErrorType(await rejectionOf(fetchAccountList())), ASSET_ERROR_TYPE.TIMEOUT);

  gateway.route('GET', LIST_PATH, () => ({ destroy: true }));
  assert.equal(getAssetErrorType(await rejectionOf(fetchAccountList())), ASSET_ERROR_TYPE.NETWORK);

  gateway.route(
    'GET',
    LIST_PATH,
    jsonRoute(
      { code: 'UNAUTHENTICATED', message: 'Verified Gateway identity is required.' },
      { status: 401 }
    )
  );
  const before = gateway.requestsTo(LIST_PATH).length;
  const error = await rejectionOf(fetchAccountList());
  assert.ok(error);
  assert.ok(gateway.requestsTo(LIST_PATH).length - before <= 2, '자동 재시도 루프 없음');

  await tokenService.clearTokens();
  gateway.route('GET', LIST_PATH, rawJsonRoute(listRaw()));
  assert.equal(
    getAssetErrorType(await rejectionOf(fetchAccountList())),
    ASSET_ERROR_TYPE.UNAUTHORIZED
  );
});

// ── API-11~14 금액(balance·amount) 원문 보존 ─────────────────

const detailRaw = ({ balance = '90000', transactions = [], extra = '' } = {}) =>
  `{"accountId":123,"bankCode":null,"bankName":null,"accountNumber":"12345678901234","balance":${balance},"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[${transactions.join(',')}],"nextCursor":null,"hasNext":false${extra}}`;

const txRaw = ({ amount = '1000', id = '789' } = {}) =>
  `{"transactionId":${id},"publicTransactionId":"p","type":"DEPOSIT","amount":${amount},"status":"SUCCESS","categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}`;

const EXACT_CASES = [
  ['10000.0000', 10000],
  ['0', 0],
  ['0.0000', 0],
  ['5.00', 5],
  ['9007199254740991', 9007199254740991],
];
const INEXACT_CASES = [
  '12345.6789',
  '0.0001',
  '9007199254740993',
  '12345678901234567890',
  '1e3',
  '1.00000000000000001',
];

test('API-11: balance 원문 판정 — 정확한 정수만 Number, 소수·범위 초과·지수는 null/exact:false', async () => {
  for (const [raw, expected] of EXACT_CASES) {
    gateway.route('GET', detailPath('123'), rawJsonRoute(detailRaw({ balance: raw })));
    const detail = await fetchAccountDetail('123');
    assert.equal(detail.balance, expected, raw);
    assert.equal(detail.balanceExact, true, raw);
  }
  for (const raw of INEXACT_CASES) {
    gateway.route('GET', detailPath('123'), rawJsonRoute(detailRaw({ balance: raw })));
    const detail = await fetchAccountDetail('123');
    assert.equal(detail.balance, null, raw);
    assert.equal(detail.balanceExact, false, raw);
  }
});

test('API-11/12/13: 거래 amount 원문 판정 — 정확한 정수만 Number, 나머지는 null/exact:false', async () => {
  for (const [raw, expected] of EXACT_CASES) {
    gateway.route(
      'GET',
      detailPath('123'),
      rawJsonRoute(detailRaw({ transactions: [txRaw({ amount: raw })] }))
    );
    const [tx] = (await fetchAccountDetail('123')).transactionHistory;
    assert.equal(tx.amount, expected, raw);
    assert.equal(tx.amountExact, true, raw);
  }
  for (const raw of INEXACT_CASES) {
    gateway.route('GET', txPath('123', '789'), rawJsonRoute(txRaw({ amount: raw })));
    const tx = await fetchAccountTransaction('123', '789');
    assert.equal(tx.amount, null, raw);
    assert.equal(tx.amountExact, false, raw);

    gateway.route(
      'GET',
      txListPath('123'),
      rawJsonRoute(`{"transactions":[${txRaw({ amount: raw })}],"nextCursor":null,"hasNext":false}`)
    );
    const list = await fetchAccountTransactions('123');
    assert.equal(list.transactions[0].amount, null, raw);
    assert.equal(list.transactions[0].amountExact, false, raw);
  }
});

test('API-14: refresh 응답 balance도 원문으로 판정', async () => {
  gateway.route('POST', refreshPath('123'), rawJsonRoute(detailRaw({ balance: '12345.6789' })));
  const inexact = await refreshAccount('123');
  assert.equal(inexact.balance, null);
  assert.equal(inexact.balanceExact, false);

  gateway.route('POST', refreshPath('123'), rawJsonRoute(detailRaw({ balance: '95000.0000' })));
  const exact = await refreshAccount('123');
  assert.equal(exact.balance, 95000);
  assert.equal(exact.balanceExact, true);
});

test('API-11~14: JSON 문자열 금액("10000")과 음수 amount는 invalidResponse', async () => {
  gateway.route('GET', detailPath('123'), rawJsonRoute(detailRaw({ balance: '"10000"' })));
  assert.equal((await rejectionOf(fetchAccountDetail('123'))).invalidResponse, true);

  gateway.route(
    'GET',
    detailPath('123'),
    rawJsonRoute(detailRaw({ transactions: [txRaw({ amount: '"1000"' })] }))
  );
  assert.equal((await rejectionOf(fetchAccountDetail('123'))).invalidResponse, true);

  gateway.route('GET', txPath('123', '789'), rawJsonRoute(txRaw({ amount: '-1' })));
  assert.equal((await rejectionOf(fetchAccountTransaction('123', '789'))).invalidResponse, true);
  gateway.route('GET', txPath('123', '789'), rawJsonRoute(txRaw({ amount: '-1.5' })));
  assert.equal((await rejectionOf(fetchAccountTransaction('123', '789'))).invalidResponse, true);

  gateway.route('GET', txPath('123', '789'), rawJsonRoute(txRaw({ amount: 'null' })));
  assert.equal((await rejectionOf(fetchAccountTransaction('123', '789'))).invalidResponse, true);
  gateway.route('GET', detailPath('123'), rawJsonRoute(detailRaw({ balance: 'null' })));
  assert.equal((await rejectionOf(fetchAccountDetail('123'))).invalidResponse, true);
});

test('API-11~13: 큰 id와 금액 토큰이 한 응답에 공존해도 둘 다 보존하고 다른 키 문자열은 건드리지 않는다', async () => {
  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(
      `{"accountId":${BIG_ACCOUNT_ID},"bankCode":null,"bankName":"amount\\":1.5","accountNumber":"12345678901234","balance":12345.6789,"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[{"transactionId":${BIG_TX_ID},"publicTransactionId":"p","type":"WITHDRAW","amount":7000.0000,"merchantName":"balance\\":2.5","status":"SUCCESS","categoryCode":"CAFE","createdAt":"2026-10-11T03:00:00"}],"nextCursor":${BIG_CURSOR},"hasNext":true}`
    )
  );

  const detail = await fetchAccountDetail(BIG_ACCOUNT_ID);

  assert.equal(detail.accountId, BIG_ACCOUNT_ID);
  assert.equal(detail.balance, null);
  assert.equal(detail.balanceExact, false);
  assert.equal(detail.bankName, 'amount":1.5');
  const [tx] = detail.transactionHistory;
  assert.equal(tx.transactionId, BIG_TX_ID);
  assert.equal(tx.amount, 7000);
  assert.equal(tx.amountExact, true);
  assert.equal(tx.merchantName, 'balance":2.5');
  assert.equal(detail.nextCursor, BIG_CURSOR);
});

test('실제 서버 미호출: 모든 요청 목적지는 모의 Gateway(127.0.0.1)뿐', () => {
  assert.ok(everRequested.length > 0);
  assert.ok(everRequested.every(entry => entry.host === '127.0.0.1'));
});

// ── 최신 명세(20261014): 문자열 ID + 은행 정보 ──────────────────

const stringIdDetailRaw = ({ bankCode = '"001"', bankName = '"카카오뱅크"' } = {}) =>
  `{"accountId":"${BIG_ACCOUNT_ID}","bankCode":${bankCode},"bankName":${bankName},"accountNumber":"12345678901234","balance":500000,"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[{"transactionId":"${BIG_TX_ID}","publicTransactionId":"p","type":"DEPOSIT","amount":1,"status":"SUCCESS","categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}],"nextCursor":"${BIG_CURSOR}","hasNext":true}`;

test('API-11: 문자열 accountId·transactionId·nextCursor(19자리)와 bankCode·bankName을 그대로 받는다', async () => {
  gateway.route('GET', detailPath(BIG_ACCOUNT_ID), rawJsonRoute(stringIdDetailRaw()));

  const detail = await fetchAccountDetail(BIG_ACCOUNT_ID);

  assert.equal(detail.accountId, BIG_ACCOUNT_ID);
  assert.equal(detail.transactionHistory[0].transactionId, BIG_TX_ID);
  assert.equal(detail.nextCursor, BIG_CURSOR);
  assert.equal(detail.bankCode, '001');
  assert.equal(detail.bankName, '카카오뱅크');
  assert.equal(typeof detail.bankCode, 'string');
});

test('API-11: bankCode·bankName이 null이어도 정상이고, 문자열이 아니면 형식 오류', async () => {
  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(stringIdDetailRaw({ bankCode: 'null', bankName: 'null' }))
  );
  const detail = await fetchAccountDetail(BIG_ACCOUNT_ID);
  assert.equal(detail.bankCode, null);
  assert.equal(detail.bankName, null);

  gateway.route(
    'GET',
    detailPath(BIG_ACCOUNT_ID),
    rawJsonRoute(stringIdDetailRaw({ bankCode: '1' }))
  );
  assert.equal((await rejectionOf(fetchAccountDetail(BIG_ACCOUNT_ID))).invalidResponse, true);
});

test('API-14: 새로고침 응답도 문자열 ID와 bankCode·bankName을 API-11과 같은 모델로 받는다', async () => {
  gateway.route(
    'POST',
    refreshPath(BIG_ACCOUNT_ID),
    rawJsonRoute(stringIdDetailRaw({ bankCode: '"008"', bankName: '"토스뱅크"' }))
  );

  const detail = await refreshAccount(BIG_ACCOUNT_ID);

  const [request] = gateway.requestsTo(refreshPath(BIG_ACCOUNT_ID));
  assert.equal(request.method, 'POST');
  assert.equal(request.body, undefined, '본문 없는 POST');
  assert.equal(detail.accountId, BIG_ACCOUNT_ID);
  assert.equal(detail.bankCode, '008');
  assert.equal(detail.bankName, '토스뱅크');
  assert.equal(detail.nextCursor, BIG_CURSOR);
});

test('API-13: 문자열 nextCursor를 lastTransactionId 그대로 다음 요청에 보낸다(Number 변환 없음)', async () => {
  gateway.route(
    'GET',
    txListPath(BIG_ACCOUNT_ID),
    rawJsonRoute(
      `{"transactions":[{"transactionId":"${BIG_TX_ID}","publicTransactionId":"p","type":"DEPOSIT","amount":1,"status":"SUCCESS","categoryCode":"INCOME","createdAt":"2026-10-11T03:00:00"}],"nextCursor":"${BIG_CURSOR}","hasNext":true}`
    )
  );

  const page = await fetchAccountTransactions(BIG_ACCOUNT_ID);
  assert.equal(page.nextCursor, BIG_CURSOR);
  assert.equal(page.transactions[0].transactionId, BIG_TX_ID);

  await fetchAccountTransactions(BIG_ACCOUNT_ID, { lastTransactionId: page.nextCursor });
  const [, second] = gateway.requestsTo(txListPath(BIG_ACCOUNT_ID));
  assert.equal(second.query, `lastTransactionId=${BIG_CURSOR}`);
});

// ── 계좌번호(최신 서버 20261014): API-52 maskedAccountNumber, API-11/14 accountNumber, 502 ACCOUNT_NUMBER_UNAVAILABLE ──

test('API-52: 서버가 준 maskedAccountNumber를 그대로 전달하고(마스킹을 만들지 않음) 없으면 null', async () => {
  gateway.route(
    'GET',
    LIST_PATH,
    rawJsonRoute(
      listRaw(
        listItemRaw({ accountId: '"1"' }).replace(
          '"status"',
          '"maskedAccountNumber":"**********1234","status"'
        ),
        listItemRaw({ accountId: '"2"' })
      )
    )
  );
  const { accounts } = await fetchAccountList();
  assert.equal(accounts[0].maskedAccountNumber, '**********1234');
  assert.equal(accounts[1].maskedAccountNumber, null);
  // 목록에는 전체 계좌번호 필드가 없다.
  assert.equal('accountNumber' in accounts[0], false);
});

test('API-11: accountNumber는 14자리 숫자 문자열 원문(앞자리 0 보존)이고, null/키 없음은 null, 형식이 다르면 응답 오류', async () => {
  gateway.route(
    'GET',
    detailPath('123'),
    jsonRoute(detailFixture({ accountNumber: '00123456789012' }))
  );
  assert.equal((await fetchAccountDetail('123')).accountNumber, '00123456789012');

  const noKey = detailFixture();
  delete noKey.accountNumber;
  gateway.route('GET', detailPath('123'), jsonRoute(noKey));
  assert.equal((await fetchAccountDetail('123')).accountNumber, null);

  gateway.route('GET', detailPath('123'), jsonRoute(detailFixture({ accountNumber: null })));
  assert.equal((await fetchAccountDetail('123')).accountNumber, null);

  for (const bad of [
    12345678901234,
    '1234',
    '1234-5678-901234',
    '*******8901234',
    'ACCOUNT-123',
    '123456789012345',
  ]) {
    gateway.route('GET', detailPath('123'), jsonRoute(detailFixture({ accountNumber: bad })));
    const error = await rejectionOf(fetchAccountDetail('123'));
    assert.equal(error.invalidResponse, true, String(bad));
    assert.equal(error.invalidField, 'accountDetail.accountNumber');
  }
});

test('API-11/14: 구버전 displayAccountNumber·maskedAccountNumber 없이도 정상이며 모델에 만들어지지 않는다', async () => {
  gateway.route('GET', detailPath('123'), jsonRoute(detailFixture()));
  const detail = await fetchAccountDetail('123');
  assert.equal('displayAccountNumber' in detail, false);
  assert.equal('maskedAccountNumber' in detail, false);

  gateway.route(
    'POST',
    `${detailPath('123').replace('/detail', '/refresh')}`,
    jsonRoute(detailFixture())
  );
  const refreshed = await refreshAccount('123');
  assert.equal(refreshed.accountNumber, '12345678901234');
});

test('API-11/14: 502 ProblemDetail(title=ACCOUNT_NUMBER_UNAVAILABLE)는 상세 전체 실패로 분류되고 code가 보존된다', async () => {
  const problem = {
    type: 'about:blank',
    title: 'ACCOUNT_NUMBER_UNAVAILABLE',
    status: 502,
    detail: '계좌번호를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  };
  gateway.route('GET', detailPath('123'), jsonRoute(problem, { status: 502 }));
  const detailError = await rejectionOf(fetchAccountDetail('123'));
  assert.equal(detailError.status, 502);
  assert.equal(detailError.code, 'ACCOUNT_NUMBER_UNAVAILABLE');
  assert.equal(isAccountNumberUnavailableError(detailError), true);

  gateway.route(
    'POST',
    detailPath('123').replace('/detail', '/refresh'),
    jsonRoute(problem, { status: 502 })
  );
  const refreshError = await rejectionOf(refreshAccount('123'));
  assert.equal(isAccountNumberUnavailableError(refreshError), true);

  // 일반 502(제목이 코드 형태가 아님)·다른 상태 코드는 이 오류로 분류하지 않는다.
  gateway.route(
    'GET',
    detailPath('123'),
    jsonRoute({ title: 'Bad Gateway', status: 502 }, { status: 502 })
  );
  const generic = await rejectionOf(fetchAccountDetail('123'));
  assert.equal(generic.code, null);
  assert.equal(isAccountNumberUnavailableError(generic), false);

  gateway.route('GET', detailPath('123'), jsonRoute(problem, { status: 500 }));
  assert.equal(
    isAccountNumberUnavailableError(await rejectionOf(fetchAccountDetail('123'))),
    false
  );
});
