// 회원가입 SMS 인증 증빙을 아주 잠깐 보관하는 모듈 스코프 변수.
// 화면 unmount로 자동 소멸하지 않고 앱 프로세스 생존 동안 유지될 수 있으므로,
// (purpose, phoneNumber)가 정확히 일치할 때만 proof를 내어준다 — 다른 전화번호/다른 목적의
// 이전 인증 증빙이 잘못 재사용되는 것을 막기 위함. Redux/AsyncStorage/SecureStore/로그에는 절대 넣지 않는다.
let verificationContext = null; // { purpose: 'signup', phoneNumber, proof } | null

export function setVerificationProof(purpose, phoneNumber, proof) {
  verificationContext = { purpose, phoneNumber, proof };
}

export function getVerificationProof(purpose, phoneNumber) {
  if (
    verificationContext &&
    verificationContext.purpose === purpose &&
    verificationContext.phoneNumber === phoneNumber
  ) {
    return verificationContext.proof;
  }
  return null; // purpose/phoneNumber 불일치 시 무조건 null (stale proof 재사용 방지)
}

export function clearVerificationProof() {
  verificationContext = null;
}
