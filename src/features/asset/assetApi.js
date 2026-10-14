import { createAction, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { normalizeApiError } from '../../utils/normalizeApiError';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';
import * as accountApi from './assetAccountApi';
import * as bankingApi from './bankingApi';
import * as cashflowApi from './cashflowApi';
import { ASSET_REQUEST_ERROR, invalidResponse, requestError } from './assetResponse';
import { getLocalDateKey } from './cashflowScreenLogic';
import {
  loadDailyLimitRecord,
  purgeStaleDailyLimitRecord,
  saveDailyLimitRecord,
} from './dailyLimitStorage';
import {
  PENDING_TRANSFER_CODE,
  TRANSFER_ERROR_OUTCOME,
  classifyTransferError,
} from './transferOutcome';
import {
  buildTransactionsCursorQuery,
  extractTransactionListResult,
} from './transactionQueryAdapter';

// 이 파일의 thunk는 요청 경계만 담당한다. "이 응답을 지금 상태에 반영해도 되는가"(로그아웃·계좌 전환·라운드 변경 후 늦은 응답 차단)는
// assetSlice가 pending에서 기록한 action.meta.requestId / 거래 라운드(requestSeq)로 판정한다.

// 계좌 목록(API-52). 외부 호출 방식(dispatch(fetchAccounts()))은 그대로이고 payload는 { accounts: [...] }다.
export const fetchAccounts = createAsyncThunk(
  'asset/fetchAccounts',
  async (_, { rejectWithValue }) => {
    try {
      return await accountApi.fetchAccountList();
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '계좌 목록 조회에 실패했습니다.'));
    }
  }
);

// 계좌 id 결정: 인자로 받은 값이 있으면 그것, 없으면 현재 선택 계좌. 목록에 없는 id는 요청하지 않는다(다른 계좌를 추측하지 않음).
const resolveRequestAccountId = (state, accountId) => {
  const id = accountId ?? state.selectedAccountId;
  if (id == null || !state.accounts.some(account => account.id === id)) {
    throw requestError(ASSET_REQUEST_ERROR.INVALID_ACCOUNT_ID, '조회할 계좌를 알 수 없습니다.');
  }
  return id;
};

// 계좌 상세 + 최근 거래(API-11). 입력: { accountId? } (생략 시 선택 계좌).
export const fetchAccountDetail = createAsyncThunk(
  'asset/fetchAccountDetail',
  async (arg, { getState, rejectWithValue }) => {
    let accountId = null; // 검증을 통과한 계좌 id만 담는다(요청 전 검증 실패 오류는 계좌에 귀속시키지 않음)
    try {
      accountId = resolveRequestAccountId(getState().asset, arg?.accountId);
      const detail = await accountApi.fetchAccountDetail(accountId);
      return { accountId, detail };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '계좌 상세 조회에 실패했습니다.'),
        accountId,
      });
    }
  }
);

// 계좌 새로고침(API-14, 본문 없는 POST, 자동 재시도 없음). 진행 중인 새로고침이 있으면 중복 호출하지 않는다.
export const refreshAccount = createAsyncThunk(
  'asset/refreshAccount',
  async (arg, { getState, rejectWithValue }) => {
    let accountId = null; // 검증을 통과한 계좌 id만 담는다(요청 전 검증 실패 오류는 계좌에 귀속시키지 않음)
    try {
      accountId = resolveRequestAccountId(getState().asset, arg?.accountId);
      const detail = await accountApi.refreshAccount(accountId);
      return { accountId, detail };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '계좌 새로고침에 실패했습니다.'),
        accountId,
      });
    }
  },
  {
    condition: (_, { getState }) => getState().asset.refreshingAccountId === null,
  }
);

// 거래 목록(API-13, 커서 방식). 입력: { accountId?, cursor?, page?, queryKey? }.
// - 첫 페이지: cursor/page 없음 → 쿼리 없음. 다음 페이지: cursor 또는 page>0 → 슬라이스의 transactionsNextCursor(문자열)로 요청.
// - 기간(dateRange)·size·page는 서버로 보내지 않는다(기간은 filterByPeriod로 클라이언트에서만 적용).
export const fetchTransactions = createAsyncThunk(
  'asset/fetchTransactions',
  async (arg, { getState, rejectWithValue }) => {
    const state = getState().asset;
    // 요청을 시작하는 시점의 "현재 활성 seq"를 스냅샷으로 고정한다(라운드/로그아웃/계좌 전환 후 늦은 응답 차단용).
    const requestSeq = state.transactionsActiveQuerySeq;
    const queryKey = arg?.queryKey ?? null;
    const loadMore = arg?.cursor != null || arg?.page > 0;
    let accountId = null; // 검증을 통과한 계좌 id만 담는다(요청 전 검증 실패 오류는 계좌에 귀속시키지 않음)
    try {
      accountId = resolveRequestAccountId(state, arg?.accountId);
      const cursor = loadMore ? (arg?.cursor ?? state.transactionsNextCursor) : null;
      if (loadMore && cursor == null) {
        throw requestError(ASSET_REQUEST_ERROR.INVALID_CURSOR, '다음 페이지 커서가 없습니다.');
      }
      const query = buildTransactionsCursorQuery({ cursor });
      const result = await accountApi.fetchAccountTransactions(accountId, {
        lastTransactionId: query.lastTransactionId,
      });
      return {
        accountId,
        queryKey,
        requestSeq,
        loadMore,
        cursor,
        ...extractTransactionListResult(result),
      };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '거래내역 조회에 실패했습니다.'),
        accountId,
        queryKey,
        requestSeq,
        loadMore,
      });
    }
  },
  {
    // 이미 다음 페이지를 불러오는 중이거나 더 불러올 것이 없으면 중복 요청하지 않는다.
    condition: (arg, { getState }) => {
      const loadMore = arg?.cursor != null || arg?.page > 0;
      if (!loadMore) return true;
      const state = getState().asset;
      return (
        !state.transactionsLoading && !state.transactionsLoadingMore && state.transactionsHasNext
      );
    },
  }
);

// 거래 단건(API-12). 입력: { accountId, transactionId } 또는 transactionId 문자열(기존 호출 호환, 이때 accountId는 선택 계좌).
// 유효한 계좌 id가 없으면 요청 자체를 거부한다. 다른 계좌 id를 추측하지 않는다.
export const fetchTransactionDetail = createAsyncThunk(
  'asset/fetchTransactionDetail',
  async (arg, { getState, rejectWithValue }) => {
    const input = arg !== null && typeof arg === 'object' ? arg : { transactionId: arg };
    let accountId = null; // 검증을 통과한 계좌 id만 담는다(요청 전 검증 실패 오류는 계좌에 귀속시키지 않음)
    try {
      accountId = resolveRequestAccountId(getState().asset, input.accountId);
      const transaction = await accountApi.fetchAccountTransaction(accountId, input.transactionId);
      return { accountId, transaction };
    } catch (error) {
      return rejectWithValue({
        ...normalizeApiError(error, '거래 상세 조회에 실패했습니다.'),
        accountId,
      });
    }
  }
);

// 아래 2개는 이번 단계에서 요청 계약을 바꾸지 않는다(명세 밖 구형 경로). 늦은 응답 방어는 assetSlice가 맡는다.
export const fetchAccountSummary = createAsyncThunk(
  'asset/fetchAccountSummary',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.ACCOUNT_SUMMARY);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '계좌 요약 조회에 실패했습니다.'));
    }
  }
);

export const fetchAvailableBalance = createAsyncThunk(
  'asset/fetchAvailableBalance',
  async (_, { rejectWithValue }) => {
    try {
      return await apiClient.get(API_ENDPOINTS.ASSET.AVAILABLE_BALANCE);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '사용 가능 금액 조회에 실패했습니다.'));
    }
  }
);

// 계좌 개설(API-09, Mock 계좌). 입력은 호출부가 명시적으로 만든 { ci, userName, phoneNumber, bankCode, productName, initialBalance }뿐이다.
// 필수값이 하나라도 비었거나 잘못되면 bankingApi가 요청 전에 거부한다(요청 안 함). 자동 재시도·자동 개설 없음, 진행 중 중복 요청 차단.
// 성공해도 계좌 목록에 가짜 계좌를 넣지 않는다 — 호출부가 성공 확인 후 fetchAccounts()를 1회만 호출한다(Kafka 반영 지연 가능).
export const openAccount = createAsyncThunk(
  'asset/openAccount',
  async (input, { rejectWithValue }) => {
    try {
      return await bankingApi.openBankingAccount(input);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '계좌 개설에 실패했습니다.'));
    }
  },
  {
    condition: (_, { getState }) => !getState().asset.openAccountLoading,
  }
);

// ── Cashflow (API-15~17) ─────────────────────────────────────
// 통신·검증은 cashflowApi가 맡고, 여기서는 요청 경계(중복 차단·월 일치)만 정한다. 늦은 응답 차단은 assetSlice가 맡는다.

// 일일 사용 가능 금액(API-15). 입력은 화면이 사용자 입력으로 만든 값뿐이다(출처 없는 값을 채우지 않는다).
// 정상 응답만 기기에 저장해(dailyLimitStorage) 같은 사용자·같은 날짜의 앱 재실행 때 복원한다.
// 요청 시작 시점의 사용자·계산일을 고정하고, 응답 시점에 사용자/세션/날짜가 달라졌으면 상태에도 저장소에도 반영하지 않는다.
const readUserId = rootState => {
  const userId = rootState.auth?.user?.userId;
  return typeof userId === 'string' && userId !== '' ? userId : null;
};

export const submitDailyLimit = createAsyncThunk(
  'asset/submitDailyLimit',
  async (input, { rejectWithValue, getState, requestId }) => {
    const startedOn = getLocalDateKey();
    const ownerUserId = readUserId(getState());
    let result;
    try {
      result = await cashflowApi.calculateDailyLimit(input);
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '일일 사용 가능 금액 계산에 실패했습니다.'));
    }

    // 로그아웃·사용자 전환이면 slice의 requestId가 비워져 있다. 이전 사용자의 응답은 저장하지 않는다.
    const current = getState();
    if (
      current.asset.cashflowDaily.requestId !== requestId ||
      readUserId(current) !== ownerUserId
    ) {
      return rejectWithValue({ message: '계산 중 계정 상태가 바뀌어 결과를 반영하지 않았어요.' });
    }
    // 요청 중 자정을 넘겼으면 어제 기준 응답을 오늘 결과로 쓰지 않는다.
    if (getLocalDateKey() !== startedOn) {
      return rejectWithValue({
        message: '계산 중 날짜가 바뀌어 결과를 반영하지 않았어요. 다시 계산해 주세요.',
      });
    }

    if (ownerUserId) {
      try {
        await saveDailyLimitRecord(ownerUserId, { calculatedOn: startedOn, result, input });
      } catch (error) {
        // 저장 실패는 화면 반영을 막지 않는다(다음 실행에서 복원만 안 됨). 민감정보 없이 진단만 남긴다.
        console.warn('[dailyLimit] 계산 결과 로컬 저장에 실패했습니다.', {
          errorName: error?.name ?? 'Error',
        });
      }
    }
    return { result, input, calculatedOn: startedOn, ownerUserId };
  },
  { condition: (_, { getState }) => !getState().asset.cashflowDaily.loading }
);

// 로컬 보관분 복원/만료 결과를 slice에 전달하는 액션(slice가 처리). assetSlice와의 순환 import를 피하려고 여기서 만든다.
export const dailyLimitRestored = createAction('asset/dailyLimitRestored');
export const dailyLimitExpired = createAction('asset/dailyLimitExpired');

// 홈 진입·앱 활성화·자정 통과 때 호출한다. 서버를 호출하지 않는다(자동 재계산 없음).
// - 메모리 결과의 계산일이 오늘이 아니면 비우고 로컬 보관분도 정리한다.
// - 메모리 결과가 없으면 같은 사용자·같은 날짜의 로컬 보관분만 복원한다.
// 입력: { now?: Date }(테스트용 시계 주입). 반환: 'kept' | 'expired' | 'restored' | 'none' | 'skipped'.
export const syncDailyLimitForToday = createAsyncThunk(
  'asset/syncDailyLimitForToday',
  async (arg, { getState, dispatch }) => {
    const nowOf = () => arg?.now ?? new Date();
    const today = getLocalDateKey(nowOf());
    const startState = getState();
    const userId = readUserId(startState);
    const { result, loading } = startState.asset.cashflowDaily;
    const { calculatedOn } = startState.asset.dailyLimitMeta;

    try {
      if (result !== null) {
        if (calculatedOn === today) return 'kept';
        dispatch(dailyLimitExpired({ calculatedOn }));
        if (userId) await purgeStaleDailyLimitRecord(userId, today);
        return 'expired';
      }
      if (!userId || loading) return 'none';

      const record = await loadDailyLimitRecord(userId);
      if (!record) return 'none';
      if (record.calculatedOn !== today) {
        await purgeStaleDailyLimitRecord(userId, today);
        return 'expired';
      }

      // 읽는 동안 사용자·세션·날짜가 바뀌었거나 새 계산이 시작/완료됐으면 폐기한다.
      const current = getState();
      if (
        readUserId(current) !== userId ||
        current.asset.sessionGeneration !== startState.asset.sessionGeneration ||
        current.asset.cashflowDaily.result !== null ||
        current.asset.cashflowDaily.loading ||
        getLocalDateKey(nowOf()) !== today
      ) {
        return 'skipped';
      }
      dispatch(dailyLimitRestored({ userId, record }));
      return 'restored';
    } catch (error) {
      // 저장소 읽기/삭제 실패는 홈 동작을 막지 않는다(계산하기 UI로 폴백).
      console.warn('[dailyLimit] 로컬 계산 기록 동기화에 실패했습니다.', {
        errorName: error?.name ?? 'Error',
      });
      return 'none';
    }
  }
);

// 응답의 yearMonth가 요청한 월과 같을 때만 정상 응답으로 본다(다른 월 데이터를 표시하지 않는다).
const requireSameYearMonth = (response, yearMonth, field) => {
  if (response.yearMonth !== yearMonth) throw invalidResponse(`${field}.yearMonth`);
  return response;
};

// 월별 집계(API-16). 현재 조회 월(state.cashflowYearMonth)과 같은 월만 요청한다.
export const loadMonthlyCashflow = createAsyncThunk(
  'asset/loadMonthlyCashflow',
  async (yearMonth, { rejectWithValue }) => {
    try {
      const data = requireSameYearMonth(
        await cashflowApi.fetchMonthlyCashflow(yearMonth),
        yearMonth,
        'monthlyCashflow'
      );
      return { yearMonth, data };
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '월별 현금흐름 조회에 실패했습니다.'));
    }
  },
  {
    condition: (yearMonth, { getState }) => {
      const state = getState().asset;
      return yearMonth === state.cashflowYearMonth && !state.cashflowMonthly.loading;
    },
  }
);

// 카테고리 집계(API-17). API-16과 같은 월 상태를 공유한다.
export const loadCategoryCashflow = createAsyncThunk(
  'asset/loadCategoryCashflow',
  async (yearMonth, { rejectWithValue }) => {
    try {
      const data = requireSameYearMonth(
        await cashflowApi.fetchCategoryCashflow(yearMonth),
        yearMonth,
        'categoryCashflow'
      );
      return { yearMonth, data };
    } catch (error) {
      return rejectWithValue(normalizeApiError(error, '카테고리 소비 조회에 실패했습니다.'));
    }
  },
  {
    condition: (yearMonth, { getState }) => {
      const state = getState().asset;
      return yearMonth === state.cashflowYearMonth && !state.cashflowCategory.loading;
    },
  }
);

export const PENDING_TRANSFER_MESSAGE = '확인이 필요한 송금이 있어 새 송금을 보낼 수 없어요.';

// 송금(API-10). 새 송금 입력: { withdrawalAccountId, depositBankCode, depositAccountNumber, amount, idempotencyKey? }.
// 미확정 송금(pendingTransfer: ACCEPTED/PROCESSING 응답 또는 결과 확인 불가)이 있으면 새 키로 송금하지 않는다.
// 그때는 { recheckPending: true }만 받아 저장된 "같은 요청 본문 + 같은 키"로 다시 확인한다(사용자가 직접 누를 때만, 자동 재송금 없음).
// 응답 payload에는 request(보낸 본문 스냅샷)와 idempotencyKey를 함께 돌려줘 슬라이스가 미확정 상태를 보관한다.
export const transferFunds = createAsyncThunk(
  'asset/transferFunds',
  async (arg, { getState, rejectWithValue }) => {
    const pending = getState().asset.pendingTransfer;
    const recheck = arg?.recheckPending === true;

    if (Boolean(pending) !== recheck) {
      // 미확정이 있는데 새 송금이거나, 확인할 미확정이 없는데 다시 확인을 요청한 경우 — 요청하지 않는다.
      return rejectWithValue({
        message: PENDING_TRANSFER_MESSAGE,
        code: PENDING_TRANSFER_CODE,
        status: null,
        kind: null,
        traceId: null,
        outcome: TRANSFER_ERROR_OUTCOME.BLOCKED,
      });
    }

    let request;
    let key;
    if (recheck) {
      request = pending.request;
      key = pending.idempotencyKey;
    } else {
      request = {
        withdrawalAccountId: arg?.withdrawalAccountId,
        depositBankCode: arg?.depositBankCode,
        depositAccountNumber: arg?.depositAccountNumber,
        amount: arg?.amount,
      };
      key = ensureIdempotencyKey(arg?.idempotencyKey);
    }

    try {
      const { transfer } = await bankingApi.requestTransfer(request, { idempotencyKey: key });
      return { transfer, request, idempotencyKey: key };
    } catch (error) {
      // 같은 송금을 다시 시도할 때는 이 키와 요청 본문을 그대로 쓴다. outcome이 UNCERTAIN이면 슬라이스가 미확정으로 보관한다.
      return rejectWithValue({
        ...normalizeApiError(error, '송금 결과를 확인하지 못했습니다.'),
        outcome: classifyTransferError(error),
        request,
        idempotencyKey: key,
      });
    }
  },
  {
    // condition: Redux Toolkit이 transferLoading=true 상태에서 dispatch를 취소함.
    // 취소 시 action은 dispatch되지 않으므로 fulfilled/rejected가 발생하지 않음.
    condition: (_, { getState }) => !getState().asset.transferLoading,
  }
);
