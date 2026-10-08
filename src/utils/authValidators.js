// 회원가입/로그인/PIN 재설정 화면이 함께 쓰는 입력 검사.
// 전화번호 형식 검사는 번호의 실존 여부나 사용자 소유 여부를 보장하지 않는다.
const PHONE_NUMBER_REGEX = /^010[0-9]{8}$/;
const PHONE_NUMBER_MAX_LENGTH = 11;

export const PHONE_NUMBER_ERROR_MESSAGE = '올바른 휴대전화번호를 입력해 주세요.';

export const validatePhoneNumber = value => PHONE_NUMBER_REGEX.test(value);

// 숫자 이외 문자(붙여넣기 포함)를 제거하고 11자리까지만 남긴다.
export const sanitizePhoneNumber = text =>
  text.replace(/[^0-9]/g, '').slice(0, PHONE_NUMBER_MAX_LENGTH);

export { PHONE_NUMBER_MAX_LENGTH };

export const validateName = value => /^[가-힣]+$/.test(value);
export const sanitizeName = text => text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
