// API-09 계좌 개설 입력 구성(순수 함수, React·Redux 비의존).
// 기준: 백엔드 moaje-banking AccountController / mock banking 읽기 확인.
//
// 이 앱은 실제 금융 서비스가 아닌 시연용이다. 서버는 ci를 임의의 비어 있지 않은 문자열로만 취급하며(실제 인증기관 값 불필요),
// 소유자는 JWT(X-Authenticated-User-Id)로 정해진다. 같은 (ci, bankCode, productName)이면 서버가 기존 계좌를 돌려주고
// initialBalance는 적용하지 않으며 신규/기존 여부를 응답으로 구분할 수 없다.
//
// ci 규칙: "MOAJE-DEMO-" + 로그인 사용자 id. 사용자별로 항상 같고, 사용자 사이에서는 서로 다르며, 개설할 때마다 새로 만들지 않는다.
// 이 값은 시연용 Mock 식별값이며 실제 본인인증 CI가 아니다. 사용자 이름·전화번호는 Auth에 저장된 값만 쓰고 만들어 내지 않는다.
import { isValidOnboardingUserId } from '../onboarding/onboardingApi';
import { isNonEmptyString, isNonNegativeSafeInteger } from './assetResponse';

export const DEMO_CI_PREFIX = 'MOAJE-DEMO-';
// 서버에 허용 목록이 없고, 문서·e2e 관례 값 "001"을 쓴다. 은행 이름은 서버에 없으므로 만들지 않는다.
export const DEMO_BANK_CODE = '001';
export const DEMO_PRODUCT_NAME = 'MOAJE 입출금';
export const MAX_DEMO_INITIAL_BALANCE = 100000000; // 입력 실수 방지용 상한(서버 제한 아님)

export const OPEN_ACCOUNT_BLOCK_REASON = Object.freeze({
  USER_ID: 'USER_ID', // 로그인 사용자 id 없음/형식 오류
  USER_NAME: 'USER_NAME', // 저장된 이름 없음
  PHONE_NUMBER: 'PHONE_NUMBER', // 저장된 전화번호 없음
  INITIAL_BALANCE: 'INITIAL_BALANCE', // 초기 잔액 입력 오류
});

// 사용자 id가 숫자 문자열이 아니면 null(Number 변환·임의 id 사용 금지).
export const buildDemoCi = userId =>
  isValidOnboardingUserId(userId) ? `${DEMO_CI_PREFIX}${userId}` : null;

// 입력: { user: auth.user, initialBalance }. 반환: { ok: true, input } | { ok: false, reason }.
export const buildOpenAccountInput = ({ user, initialBalance } = {}) => {
  const ci = buildDemoCi(user?.userId);
  if (ci === null) return { ok: false, reason: OPEN_ACCOUNT_BLOCK_REASON.USER_ID };
  if (!isNonEmptyString(user?.name))
    return { ok: false, reason: OPEN_ACCOUNT_BLOCK_REASON.USER_NAME };
  if (!isNonEmptyString(user?.phoneNumber)) {
    return { ok: false, reason: OPEN_ACCOUNT_BLOCK_REASON.PHONE_NUMBER };
  }
  if (!isNonNegativeSafeInteger(initialBalance) || initialBalance > MAX_DEMO_INITIAL_BALANCE) {
    return { ok: false, reason: OPEN_ACCOUNT_BLOCK_REASON.INITIAL_BALANCE };
  }
  return {
    ok: true,
    input: {
      ci,
      userName: user.name,
      phoneNumber: user.phoneNumber,
      bankCode: DEMO_BANK_CODE,
      productName: DEMO_PRODUCT_NAME,
      initialBalance,
    },
  };
};

export const OPEN_ACCOUNT_BLOCK_MESSAGE = Object.freeze({
  [OPEN_ACCOUNT_BLOCK_REASON.USER_ID]: '로그인 정보를 확인할 수 없어 계좌를 만들 수 없어요.',
  [OPEN_ACCOUNT_BLOCK_REASON.USER_NAME]: '저장된 이름 정보가 없어 계좌를 만들 수 없어요.',
  [OPEN_ACCOUNT_BLOCK_REASON.PHONE_NUMBER]: '저장된 전화번호 정보가 없어 계좌를 만들 수 없어요.',
  [OPEN_ACCOUNT_BLOCK_REASON.INITIAL_BALANCE]: '초기 잔액을 확인해 주세요.',
});

// 서버가 기존 계좌를 돌려줘도 응답으로 구분할 수 없으므로 문구는 중립적으로 유지한다.
export const OPEN_ACCOUNT_SUCCESS_MESSAGE =
  '계좌 개설 요청이 처리됐어요. 계좌 정보가 목록에 반영되는 데 시간이 걸릴 수 있어요. 이미 같은 계좌가 있으면 기존 계좌가 사용되고 입력한 초기 잔액은 적용되지 않아요.';
