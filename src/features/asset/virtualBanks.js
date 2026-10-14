// MOAJE 시연용 가상 은행 목록(계좌 개설·송금 공용). 실제 금융기관 코드가 아니다.
// 코드는 앞자리 0을 보존하는 문자열이다. 은행명을 다른 파일에 중복 정의하지 않는다.
export const VIRTUAL_BANKS = Object.freeze([
  Object.freeze({ bankCode: '001', bankName: '카카오뱅크' }),
  Object.freeze({ bankCode: '002', bankName: 'KB국민은행' }),
  Object.freeze({ bankCode: '003', bankName: '하나은행' }),
  Object.freeze({ bankCode: '004', bankName: '우리은행' }),
  Object.freeze({ bankCode: '005', bankName: 'NH농협은행' }),
  Object.freeze({ bankCode: '006', bankName: '신한은행' }),
  Object.freeze({ bankCode: '007', bankName: 'IBK기업은행' }),
  Object.freeze({ bankCode: '008', bankName: '토스뱅크' }),
  Object.freeze({ bankCode: '009', bankName: '케이뱅크' }),
  Object.freeze({ bankCode: '010', bankName: 'SC제일은행' }),
]);

export const DEFAULT_ACCOUNT_LABEL = '내 계좌';

// 목록에 없는 코드는 null(코드로 은행명을 추측하지 않는다).
export const getVirtualBankByCode = bankCode =>
  typeof bankCode === 'string'
    ? (VIRTUAL_BANKS.find(bank => bank.bankCode === bankCode) ?? null)
    : null;

const isFilled = value => typeof value === 'string' && value.trim() !== '';

// 서버 계좌의 은행명 결정(계좌 ID·최근 선택 은행으로 추측하지 않는다).
// 1) 서버 bankName 우선 2) bankName이 없고 bankCode가 목록에 있으면 시연용 이름 3) 둘 다 없으면 null
// bankName과 목록 이름이 다르면(코드 충돌) 서버 값을 바꾸지 않고 conflict=true로 알린다.
export const resolveAccountBank = ({ bankCode, bankName } = {}) => {
  const listed = getVirtualBankByCode(bankCode);
  if (isFilled(bankName)) {
    const name = bankName.trim();
    return { name, conflict: listed !== null && listed.bankName !== name };
  }
  if (listed !== null) return { name: listed.bankName, conflict: false };
  return { name: null, conflict: false };
};

export const resolveAccountBankName = account => resolveAccountBank(account).name;
