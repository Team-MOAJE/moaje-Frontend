// 가상 은행 목록·은행명 결정·계좌 라벨 단위 테스트 (순수 함수, 서버 호출 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/virtualBanks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { VIRTUAL_BANKS, DEFAULT_ACCOUNT_LABEL, getVirtualBankByCode, resolveAccountBank } =
  await import('../../src/features/asset/virtualBanks.js');
const { normalizeAccount, normalizeAccountList, normalizeAccountDetail } =
  await import('../../src/utils/apiMappers.js');
const { resolveAccountTitle, buildHomeAccountItems } =
  await import('../../src/features/asset/assetScreenLogic.js');

const EXPECTED = [
  ['001', '카카오뱅크'],
  ['002', 'KB국민은행'],
  ['003', '하나은행'],
  ['004', '우리은행'],
  ['005', 'NH농협은행'],
  ['006', '신한은행'],
  ['007', 'IBK기업은행'],
  ['008', '토스뱅크'],
  ['009', '케이뱅크'],
  ['010', 'SC제일은행'],
];

const account = (overrides = {}) => ({
  accountId: '1',
  bankCode: null,
  bankName: null,
  balance: 1000,
  balanceExact: true,
  status: 'ACTIVE',
  ...overrides,
});

test('가상 은행: 10개, 코드는 앞자리 0을 보존한 문자열, 이름은 확정 목록과 같다', () => {
  assert.deepEqual(
    VIRTUAL_BANKS.map(bank => [bank.bankCode, bank.bankName]),
    EXPECTED
  );
  assert.ok(VIRTUAL_BANKS.every(bank => typeof bank.bankCode === 'string'));
  assert.equal(new Set(VIRTUAL_BANKS.map(bank => bank.bankCode)).size, 10);
  assert.ok(Object.isFrozen(VIRTUAL_BANKS), '목록은 변경할 수 없다');
});

test('getVirtualBankByCode: 문자열 코드만 매핑하고 없는 코드·숫자·null은 null', () => {
  for (const [bankCode, bankName] of EXPECTED) {
    assert.equal(getVirtualBankByCode(bankCode).bankName, bankName);
  }
  for (const bad of ['011', '000', '1', '', 1, 8, null, undefined, {}]) {
    assert.equal(getVirtualBankByCode(bad), null, String(bad));
  }
});

test('resolveAccountBank: 서버 bankName 우선 → bankName 없고 코드가 목록에 있으면 시연용 이름 → 둘 다 없으면 null', () => {
  assert.deepEqual(resolveAccountBank({ bankCode: '088', bankName: '서버은행' }), {
    name: '서버은행',
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank({ bankCode: '001', bankName: '카카오뱅크' }), {
    name: '카카오뱅크',
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank({ bankCode: '008', bankName: null }), {
    name: '토스뱅크',
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank({ bankCode: '008', bankName: '  ' }), {
    name: '토스뱅크',
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank({ bankCode: null, bankName: null }), {
    name: null,
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank({ bankCode: '999', bankName: null }), {
    name: null,
    conflict: false,
  });
  assert.deepEqual(resolveAccountBank(undefined), { name: null, conflict: false });
});

test('resolveAccountBank: 서버 bankName과 코드의 시연용 이름이 충돌하면 서버 값을 바꾸지 않고 conflict만 알린다', () => {
  assert.deepEqual(resolveAccountBank({ bankCode: '001', bankName: '토스뱅크' }), {
    name: '토스뱅크',
    conflict: true,
  });
});

test('normalizeAccount: 서버 은행 정보를 사용하고, 계좌 ID로 은행을 추측하지 않는다', () => {
  const kakao = normalizeAccount(
    account({ accountId: '1', bankCode: '001', bankName: '카카오뱅크' })
  );
  assert.equal(kakao.bankCode, '001');
  assert.equal(kakao.bankName, '카카오뱅크');

  // bankName이 null이고 코드가 목록에 있으면 시연용 이름
  assert.equal(normalizeAccount(account({ bankCode: '010' })).bankName, 'SC제일은행');
  // 정보가 없으면 null (accountId가 무엇이든 동일)
  for (const accountId of ['1', '123456789012345679', '9223372036854775807']) {
    const noBank = normalizeAccount(account({ accountId }));
    assert.equal(noBank.bankName, null);
    assert.equal(noBank.bankCode, null);
  }
  // API-52에서 제거된 필드는 만들지 않는다.
  const plain = normalizeAccount(account());
  assert.equal(plain.syncStatus, null);
  assert.equal(plain.lastSyncedAt, null);
  assert.equal(plain.createdAt, null);
});

test('normalizeAccountList: 은행명이 라벨, 같은 은행이 여러 개면 번호, 정보 없는 계좌는 기존 "내 계좌"', () => {
  assert.deepEqual(
    normalizeAccountList([
      account({ accountId: '1', bankCode: '001', bankName: '카카오뱅크' }),
    ]).map(a => a.label),
    ['카카오뱅크']
  );
  assert.deepEqual(
    normalizeAccountList([account()]).map(a => a.label),
    [DEFAULT_ACCOUNT_LABEL]
  );

  const mixed = normalizeAccountList([
    account({ accountId: '1', bankCode: '001', bankName: '카카오뱅크' }),
    account({ accountId: '2', bankCode: '008', bankName: '토스뱅크' }),
    account({ accountId: '3', bankCode: '001', bankName: '카카오뱅크' }),
    account({ accountId: '4' }),
  ]);
  assert.deepEqual(
    mixed.map(a => [a.id, a.label]),
    [
      ['1', '카카오뱅크 1'],
      ['2', '토스뱅크'],
      ['3', '카카오뱅크 2'],
      ['4', '내 계좌 4'],
    ]
  );

  // 여러 은행 계좌: 각자 자기 서버 은행 정보만 사용한다(다른 계좌 은행명이 섞이지 않는다).
  const names = normalizeAccountList(
    EXPECTED.map(([bankCode], index) => account({ accountId: String(index + 1), bankCode }))
  ).map(a => a.bankName);
  assert.deepEqual(
    names,
    EXPECTED.map(([, bankName]) => bankName)
  );
});

test('normalizeAccountList: 서버 은행명과 코드가 충돌하는 계좌는 서버 값을 쓰고 bankInfoConflict로 표시', () => {
  const [item] = normalizeAccountList([
    account({ accountId: '1', bankCode: '001', bankName: '토스뱅크' }),
  ]);
  assert.equal(item.bankName, '토스뱅크');
  assert.equal(item.bankInfoConflict, true);
});

test('normalizeAccountDetail: 표시용 bankName은 서버 값 → 코드 매핑 → null 순서', () => {
  const base = { accountId: '1', balance: 1, balanceExact: true, transactionHistory: [] };
  assert.equal(
    normalizeAccountDetail({ ...base, bankCode: '088', bankName: '서버은행' }).bankName,
    '서버은행'
  );
  assert.equal(
    normalizeAccountDetail({ ...base, bankCode: '003', bankName: null }).bankName,
    '하나은행'
  );
  assert.equal(normalizeAccountDetail({ ...base, bankCode: null, bankName: null }).bankName, null);
  assert.equal(normalizeAccountDetail({ ...base, bankCode: '003' }).bankCode, '003');
});

test('홈 계좌 목록: 행 라벨이 서버 은행명 기반 계좌 라벨이다(여러 은행 + 은행 정보 없는 기존 계좌)', () => {
  const items = buildHomeAccountItems(
    normalizeAccountList([
      account({ accountId: '1', bankCode: '001', bankName: '카카오뱅크' }),
      account({ accountId: '2', bankCode: '008', bankName: '토스뱅크' }),
      account({ accountId: '3' }),
    ])
  );
  assert.deepEqual(
    items.map(item => [item.id, item.label]),
    [
      ['1', '카카오뱅크'],
      ['2', '토스뱅크'],
      ['3', '내 계좌 3'],
    ]
  );
});

test('계좌 상세 제목: 목록 라벨 우선, 목록에 은행 정보가 없을 때만 같은 계좌 상세의 은행명을 쓴다', () => {
  const [withBank, noBank] = normalizeAccountList([
    account({ accountId: '1', bankCode: '001', bankName: '카카오뱅크' }),
    account({ accountId: '2' }),
  ]);
  const detailWithBank = normalizeAccountDetail({
    accountId: '2',
    bankCode: '003',
    bankName: null,
  });
  const detailWithoutBank = normalizeAccountDetail({
    accountId: '2',
    bankCode: null,
    bankName: null,
  });

  assert.equal(resolveAccountTitle(withBank, detailWithBank), '카카오뱅크');
  assert.equal(resolveAccountTitle(noBank, detailWithBank), '하나은행');
  assert.equal(resolveAccountTitle(noBank, detailWithoutBank), '내 계좌 2');
  assert.equal(resolveAccountTitle(noBank, null), '내 계좌 2');
  assert.equal(resolveAccountTitle(null, detailWithBank), null);
});
