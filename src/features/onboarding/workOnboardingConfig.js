// 서버(Work API) 기반 재무 온보딩 기능 플래그.
//
// false: 기존 앱 동작(로컬 온보딩 게이트/화면/Home 머니 타입)을 그대로 유지한다.
// true : 신규 서버 온보딩 Gate(Work API-34)·화면을 사용한다.
//
// 6-4에서 true로 활성화했다. 롤백은 이 값을 false로 되돌리면 된다(Legacy 코드는 삭제하지 않았다).
// 단, 그 사이 서버에 저장된 온보딩 답변은 로컬 결과로 되돌려지지 않는다.
export const WORK_ONBOARDING_ENABLED = true;
