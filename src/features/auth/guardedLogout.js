// 앱 잠금 화면의 '로그아웃하고 다시 로그인' 처리. 화면(React)과 분리해 동작을 테스트할 수 있게 한 순수 함수다.
// - 진행 중이면 다시 시작하지 않는다(중복 로그아웃 방지).
// - 성공·실패 모두 진행 상태를 되돌린다. 로그아웃이 끝나도 화면이 그대로 남아 있을 수 있기 때문이다
//   (예: 이미 로그아웃된 상태에서의 요청) — 되돌리지 않으면 화면이 영구 로딩 상태에 빠진다.
// - 화면이 이미 언마운트됐다면 setState(setBusy)를 호출하지 않는다.
// 반환: 실제로 logout을 실행했으면 true, 이미 진행 중이라 건너뛰었으면 false.
export const runGuardedLogout = async ({ busyRef, mountedRef, setBusy, logout }) => {
  if (busyRef.current) return false;

  busyRef.current = true;
  setBusy(true);

  try {
    await logout();
  } catch {
    // logoutUser는 항상 fulfilled로 끝난다. 예외가 나도 아래 finally에서 상태를 되돌린다.
  } finally {
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
  }

  return true;
};
