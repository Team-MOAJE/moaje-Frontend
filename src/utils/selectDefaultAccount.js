// 계좌 선택 규칙 (서버 목록의 status 기준). 은행명·계좌번호·"주 계좌" 개념은 서버에 없으므로 만들지 않는다.
// - 기본 계좌 / 출금 계좌: ACTIVE만. ACTIVE가 없으면 null (억지로 선택하지 않는다).
// - 조회용 선택: SUSPENDED / CLOSED도 목록에 있으면 유지할 수 있다.
const isActiveAccount = account => account?.status === 'ACTIVE';

const toList = accounts => (Array.isArray(accounts) ? accounts : []);

// 기본 계좌: 목록 순서(서버 id 오름차순)상 첫 ACTIVE 계좌. 없으면 null.
export const selectDefaultAccount = accounts => toList(accounts).find(isActiveAccount) ?? null;

// 조회용 선택 보정: 현재 선택이 목록에 있으면 유지(상태 무관), 사라졌으면 기본 ACTIVE 계좌, 그것도 없으면 null.
export const resolveSelectedAccountId = (accounts, currentId) => {
  const list = toList(accounts);
  if (currentId != null && list.some(account => account?.id === currentId)) return currentId;
  return selectDefaultAccount(list)?.id ?? null;
};

// 출금 후보: preferredId가 ACTIVE 계좌와 일치하면 그 계좌, 아니면 기본 ACTIVE 계좌, 없으면 null.
export const resolveActiveAccount = (accounts, preferredId) => {
  const list = toList(accounts);
  if (preferredId != null) {
    const preferred = list.find(account => account?.id === preferredId);
    if (isActiveAccount(preferred)) return preferred;
  }
  return selectDefaultAccount(list);
};
