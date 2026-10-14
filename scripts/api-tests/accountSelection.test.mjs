// 계좌 선택(계좌 상세 route param 소비 / 송금 출금 계좌 선택) 테스트 — 모의 Gateway, 실제 서버·Android 호출 없음.
// React 렌더러가 없어 화면 effect는 같은 규칙을 따르는 순수 함수 + Redux 스토어 + 소스 정적 분석으로 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/accountSelection.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configureStore } from '@reduxjs/toolkit';
import { BIG_ACCOUNT_ID, gateway, jsonRoute, rawJsonRoute } from './assetTestEnv.mjs';

const { default: assetReducer, setSelectedAccountId } =
  await import('../../src/features/asset/assetSlice.js');
const { fetchAccounts, fetchAccountDetail, transferFunds } =
  await import('../../src/features/asset/assetApi.js');
const { default: authReducer, logout } = await import('../../src/features/auth/authSlice.js');
const logic = await import('../../src/features/asset/assetScreenLogic.js');
const { hasPendingRouteSeed, resolveTransferFromId, transferFromParamKey, canTransferFrom } = logic;
const { API_ENDPOINTS } = await import('../../src/constants/apiEndpoints.js');

const LIST_PATH = '/api/v1/assets/accounts';
const detailPath = id => `/api/v1/assets/accounts/${id}/detail`;
const TRANSFER_PATH = API_ENDPOINTS.BANKING.TRANSFERS;
const LATE = 120;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const KAKAO = '101';
const WOORI = '202';
const BIG_B = '9123456789012345678'; // 19자리(Long 범위) — Number로 바꾸면 값이 바뀐다.
const BEYOND_LONG = '9234567890123456789012'; // 22자리 — 순수 로직은 문자열을 그대로 보존한다.

const makeStore = () => configureStore({ reducer: { auth: authReducer, asset: assetReducer } });
const asset = store => store.getState().asset;

const acctRaw = ({ id, bankName, status = 'ACTIVE', balance = '10000.0000' }) =>
  `{"accountId":"${id}","bankCode":"X","bankName":${JSON.stringify(bankName)},"balance":${balance},"status":"${status}"}`;
const detailRaw = ({ id, bankName, balance }) =>
  `{"accountId":"${id}","bankCode":"X","bankName":"${bankName}","accountNumber":"12345678901234","balance":${balance},"syncStatus":"SYNCED","refreshing":false,"refreshFailed":false,"message":null,"lastSyncedAt":null,"transactionHistory":[],"nextCursor":null,"hasNext":false}`;

const loadAccounts = async (store, items) => {
  gateway.route('GET', LIST_PATH, rawJsonRoute(`[${items.join(',')}]`));
  await store.dispatch(fetchAccounts());
};
const twoBanks = () => [
  acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '50000.0000' }),
  acctRaw({ id: WOORI, bankName: '우리은행', balance: '70000.0000' }),
];

// ── 계좌 상세 화면의 route param 소비 모델 ──────────────────────
// AccountDetailScreen의 effect와 같은 규칙: 적용 대기이면 선택 후 param을 소비(undefined)한다.
// 반환값은 소비 후의 route param. API-11 조회는 대기가 없을 때 selectedAccountId 기준으로만 한다.
const applyRouteSeed = (store, routeAccountId) => {
  const { accounts } = asset(store);
  if (!hasPendingRouteSeed(routeAccountId, accounts)) return routeAccountId;
  store.dispatch(setSelectedAccountId(routeAccountId));
  return undefined;
};
const loadDetailForSelection = async store => {
  const { selectedAccountId } = asset(store);
  await store.dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
};

test('상세: 최초 진입 시 route accountId가 적용되고 param이 소비된다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  assert.equal(asset(store).selectedAccountId, KAKAO, '기본 선택은 첫 ACTIVE');
  const param = applyRouteSeed(store, WOORI);
  assert.equal(asset(store).selectedAccountId, WOORI);
  assert.equal(param, undefined, '적용한 param은 소비된다');
  assert.equal(hasPendingRouteSeed(param, asset(store).accounts), false);
});

test('상세: 사용자가 다른 계좌를 고르면 소비된 route param이 선택을 되돌리지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  let param = applyRouteSeed(store, KAKAO);
  store.dispatch(setSelectedAccountId(WOORI)); // 시트에서 우리은행 선택
  param = applyRouteSeed(store, param); // 이후 렌더에서도 route는 비어 있다
  assert.equal(asset(store).selectedAccountId, WOORI);
  assert.equal(param, undefined);
});

test('상세: 카카오 진입 → 우리 선택 → 우리 상세 → 홈 복귀 → 카카오 재진입 → 카카오 상세', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route(
    'GET',
    detailPath(KAKAO),
    rawJsonRoute(detailRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '50000' }))
  );
  gateway.route(
    'GET',
    detailPath(WOORI),
    rawJsonRoute(detailRaw({ id: WOORI, bankName: '우리은행', balance: '70000' }))
  );

  // 1) 카카오 진입
  let param = applyRouteSeed(store, KAKAO);
  await loadDetailForSelection(store);
  assert.equal(asset(store).accountDetail.bankName, '카카오뱅크');

  // 2) 우리은행 선택 → 3) 우리은행 상세(은행명·잔액 새 계좌 기준)
  store.dispatch(setSelectedAccountId(WOORI));
  assert.equal(asset(store).accountDetail, null, '전환 직후 이전 계좌 상세는 비워진다');
  param = applyRouteSeed(store, param);
  await loadDetailForSelection(store);
  assert.equal(asset(store).selectedAccountId, WOORI);
  assert.equal(asset(store).accountDetailAccountId, WOORI);
  assert.equal(asset(store).accountDetail.bankName, '우리은행');
  assert.equal(asset(store).accountDetail.balance, 70000);

  // 4) 홈 복귀(native-stack v7의 navigate는 새 화면을 push하므로 기존 Detail은 스택에 남는다) →
  // 5) 홈에서 카카오 상세로 새 인스턴스 진입: 새 route param이 적용된다.
  const newInstanceParam = applyRouteSeed(store, KAKAO);
  await loadDetailForSelection(store);
  // 6) 카카오 상세 표시
  assert.equal(newInstanceParam, undefined);
  assert.equal(asset(store).selectedAccountId, KAKAO);
  assert.equal(asset(store).accountDetailAccountId, KAKAO);
  assert.equal(asset(store).accountDetail.bankName, '카카오뱅크');
  assert.equal(asset(store).accountDetail.balance, 50000);

  // 스택에 남은 이전 Detail 인스턴스는 이미 param을 소비했으므로 선택을 되돌리지 못한다.
  const staleInstanceParam = applyRouteSeed(store, param);
  assert.equal(staleInstanceParam, undefined);
  assert.equal(asset(store).selectedAccountId, KAKAO);
});

test('상세: 같은 accountId로 재진입(소비 후 undefined → 같은 id)하면 다시 적용된다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  let param = applyRouteSeed(store, KAKAO);
  store.dispatch(setSelectedAccountId(WOORI));
  assert.equal(asset(store).selectedAccountId, WOORI);
  // 화면이 마운트된 채 navigate(ACCOUNT_DETAIL, { accountId: KAKAO })가 다시 호출되면 params가 id로 바뀐다.
  param = KAKAO;
  assert.equal(hasPendingRouteSeed(param, asset(store).accounts), true);
  param = applyRouteSeed(store, param);
  assert.equal(asset(store).selectedAccountId, KAKAO);
  assert.equal(param, undefined);
  // 이미 선택된 계좌와 같은 id가 다시 전달되어도 대기 → 소비 → 재조회 흐름이 진행된다.
  param = KAKAO;
  assert.equal(hasPendingRouteSeed(param, asset(store).accounts), true);
  assert.equal(applyRouteSeed(store, param), undefined);
  assert.equal(asset(store).selectedAccountId, KAKAO);
});

test('상세: 목록에 없거나 문자열이 아닌 route accountId는 적용하지 않는다(Number 변환 없음)', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  for (const bad of [undefined, null, 101, '999', '', {}, ['101']]) {
    assert.equal(hasPendingRouteSeed(bad, asset(store).accounts), false, String(bad));
  }
  assert.equal(hasPendingRouteSeed(KAKAO, []), false);
  assert.equal(hasPendingRouteSeed(KAKAO, undefined), false);
  applyRouteSeed(store, '999');
  assert.equal(asset(store).selectedAccountId, KAKAO);
});

test('상세: 이전 계좌의 늦은 API-11 응답이 새 계좌 상태를 덮어쓰지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route(
    'GET',
    detailPath(KAKAO),
    rawJsonRoute(detailRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '1' }), { delay: LATE })
  );
  gateway.route(
    'GET',
    detailPath(WOORI),
    rawJsonRoute(detailRaw({ id: WOORI, bankName: '우리은행', balance: '70000' }))
  );

  const late = store.dispatch(fetchAccountDetail({ accountId: KAKAO }));
  store.dispatch(setSelectedAccountId(WOORI));
  await store.dispatch(fetchAccountDetail({ accountId: WOORI }));
  await late;
  await sleep(LATE);

  assert.equal(asset(store).selectedAccountId, WOORI);
  assert.equal(asset(store).accountDetailAccountId, WOORI);
  assert.equal(asset(store).accountDetail.bankName, '우리은행');
  assert.equal(asset(store).accountDetail.balance, 70000);
  assert.equal(gateway.requestsTo(detailPath(WOORI)).length, 1, '새 계좌는 API-11로 조회한다');

  // 늦은 실패 응답도 새 계좌 상태에 오류를 남기지 않는다.
  gateway.route(
    'GET',
    detailPath(KAKAO),
    rawJsonRoute('{"error":true}', { status: 500, delay: LATE })
  );
  const lateFail = store.dispatch(fetchAccountDetail({ accountId: KAKAO }));
  store.dispatch(setSelectedAccountId(KAKAO));
  store.dispatch(setSelectedAccountId(WOORI));
  await lateFail;
  assert.equal(asset(store).accountDetailError, null);
});

test('상세 소스: param 소비 방식 하나만 쓰고 appliedRouteId가 없으며 조회는 선택 계좌 기준이다', () => {
  const detail = source('src/screens/asset/AccountDetailScreen.js');
  assert.match(detail, /navigation\.setParams\(\{ accountId: undefined \}\)/);
  assert.match(detail, /hasPendingRouteSeed\(routeAccountId, accounts\)/);
  assert.doesNotMatch(detail, /appliedRouteId|setAppliedRouteId/);
  assert.match(detail, /fetchAccountDetail\(\{ accountId: selectedAccountId \}\)/);
  assert.match(detail, /accountDetailAccountId === selectedAccountId/);
  assert.doesNotMatch(detail, /(?<![A-Za-z])Number\(|parseInt\(|parseFloat\(/);
});

// ── 송금 출금 계좌 선택 ─────────────────────────────────────────
const noPick = null;
const pick = (id, generation = 0, hasParam = false, param = null) => ({
  generation,
  id,
  paramKey: transferFromParamKey(hasParam, param),
});
const resolve = overrides =>
  resolveTransferFromId({
    hasFromParam: false,
    fromParam: null,
    pinnedId: KAKAO,
    userPick: noPick,
    sessionGeneration: 0,
    ...overrides,
  });

test('송금: 우선순위는 사용자 선택 > fromAccountId param > 기본(pinned)', () => {
  assert.equal(resolve({}).requestedFromId, KAKAO);
  assert.equal(resolve({ hasFromParam: true, fromParam: WOORI }).requestedFromId, WOORI);
  assert.equal(
    resolve({ userPick: pick(KAKAO, 0, true, WOORI), hasFromParam: true, fromParam: WOORI })
      .requestedFromId,
    KAKAO,
    '최초 진입 param이 이후 사용자 선택을 덮어쓰지 않는다'
  );
  assert.equal(resolve({ userPick: pick(WOORI) }).requestedFromId, WOORI);
});

test('송금: 새 route param이 오면 이전 사용자 선택은 무효이고 새 param이 적용된다', () => {
  const picked = pick(KAKAO, 0, true, WOORI);
  assert.equal(
    resolve({ userPick: picked, hasFromParam: true, fromParam: BIG_ACCOUNT_ID }).requestedFromId,
    BIG_ACCOUNT_ID
  );
  // param이 사라지는 경우(기본 진입)도 이전 선택을 끌고 오지 않는다.
  assert.equal(resolve({ userPick: picked }).requestedFromId, KAKAO);
});

test('송금: 재진입(새 화면 인스턴스 = userPick 없음)이면 출금 계좌가 param/기본으로 초기화된다', () => {
  const firstVisit = resolve({ userPick: pick(WOORI), pinnedId: KAKAO });
  assert.equal(firstVisit.requestedFromId, WOORI);
  const reentered = resolve({ userPick: noPick, pinnedId: KAKAO });
  assert.equal(reentered.requestedFromId, KAKAO);
  assert.equal(
    resolve({ userPick: noPick, hasFromParam: true, fromParam: WOORI }).requestedFromId,
    WOORI
  );
});

test('송금: 사용자(세션) 전환 시 이전 사용자의 선택·기본 계좌는 쓰이지 않는다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  const generationA = asset(store).sessionGeneration;
  const pickA = pick(WOORI, generationA);
  assert.equal(resolve({ userPick: pickA, sessionGeneration: generationA }).requestedFromId, WOORI);
  store.dispatch(logout());
  const generationB = asset(store).sessionGeneration;
  assert.notEqual(generationB, generationA);
  assert.deepEqual(asset(store).accounts, []);
  assert.equal(asset(store).selectedAccountId, null);
  assert.equal(
    resolve({ userPick: pickA, sessionGeneration: generationB, pinnedId: null }).requestedFromId,
    null
  );
});

test('송금: 19자리 이상 계좌 ID는 문자열 그대로 보존된다', async () => {
  assert.equal(resolve({ userPick: pick(BIG_B) }).requestedFromId, BIG_B);
  assert.equal(resolve({ hasFromParam: true, fromParam: BIG_B }).requestedFromId, BIG_B);
  assert.equal(resolve({ userPick: pick(BEYOND_LONG) }).requestedFromId, BEYOND_LONG);
  assert.equal(
    resolve({ hasFromParam: true, fromParam: BEYOND_LONG }).requestedFromId,
    BEYOND_LONG
  );
  assert.notEqual(String(Number(BIG_B)), BIG_B, '전제: Number로 바꾸면 값이 변한다');
  // 숫자 id는 선택으로 인정하지 않는다.
  assert.equal(
    resolve({ userPick: { generation: 0, id: 101, paramKey: 'none' } }).requestedFromId,
    KAKAO
  );
  assert.equal(
    resolve({ hasFromParam: true, fromParam: 101 }).fromParamValid,
    false,
    '문자열이 아닌 param은 형식 오류'
  );
});

test('송금: 송금 가능한 ACTIVE 계좌만 선택 가능하다', () => {
  assert.equal(canTransferFrom({ status: 'ACTIVE' }), true);
  for (const status of ['SUSPENDED', 'CLOSED', undefined]) {
    assert.equal(canTransferFrom({ status }), false, String(status));
  }
});

test('송금: 선택한 계좌 ID가 API-10 withdrawalAccountId 문자열로 전달된다(은행·잔액은 선택 계좌 기준)', async () => {
  const store = makeStore();
  await loadAccounts(store, [
    acctRaw({ id: KAKAO, bankName: '카카오뱅크', balance: '50000.0000' }),
    acctRaw({ id: BIG_B, bankName: '우리은행', balance: '70000.0000' }),
  ]);
  const picked = resolve({ userPick: pick(BIG_B) }).requestedFromId;
  const selected = asset(store).accounts.find(account => account.id === picked);
  assert.equal(selected.bankName, '우리은행');
  assert.equal(selected.balance, 70000);

  gateway.route(
    'POST',
    TRANSFER_PATH,
    jsonRoute({
      transferId: 456,
      publicTransferId: 'MOAJE-BNK-456',
      status: 'COMPLETED',
      message: 'm',
      externalTransactionId: null,
    })
  );
  await store.dispatch(
    transferFunds({
      withdrawalAccountId: selected.id,
      depositBankCode: '001',
      depositAccountNumber: '110123456789',
      amount: 1000,
      idempotencyKey: 'key-1',
    })
  );
  const [request] = gateway.requestsTo(TRANSFER_PATH);
  assert.equal(request.headers['idempotency-key'], 'key-1');
  assert.equal(request.body.withdrawalAccountId, BIG_B);
  assert.equal(typeof request.body.withdrawalAccountId, 'string');
});

test('송금: 미확정 송금은 계좌 목록/선택 변화로 해제되지 않고 같은 요청·키를 유지한다', async () => {
  const store = makeStore();
  await loadAccounts(store, twoBanks());
  gateway.route(
    'POST',
    TRANSFER_PATH,
    jsonRoute({
      transferId: 456,
      publicTransferId: 'MOAJE-BNK-456',
      status: 'PROCESSING',
      message: 'm',
      externalTransactionId: null,
    })
  );
  const input = {
    withdrawalAccountId: KAKAO,
    depositBankCode: '001',
    depositAccountNumber: '110123456789',
    amount: 1000,
    idempotencyKey: 'key-pending',
  };
  await store.dispatch(transferFunds(input));
  const before = JSON.stringify(asset(store).pendingTransfer);
  assert.ok(asset(store).pendingTransfer, '처리 중 송금은 미확정으로 보관된다');
  assert.equal(asset(store).pendingTransfer.request.withdrawalAccountId, KAKAO);
  assert.equal(asset(store).pendingTransfer.idempotencyKey, 'key-pending');

  store.dispatch(setSelectedAccountId(WOORI));
  await store.dispatch(fetchAccounts());
  assert.equal(JSON.stringify(asset(store).pendingTransfer), before);
});

test('송금 소스: 선택 핸들러는 진행 중/미확정이면 즉시 막고 미전송 키만 갱신하며 API-10 계약은 그대로다', () => {
  const transfer = source('src/screens/asset/TransferScreen.js');
  const press = between(transfer, 'const handleFromAccountPress', 'const handleFromAccountSelect');
  assert.match(press, /^\s*\{?\s*if \(hasPending \|\| transferLoading\) return;/);
  const select = between(transfer, 'const handleFromAccountSelect', 'const handleBankPress');
  assert.match(select, /^\s*\{?\s*if \(hasPending \|\| transferLoading\) return;/);
  assert.match(select, /canTransferFrom\(accounts\.find\(account => account\.id === id\)\)/);
  assert.match(select, /clearPendingTransferKey\(\);/);
  assert.doesNotMatch(select, /pendingTransfer|pendingIdempotencyKeyRef|dispatch\(/);
  // 선택 UI는 기존 시트를 재사용하고 ACTIVE만 선택 가능하게 한다.
  assert.match(transfer, /<AccountSelectorBottomSheet[\s\S]*?isSelectable=\{canTransferFrom\}/);
  assert.match(transfer, /disabled=\{hasPending \|\| transferLoading\}/);
  // 요청 계약: 선택된 계좌의 id 문자열을 그대로 보낸다.
  assert.match(transfer, /withdrawalAccountId: selectedAccount\.id,/);
  assert.doesNotMatch(
    transfer,
    /(?<![A-Za-z])Number\(|parseInt\(\s*(selectedAccount|userPick|fromParam)/
  );
  // 받는 계좌번호 입력·은행 선택은 이번 작업 범위 밖이라 그대로다.
  assert.match(transfer, /입금 계좌번호 \(숫자만\)/);
  assert.match(transfer, /BankSelectModal/);
  // 시트는 송금 가능 여부를 스스로 판단하지 않는다.
  assert.doesNotMatch(
    source('src/components/asset/AccountSelectorBottomSheet.js'),
    /canTransferFrom/
  );
});

function source(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
function between(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  const end = text.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} ~ ${endToken}`);
  return text.slice(start + startToken.length, end).replace(/^[^\n]*=> \{?/, '');
}
