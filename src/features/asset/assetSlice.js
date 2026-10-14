import { createSlice } from '@reduxjs/toolkit';
import {
  fetchAccounts,
  fetchAccountDetail,
  refreshAccount,
  fetchAccountSummary,
  fetchAvailableBalance,
  fetchTransactions,
  fetchTransactionDetail,
  transferFunds,
  openAccount,
  submitDailyLimit,
  dailyLimitRestored,
  dailyLimitExpired,
  loadMonthlyCashflow,
  loadCategoryCashflow,
} from './assetApi';
import { isYearMonth } from './cashflowScreenLogic';
import {
  TRANSFER_ERROR_OUTCOME,
  TRANSFER_OUTCOME,
  classifyTransferStatus,
} from './transferOutcome';
import { logout } from '../auth/authSlice';
import {
  loginUser,
  logoutUser,
  registerUser,
  verifyUnlockPin,
  deleteAccount,
  changePin,
} from '../auth/authApi';
import {
  normalizeAccountDetail,
  normalizeAccountList,
  normalizeSummary,
  normalizeTransaction,
  normalizeTransactionDetail,
} from '../../utils/apiMappers';
import { resolveSelectedAccountId } from '../../utils/selectDefaultAccount';

const buildInitialState = () => ({
  // 세션 격리: 세션 종료·전환(로그아웃 등)마다 증가하며 초기화로 되돌리지 않는다.
  sessionGeneration: 0,

  accounts: [],
  accountsLoading: false,
  accountsError: null,
  accountsRequestId: null, // 현재 유효한 요청의 meta.requestId (초기화 시 null → 이전 요청의 늦은 응답 무시)
  selectedAccountId: null,

  // API-11 계좌 상세
  accountDetail: null,
  accountDetailAccountId: null,
  accountDetailLoading: false,
  accountDetailError: null,
  accountDetailRequestId: null,

  // API-14 계좌 새로고침 (한 번에 하나만)
  refreshingAccountId: null,
  refreshRequestId: null,
  refreshError: null,

  summary: null,
  summaryLoading: false,
  summaryError: null,
  summaryRequestId: null,

  availableBalanceDetail: null,
  availableBalanceLoading: false,
  availableBalanceError: null,
  availableBalanceRequestId: null,

  // API-13 거래 목록 (커서 방식)
  transactions: [],
  transactionsAccountId: null, // 현재 목록이 속한 계좌
  transactionsLoading: false, // 최초(첫 페이지) 조회 로딩
  transactionsLoadingMore: false, // 다음 페이지 조회 로딩
  transactionsRefreshing: false,
  transactionsError: null,
  transactionsNextCursor: null, // 서버 nextCursor (문자열 그대로)
  transactionsHasNext: false, // 서버 hasNext
  // 화면 호환(C단계 전까지): transactionsHasMore = transactionsHasNext, transactionsNextPage = 불러온 페이지 수. 요청에는 쓰지 않는다.
  transactionsHasMore: false,
  transactionsNextPage: 0,
  transactionsActiveQueryKey: null, // 현재 유효한 조회 조건 key. race condition 방어용
  transactionsActiveQuerySeq: 0, // 라운드/계좌 전환/세션 초기화마다 증가(감소 없음). race condition 방어용

  // API-12 거래 단건
  transactionDetail: null,
  transactionDetailAccountId: null,
  transactionDetailLoading: false,
  transactionDetailError: null,
  transactionDetailRequestId: null,

  // 송금 COMPLETED 직후의 데이터 신선도. 서버 응답으로 확인되기 전의 잔액은 최신으로 취급하지 않는다.
  // - accountDataVersion: 계좌 범위 데이터(상세·거래)를 비우고 다시 조회해야 할 때마다 증가한다(화면 재조회 트리거).
  // - staleBalanceAccountIds: 송금 이후 서버 잔액을 아직 확인하지 못한 계좌 id. accounts 자체는 지우지 않는다.
  accountDataVersion: 0,
  staleBalanceAccountIds: [],

  // API-10 송금
  transferLoading: false,
  transferError: null,
  transferRequestId: null,
  transferOutcome: null, // 마지막 응답의 분류(TRANSFER_OUTCOME) — 서버가 응답한 경우만
  // 결과가 확정되지 않은 송금. 있으면 새 키로 송금하지 않고, 저장된 같은 본문 + 같은 키로만 다시 확인한다.
  // { request: { withdrawalAccountId, depositBankCode, depositAccountNumber, amount }, idempotencyKey, lastStatus: 'ACCEPTED'|'PROCESSING'|'UNKNOWN' }
  // 화면 ref가 아니라 여기 두어 화면 이탈·재진입에도 유지되고, 세션 종료 시 resetAssetState로 함께 폐기된다(다른 사용자에게 재사용 불가).
  pendingTransfer: null,

  // API-09 계좌 개설. 성공해도 accounts에는 아무것도 넣지 않는다(목록은 API-52 재조회 결과만 반영).
  openAccountLoading: false,
  openAccountError: null,
  openAccountRequestId: null,

  // Cashflow (API-15~17). 세션 종료 시 resetAssetState로 함께 비워진다.
  // API-15: result는 서버 응답 그대로(dailyLimit 등), input은 마지막으로 제출한 사용자 입력(메모리 전용).
  cashflowDaily: {
    result: null,
    input: null,
    loading: false,
    error: null,
    errorStatus: null,
    requestId: null,
  },
  // API-15 결과의 계산일(기기 로컬 YYYY-MM-DD)과 소유 사용자. result가 "오늘 금액"인지 판정하는 데만 쓴다.
  // 결과 자체(cashflowDaily.result)는 서버 응답 그대로 두기 위해 별도 필드로 둔다.
  dailyLimitMeta: { calculatedOn: null, ownerUserId: null },
  // API-16/17이 함께 쓰는 조회 월(YYYY-MM). 바뀌면 두 응답을 모두 비우고 진행 중 요청을 무효화한다.
  cashflowYearMonth: null,
  cashflowMonthly: { data: null, loading: false, error: null, requestId: null },
  cashflowCategory: { data: null, loading: false, error: null, requestId: null },
});

const buildCashflowSection = () => ({ data: null, loading: false, error: null, requestId: null });

// 세션 종료·전환 시 전체 초기화. sessionGeneration과 거래 라운드(seq)는 증가시켜 이전 세션의 늦은 응답이 어떤 경로로도 맞지 않게 한다.
const resetAssetState = state => {
  const nextGeneration = state.sessionGeneration + 1;
  const nextSeq = state.transactionsActiveQuerySeq + 1;
  Object.assign(state, buildInitialState(), {
    sessionGeneration: nextGeneration,
    transactionsActiveQuerySeq: nextSeq,
  });
};

// 선택 계좌가 바뀌면 이전 계좌의 상세·거래·커서를 비우고 거래/상세 요청을 무효화한다(이전 계좌 응답이 늦게 와도 반영되지 않음).
const clearAccountScopedState = state => {
  state.accountDetail = null;
  state.accountDetailAccountId = null;
  state.accountDetailLoading = false;
  state.accountDetailError = null;
  state.accountDetailRequestId = null;

  state.transactions = [];
  state.transactionsAccountId = null;
  state.transactionsLoading = false;
  state.transactionsLoadingMore = false;
  state.transactionsError = null;
  state.transactionsNextCursor = null;
  state.transactionsHasNext = false;
  state.transactionsHasMore = false;
  state.transactionsNextPage = 0;
  state.transactionsActiveQuerySeq += 1;

  state.transactionDetail = null;
  state.transactionDetailAccountId = null;
  state.transactionDetailLoading = false;
  state.transactionDetailError = null;
  state.transactionDetailRequestId = null;
};

// 리소스별 "지금 유효한 요청"인지 판정한다(pending에서 기록한 requestId와 일치).
const isCurrentRequest = (currentId, action) =>
  currentId !== null && currentId === action.meta.requestId;

// 거래 목록 응답이 현재 라운드·계좌의 것인지. accountId가 null인 오류(요청 전 검증 실패)는 계좌 비교를 건너뛴다.
const isStaleTransactionsResult = (state, info) =>
  info?.queryKey !== state.transactionsActiveQueryKey ||
  info?.requestSeq !== state.transactionsActiveQuerySeq ||
  (info?.accountId != null && info.accountId !== state.selectedAccountId);

// fetchTransactionDetail 인자({ accountId, transactionId } 또는 transactionId 문자열)에서 요청 식별 정보를 읽는다.
// 문자열 인자는 계좌를 지정하지 않으므로 accountId는 null(응답 계좌 비교를 건너뜀 — thunk가 이미 검증).
const readDetailRequestArg = arg => {
  const input = arg !== null && typeof arg === 'object' ? arg : { transactionId: arg };
  return {
    accountId: input.accountId ?? null,
    transactionId: input.transactionId == null ? null : String(input.transactionId),
  };
};

const isLoadMoreArg = arg => arg?.cursor != null || arg?.page > 0;

const assetSlice = createSlice({
  name: 'asset',
  initialState: buildInitialState(),
  reducers: {
    setSelectedAccountId: (state, action) => {
      const nextId = action.payload ?? null;
      if (nextId !== null && !state.accounts.some(account => account.id === nextId)) return; // 없는 계좌 ID는 받지 않는다
      if (nextId === state.selectedAccountId) return;
      state.selectedAccountId = nextId;
      clearAccountScopedState(state);
    },
    // 송금 COMPLETED 확정 직후 호출한다. 서버에서 다시 받기 전까지 이전 잔액·상세·거래를 최신으로 보이지 않게 한다.
    // 잔액을 계산하거나 바꾸지 않고, accounts·선택 계좌·송금 상태(pendingTransfer 등)는 건드리지 않는다.
    accountDataInvalidated: state => {
      clearAccountScopedState(state); // 상세/거래 비움 + API-11/API-13 진행 중 요청 무효화
      state.refreshingAccountId = null; // 진행 중이던 API-14의 늦은 응답 무시
      state.refreshRequestId = null;
      state.refreshError = null;
      state.accountsRequestId = null; // 송금 이전에 시작된 API-52 응답은 최신 확인으로 인정하지 않는다
      state.accountsLoading = false;
      state.staleBalanceAccountIds = state.accounts.map(account => account.id);
      state.accountDataVersion += 1;
    },
    clearTransactionDetail: state => {
      state.transactionDetail = null;
      state.transactionDetailAccountId = null;
      state.transactionDetailError = null;
      state.transactionDetailLoading = false;
      state.transactionDetailRequestId = null; // 진행 중이던 상세 요청의 늦은 응답 무시
    },
    resetTransactions: (state, action) => {
      const { queryKey } = action.payload ?? {};
      state.transactions = [];
      state.transactionsAccountId = null;
      state.transactionsNextCursor = null;
      state.transactionsHasNext = false;
      state.transactionsHasMore = false;
      state.transactionsNextPage = 0;
      state.transactionsError = null;
      state.transactionsLoading = false;
      state.transactionsLoadingMore = false;
      state.transactionsActiveQueryKey = queryKey ?? null;
      state.transactionsActiveQuerySeq += 1; // 조회 조건이 바뀌면 이전 라운드의 응답은 전부 무효화
    },
    // API-16/17 조회 월 지정. 월이 같더라도 이전 응답을 비우고 진행 중 요청을 무효화한다(새로 조회하기 위함).
    // 형식이 잘못된 월은 무시한다.
    setCashflowYearMonth: (state, action) => {
      if (!isYearMonth(action.payload)) return;
      state.cashflowYearMonth = action.payload;
      state.cashflowMonthly = buildCashflowSection();
      state.cashflowCategory = buildCashflowSection();
    },
    beginTransactionsRefresh: state => {
      // 조회 조건(queryKey)은 그대로 두고 라운드(seq)만 새로 시작한다.
      // 목록은 비우지 않는다 — pull-to-refresh는 기존 데이터를 유지한 채 재조회한다.
      state.transactionsActiveQuerySeq += 1;
      // 새 라운드가 첫 페이지만 재요청하므로, 이전 라운드의 loadMore가 in-flight였다면 그 응답은 stale로 무시되어
      // transactionsLoadingMore를 되돌릴 코드가 실행되지 않는다. 그대로 두면 loadMore가 계속 차단되므로 여기서 정리한다.
      // (transactionsLoading은 건드리지 않는다: 바로 이어 dispatch되는 첫 페이지 요청이 스스로 관리한다.)
      state.transactionsLoadingMore = false;
      state.transactionsError = null;
    },
  },
  extraReducers: builder => {
    builder
      // ── 세션 종료·전환: 이전 사용자의 계좌 데이터와 진행 중 요청을 즉시 무효화한다 (Auth 코드는 변경하지 않고 기존 액션에 반응) ──
      .addCase(logoutUser.pending, resetAssetState)
      .addCase(logoutUser.fulfilled, resetAssetState)
      .addCase(logoutUser.rejected, resetAssetState)
      .addCase(logout, resetAssetState)
      // 회원 탈퇴·PIN 변경 성공 후 로컬 세션이 정리된 경우에만 이전 사용자의 계좌 데이터를 비운다(실패 시 유지).
      .addCase(deleteAccount.fulfilled, (state, action) => {
        if (action.payload?.sessionEnded === true) resetAssetState(state);
      })
      .addCase(changePin.fulfilled, (state, action) => {
        if (action.payload?.sessionEnded === true) resetAssetState(state);
      })
      .addCase(verifyUnlockPin.rejected, (state, action) => {
        // 세션이 정리된 경우만. 잘못된 PIN·423·네트워크 오류는 인증이 유지되므로 초기화하지 않는다.
        if (action.payload?.sessionEnded === true) resetAssetState(state);
      })
      .addCase(loginUser.fulfilled, resetAssetState)
      .addCase(registerUser.fulfilled, resetAssetState)

      // ── 계좌 목록 (API-52) ──
      .addCase(fetchAccounts.pending, (state, action) => {
        state.accountsLoading = true;
        state.accountsError = null;
        state.accountsRequestId = action.meta.requestId;
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.accountsRequestId, action)) return;
        state.accounts = normalizeAccountList(action.payload?.accounts);
        state.accountsLoading = false;
        state.accountsRequestId = null;
        state.staleBalanceAccountIds = []; // 무효화 이후 시작된 최신 요청의 서버 잔액

        // 선택 보정: 있으면 유지(SUSPENDED/CLOSED 조회 포함), 사라졌으면 기본 ACTIVE 계좌, 없으면 null
        const nextId = resolveSelectedAccountId(state.accounts, state.selectedAccountId);
        if (nextId !== state.selectedAccountId) {
          state.selectedAccountId = nextId;
          clearAccountScopedState(state);
        }
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        if (!isCurrentRequest(state.accountsRequestId, action)) return;
        state.accountsLoading = false;
        state.accountsRequestId = null;
        state.accountsError = action.payload?.message ?? '계좌 조회에 실패했습니다.';
      })

      // ── 계좌 상세 (API-11) ──
      .addCase(fetchAccountDetail.pending, (state, action) => {
        const requestedId = action.meta.arg?.accountId ?? state.selectedAccountId;
        if (state.accountDetailAccountId !== requestedId) {
          state.accountDetail = null; // 다른 계좌의 상세를 보여주지 않는다
          state.accountDetailAccountId = null;
        }
        state.accountDetailLoading = true;
        state.accountDetailError = null;
        state.accountDetailRequestId = action.meta.requestId;
      })
      .addCase(fetchAccountDetail.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.accountDetailRequestId, action)) return;
        const { accountId, detail } = action.payload;
        if (accountId !== state.selectedAccountId) return; // 계좌 전환 후 도착한 이전 계좌 응답
        state.accountDetail = normalizeAccountDetail(detail);
        state.accountDetailAccountId = accountId;
        state.accountDetailLoading = false;
        state.accountDetailRequestId = null;
        // 송금 후 잔액 확인 대기 중이던 계좌는 서버(API-11) 잔액을 목록에도 반영하고 확인 완료로 본다.
        if (state.staleBalanceAccountIds.includes(accountId)) {
          const target = state.accounts.find(account => account.id === accountId);
          if (target) {
            target.balance = state.accountDetail.balance;
            target.balanceExact = state.accountDetail.balanceExact;
          }
          state.staleBalanceAccountIds = state.staleBalanceAccountIds.filter(
            id => id !== accountId
          );
        }
      })
      .addCase(fetchAccountDetail.rejected, (state, action) => {
        if (!isCurrentRequest(state.accountDetailRequestId, action)) return;
        const failedId = action.payload?.accountId;
        if (failedId != null && failedId !== state.selectedAccountId) return;
        state.accountDetailLoading = false;
        state.accountDetailRequestId = null;
        state.accountDetailError = action.payload?.message ?? '계좌 상세 조회에 실패했습니다.';
      })

      // ── 계좌 새로고침 (API-14) ──
      .addCase(refreshAccount.pending, (state, action) => {
        state.refreshingAccountId = action.meta.arg?.accountId ?? state.selectedAccountId;
        state.refreshRequestId = action.meta.requestId;
        state.refreshError = null;
      })
      .addCase(refreshAccount.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.refreshRequestId, action)) return;
        const { accountId, detail } = action.payload;
        state.refreshingAccountId = null;
        state.refreshRequestId = null;

        const normalized = normalizeAccountDetail(detail);
        // 목록의 같은 계좌만 잔액·동기화 상태를 갱신한다.
        const target = state.accounts.find(account => account.id === accountId);
        if (target) {
          target.balance = normalized.balance;
          target.balanceExact = normalized.balanceExact;
          target.syncStatus = normalized.syncStatus;
          target.lastSyncedAt = normalized.lastSyncedAt;
        }
        state.staleBalanceAccountIds = state.staleBalanceAccountIds.filter(id => id !== accountId);
        // 상세는 지금 선택된 계좌일 때만 교체한다.
        if (accountId === state.selectedAccountId) {
          state.accountDetail = normalized;
          state.accountDetailAccountId = accountId;
        }
      })
      .addCase(refreshAccount.rejected, (state, action) => {
        if (!isCurrentRequest(state.refreshRequestId, action)) return;
        state.refreshingAccountId = null;
        state.refreshRequestId = null;
        state.refreshError = action.payload?.message ?? '계좌 새로고침에 실패했습니다.';
      })

      // ── 구형 요약/사용 가능 금액 (명세 밖, 호출부 제거는 C단계) ──
      .addCase(fetchAccountSummary.pending, (state, action) => {
        state.summaryLoading = true;
        state.summaryError = null;
        state.summaryRequestId = action.meta.requestId;
      })
      .addCase(fetchAccountSummary.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.summaryRequestId, action)) return;
        state.summary = normalizeSummary(action.payload);
        state.summaryLoading = false;
        state.summaryRequestId = null;
      })
      .addCase(fetchAccountSummary.rejected, (state, action) => {
        if (!isCurrentRequest(state.summaryRequestId, action)) return;
        state.summaryLoading = false;
        state.summaryRequestId = null;
        state.summaryError = action.payload?.message ?? '계좌 요약 조회에 실패했습니다.';
      })

      .addCase(fetchAvailableBalance.pending, (state, action) => {
        state.availableBalanceLoading = true;
        state.availableBalanceError = null;
        state.availableBalanceRequestId = action.meta.requestId;
      })
      .addCase(fetchAvailableBalance.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.availableBalanceRequestId, action)) return;
        state.availableBalanceDetail = action.payload;
        state.availableBalanceLoading = false;
        state.availableBalanceRequestId = null;
      })
      .addCase(fetchAvailableBalance.rejected, (state, action) => {
        if (!isCurrentRequest(state.availableBalanceRequestId, action)) return;
        state.availableBalanceLoading = false;
        state.availableBalanceRequestId = null;
        state.availableBalanceError =
          action.payload?.message ?? '사용 가능 금액 조회에 실패했습니다.';
      })

      // ── 거래 목록 (API-13, 커서) ──
      .addCase(fetchTransactions.pending, (state, action) => {
        if (isLoadMoreArg(action.meta.arg)) state.transactionsLoadingMore = true;
        else state.transactionsLoading = true;
        state.transactionsError = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        const { accountId, loadMore, cursor, items, nextCursor, hasNext } = action.payload;
        if (isStaleTransactionsResult(state, action.payload)) return; // 오래된 라운드/계좌의 응답 — 완전히 무시
        // 다음 페이지 응답은 요청 시점의 커서가 지금도 유효할 때만 반영한다(같은 커서 중복 응답 방지).
        if (loadMore && cursor !== state.transactionsNextCursor) return;

        const normalized = items.map(normalizeTransaction);
        if (!loadMore) {
          state.transactions = normalized;
          state.transactionsNextPage = 1;
        } else {
          const seen = new Set(state.transactions.map(t => t.id));
          const fresh = [];
          for (const tx of normalized) {
            if (seen.has(tx.id)) continue;
            seen.add(tx.id);
            fresh.push(tx);
          }
          state.transactions.push(...fresh);
          state.transactionsNextPage += 1;
        }
        state.transactionsAccountId = accountId;
        state.transactionsNextCursor = nextCursor;
        state.transactionsHasNext = hasNext;
        state.transactionsHasMore = hasNext;
        state.transactionsLoading = false;
        state.transactionsLoadingMore = false;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        if (isStaleTransactionsResult(state, action.payload)) return; // 오래된 라운드/계좌의 에러 — 현재 화면의 error 상태를 덮지 않음
        state.transactionsLoading = false;
        state.transactionsLoadingMore = false;
        state.transactionsError = action.payload?.message ?? '거래내역 조회에 실패했습니다.';
      })

      // ── 거래 단건 (API-12) ──
      .addCase(fetchTransactionDetail.pending, (state, action) => {
        // 요청 대상이 지금 저장된 상세와 다르면 이전 거래를 즉시 비운다(잔상 방지).
        const { accountId, transactionId } = readDetailRequestArg(action.meta.arg);
        const stored = state.transactionDetail;
        const sameTarget =
          stored != null &&
          accountId != null &&
          state.transactionDetailAccountId === accountId &&
          String(stored.id) === transactionId;
        if (!sameTarget) {
          state.transactionDetail = null;
          state.transactionDetailAccountId = null;
        }
        state.transactionDetailLoading = true;
        state.transactionDetailError = null;
        state.transactionDetailRequestId = action.meta.requestId;
      })
      .addCase(fetchTransactionDetail.fulfilled, (state, action) => {
        // 요청 ID가 현재 요청과 같을 때만 처리한다(로그아웃·계좌 전환·새 요청은 requestId를 무효화한다).
        if (!isCurrentRequest(state.transactionDetailRequestId, action)) return;
        const { accountId, transaction } = action.payload;
        const requested = readDetailRequestArg(action.meta.arg);
        const normalized = normalizeTransactionDetail(transaction);
        // 선택 계좌와 비교하지 않는다(route accountId와 선택 계좌가 달라도 정상 요청). 대신 요청 식별 정보와
        // 응답이 일치하고 요청 계좌가 현재 목록에 있을 때만 저장한다. 어긋나면 저장하지 않고 로딩을 해제한다.
        const sameAccount = requested.accountId == null || requested.accountId === accountId;
        const sameTransaction =
          requested.transactionId == null || String(normalized.id) === requested.transactionId;
        const accountStillListed = state.accounts.some(account => account.id === accountId);
        state.transactionDetailLoading = false;
        state.transactionDetailRequestId = null;
        if (sameAccount && sameTransaction && accountStillListed) {
          state.transactionDetail = normalized;
          state.transactionDetailAccountId = accountId;
        } else {
          state.transactionDetail = null;
          state.transactionDetailAccountId = null;
          state.transactionDetailError = '거래 상세를 확인할 수 없습니다.';
        }
      })
      .addCase(fetchTransactionDetail.rejected, (state, action) => {
        if (!isCurrentRequest(state.transactionDetailRequestId, action)) return;
        state.transactionDetailLoading = false;
        state.transactionDetailRequestId = null;
        state.transactionDetailError = action.payload?.message ?? '거래 상세 조회에 실패했습니다.';
      })

      // ── 송금 (API-10) ──
      .addCase(transferFunds.pending, (state, action) => {
        state.transferLoading = true;
        state.transferError = null;
        state.transferOutcome = null;
        state.transferRequestId = action.meta.requestId;
      })
      .addCase(transferFunds.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.transferRequestId, action)) return;
        const { transfer, request, idempotencyKey } = action.payload;
        const outcome = classifyTransferStatus(transfer.status);
        state.transferLoading = false;
        state.transferRequestId = null;
        state.transferOutcome = outcome;
        // 서버가 확정한 결과(COMPLETED/FAILED/REVERSED)에서만 미확정을 해제한다. 처리 중이면 같은 키·본문을 유지한다.
        state.pendingTransfer =
          outcome === TRANSFER_OUTCOME.IN_PROGRESS
            ? { request, idempotencyKey, lastStatus: transfer.status }
            : null;
      })
      .addCase(transferFunds.rejected, (state, action) => {
        if (!isCurrentRequest(state.transferRequestId, action)) return;
        const payload = action.payload ?? {};
        state.transferLoading = false;
        state.transferRequestId = null;
        state.transferError = payload.message ?? '송금 결과를 확인하지 못했습니다.';
        // 오류에서는 기존 미확정을 해제하지 않는다(재확인 요청이 인증 오류 등으로 실패해도 원래 송금은 실행됐을 수 있다).
        // 새 송금이 결과 불명(UNCERTAIN)이면 같은 키·본문을 미확정으로 보관한다. 실행되지 않았음이 확실하면(REJECTED) 보관하지 않는다.
        if (
          payload.outcome === TRANSFER_ERROR_OUTCOME.UNCERTAIN &&
          state.pendingTransfer == null &&
          payload.request != null &&
          typeof payload.idempotencyKey === 'string'
        ) {
          state.pendingTransfer = {
            request: payload.request,
            idempotencyKey: payload.idempotencyKey,
            lastStatus: 'UNKNOWN',
          };
        }
      })

      // ── 일일 사용 가능 금액 (API-15) ──
      .addCase(submitDailyLimit.pending, (state, action) => {
        state.cashflowDaily.loading = true;
        state.cashflowDaily.error = null;
        state.cashflowDaily.errorStatus = null;
        state.cashflowDaily.requestId = action.meta.requestId;
      })
      .addCase(submitDailyLimit.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.cashflowDaily.requestId, action)) return;
        state.cashflowDaily.result = action.payload.result;
        state.cashflowDaily.input = action.payload.input;
        state.cashflowDaily.loading = false;
        state.cashflowDaily.requestId = null;
        state.dailyLimitMeta = {
          calculatedOn: action.payload.calculatedOn ?? null,
          ownerUserId: action.payload.ownerUserId ?? null,
        };
      })
      .addCase(submitDailyLimit.rejected, (state, action) => {
        if (!isCurrentRequest(state.cashflowDaily.requestId, action)) return;
        // 실패해도 이전에 성공한 결과는 지우지 않는다(새 입력으로 계산한 값이 아님은 화면이 입력 오류 문구로 구분).
        state.cashflowDaily.loading = false;
        state.cashflowDaily.requestId = null;
        state.cashflowDaily.error =
          action.payload?.message ?? '일일 사용 가능 금액 계산에 실패했습니다.';
        state.cashflowDaily.errorStatus = action.payload?.status ?? null;
      })
      // 앱 재실행 후 로컬 보관분 복원. 이미 결과가 있거나 계산 중이면 적용하지 않는다(새 계산 결과를 덮어쓰지 않음).
      .addCase(dailyLimitRestored, (state, action) => {
        if (state.cashflowDaily.result !== null || state.cashflowDaily.loading) return;
        const { userId, record } = action.payload;
        state.cashflowDaily.result = record.result;
        state.cashflowDaily.input = record.input;
        state.dailyLimitMeta = { calculatedOn: record.calculatedOn, ownerUserId: userId };
      })
      // 계산일이 지난 결과를 비운다. 그 사이 새 결과(다른 계산일)가 들어왔으면 지우지 않는다.
      .addCase(dailyLimitExpired, (state, action) => {
        if (state.dailyLimitMeta.calculatedOn !== action.payload.calculatedOn) return;
        state.cashflowDaily.result = null;
        state.cashflowDaily.input = null;
        state.dailyLimitMeta = { calculatedOn: null, ownerUserId: null };
      })

      // ── 월별 집계 (API-16) / 카테고리 집계 (API-17) ──
      // 요청 월이 지금 조회 월과 같고 requestId가 현재 요청일 때만 반영한다(월 변경·세션 종료 후 늦은 응답 차단).
      .addCase(loadMonthlyCashflow.pending, (state, action) => {
        state.cashflowMonthly.loading = true;
        state.cashflowMonthly.error = null;
        state.cashflowMonthly.requestId = action.meta.requestId;
      })
      .addCase(loadMonthlyCashflow.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.cashflowMonthly.requestId, action)) return;
        if (action.payload.yearMonth !== state.cashflowYearMonth) return;
        state.cashflowMonthly.data = action.payload.data;
        state.cashflowMonthly.loading = false;
        state.cashflowMonthly.requestId = null;
      })
      .addCase(loadMonthlyCashflow.rejected, (state, action) => {
        if (!isCurrentRequest(state.cashflowMonthly.requestId, action)) return;
        state.cashflowMonthly.loading = false;
        state.cashflowMonthly.requestId = null;
        state.cashflowMonthly.error =
          action.payload?.message ?? '월별 현금흐름 조회에 실패했습니다.';
      })
      .addCase(loadCategoryCashflow.pending, (state, action) => {
        state.cashflowCategory.loading = true;
        state.cashflowCategory.error = null;
        state.cashflowCategory.requestId = action.meta.requestId;
      })
      .addCase(loadCategoryCashflow.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.cashflowCategory.requestId, action)) return;
        if (action.payload.yearMonth !== state.cashflowYearMonth) return;
        state.cashflowCategory.data = action.payload.data;
        state.cashflowCategory.loading = false;
        state.cashflowCategory.requestId = null;
      })
      .addCase(loadCategoryCashflow.rejected, (state, action) => {
        if (!isCurrentRequest(state.cashflowCategory.requestId, action)) return;
        state.cashflowCategory.loading = false;
        state.cashflowCategory.requestId = null;
        state.cashflowCategory.error =
          action.payload?.message ?? '카테고리 소비 조회에 실패했습니다.';
      })

      // ── 계좌 개설 (API-09) ──
      .addCase(openAccount.pending, (state, action) => {
        state.openAccountLoading = true;
        state.openAccountError = null;
        state.openAccountRequestId = action.meta.requestId;
      })
      .addCase(openAccount.fulfilled, (state, action) => {
        if (!isCurrentRequest(state.openAccountRequestId, action)) return;
        state.openAccountLoading = false;
        state.openAccountRequestId = null;
      })
      .addCase(openAccount.rejected, (state, action) => {
        if (!isCurrentRequest(state.openAccountRequestId, action)) return;
        state.openAccountLoading = false;
        state.openAccountRequestId = null;
        state.openAccountError = action.payload?.message ?? '계좌 개설에 실패했습니다.';
      });
  },
});

export const {
  setSelectedAccountId,
  clearTransactionDetail,
  resetTransactions,
  beginTransactionsRefresh,
  accountDataInvalidated,
  setCashflowYearMonth,
} = assetSlice.actions;
export default assetSlice.reducer;
