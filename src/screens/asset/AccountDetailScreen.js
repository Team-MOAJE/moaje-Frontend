import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ROUTES } from '../../constants/routes';
import { fetchAccountDetail, fetchAccounts, refreshAccount } from '../../features/asset/assetApi';
import { setSelectedAccountId } from '../../features/asset/assetSlice';
import {
  BALANCE_CHECK_FAILED_MESSAGE,
  canTransferFrom,
  describeSyncStatus,
  formatAccountNumber,
  formatExactMoney,
  getAccountStatusNotice,
  getCopyableAccountNumber,
  hasPendingRouteSeed,
  isBalanceStale,
  resolveAccountTitle,
} from '../../features/asset/assetScreenLogic';
import AccountDetailView from '../../components/asset/AccountDetailView';
import { copyTextToClipboard } from '../../utils/clipboard';

const BALANCE_CHECKING_TEXT = '확인 중...';
const COPY_NOTICE_MS = 2500;
const COPY_SUCCESS_MESSAGE = '계좌번호를 복사했어요.';
const COPY_FAILURE_MESSAGE = '복사하지 못했어요. 다시 시도해 주세요.';

export default function AccountDetailScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const {
    accounts,
    accountsLoading,
    accountsError,
    selectedAccountId,
    accountDetail,
    accountDetailAccountId,
    accountDetailLoading,
    accountDetailError,
    refreshingAccountId,
    refreshError,
    accountDataVersion,
    staleBalanceAccountIds,
  } = useSelector(state => state.asset);

  // 복사 안내는 어느 계좌에서 한 것인지 함께 보관한다(계좌를 바꾸면 이전 계좌의 안내는 보이지 않는다).
  const [copyNotice, setCopyNotice] = useState(null);

  const routeAccountId = route?.params?.accountId;
  const hasAccounts = accounts.length > 0;
  // route로 받은 accountId가 목록에 있으면 그 계좌를 선택하고, 곧바로 param을 비워 소비한다.
  // 소비 후에는 route 값이 없으므로 사용자가 시트에서 고른 계좌가 다시 덮어쓰이지 않고,
  // 같은 accountId로 다시 navigate하면(undefined → id) 새 진입 의도로 다시 적용된다.
  // 목록에 없는 id는 적용하지 않고 무시한다.
  const routeSeedPending = hasPendingRouteSeed(routeAccountId, accounts);

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  useEffect(() => {
    if (!routeSeedPending) return;
    dispatch(setSelectedAccountId(routeAccountId));
    navigation.setParams({ accountId: undefined });
  }, [dispatch, navigation, routeSeedPending, routeAccountId]);

  // 선택 계좌가 확정되면 API-11을 조회한다(계좌 변경 시 reducer가 이전 상세를 비우고 이전 응답을 무시한다).
  // 송금 완료로 계좌 데이터가 무효화되면(accountDataVersion 증가) 같은 계좌여도 다시 조회한다.
  useEffect(() => {
    if (!hasAccounts || selectedAccountId == null || routeSeedPending) return;
    dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
  }, [dispatch, hasAccounts, selectedAccountId, routeSeedPending, accountDataVersion]);

  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? null;
  // 선택 계좌와 같은 계좌의 상세만 사용한다(다른 계좌의 이전 상세·거래를 보여주지 않는다).
  const detail =
    selectedAccountId != null && accountDetailAccountId === selectedAccountId
      ? accountDetail
      : null;

  // 실제 계좌번호는 선택 계좌와 일치하는 상세에서만 나온다. 복사값은 서버 원문(하이픈 없음), 화면 표시는 포맷 문자열이다.
  const copyableAccountNumber = getCopyableAccountNumber(detail, selectedAccountId);
  const accountNumberText = copyableAccountNumber
    ? formatAccountNumber(copyableAccountNumber)
    : null;
  const visibleCopyNotice =
    copyNotice && copyNotice.accountId === selectedAccountId ? copyNotice : null;

  useEffect(() => {
    if (!copyNotice) return undefined;
    const timer = setTimeout(() => setCopyNotice(null), COPY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [copyNotice]);

  const handleCopyAccountNumber = async () => {
    if (!copyableAccountNumber) return;
    const targetAccountId = selectedAccountId;
    const copied = await copyTextToClipboard(copyableAccountNumber);
    setCopyNotice({ accountId: targetAccountId, ok: copied });
  };

  const isRefreshing = refreshingAccountId != null && refreshingAccountId === selectedAccountId;
  const detailErrorMessage = !detail && !accountDetailLoading ? accountDetailError : null;

  // 송금 후 서버 잔액을 아직 확인하지 못한 계좌는 목록의 이전 잔액을 보여주지 않는다(확인 중 / 확인 실패).
  const balanceStale = isBalanceStale(staleBalanceAccountIds, selectedAccountId);
  const balanceCheckFailed =
    balanceStale && !detail && !accountDetailLoading && !!accountDetailError;

  const balanceSource = detail ?? selectedAccount;
  let balanceText = balanceSource
    ? formatExactMoney(balanceSource.balance, balanceSource.balanceExact)
    : '-';
  if (balanceStale) balanceText = balanceCheckFailed ? '-' : BALANCE_CHECKING_TEXT;

  const handleRetryDetail = () => {
    if (selectedAccountId == null) return;
    dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
  };

  const handleRefresh = () => {
    if (selectedAccountId == null) {
      if (!accountsLoading) dispatch(fetchAccounts());
      return;
    }
    // 상세 조회가 실패한 상태면 API-11을 다시 조회하고, 그 외에는 API-14(새로고침)를 요청한다.
    if (detailErrorMessage) {
      dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
      return;
    }
    dispatch(refreshAccount({ accountId: selectedAccountId }));
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const canTransfer = canTransferFrom(selectedAccount);

  const handleTransferPress = () => {
    if (!canTransfer) return;
    navigation.navigate(ROUTES.TRANSFER, { fromAccountId: selectedAccountId });
  };

  const handleHistoryPress = () =>
    navigation.navigate(ROUTES.TRANSACTION_HISTORY, { accountId: selectedAccountId });

  // 최근 거래는 선택 계좌와 일치하는 상세에서만 열 수 있다(다른 계좌의 거래 상세로 이동하지 않는다).
  const handleTransactionPress = tx =>
    navigation.navigate(ROUTES.TRANSACTION_DETAIL, {
      accountId: selectedAccountId,
      transactionId: tx.id,
    });

  return (
    <AccountDetailView
      titleText={resolveAccountTitle(selectedAccount, detail) ?? '계좌를 선택해 주세요'}
      balanceText={balanceText}
      statusNotice={getAccountStatusNotice(selectedAccount)}
      sync={describeSyncStatus(detail)}
      canTransfer={canTransfer}
      isRecentTransactionsSupported={true}
      isRecentLoading={Boolean(selectedAccountId) && !detail && accountDetailLoading}
      recentTransactions={detail?.transactionHistory ?? []}
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      onSelectAccount={id => dispatch(setSelectedAccountId(id))}
      isLoading={accountsLoading && accounts.length === 0}
      isError={Boolean(accountsError) && accounts.length === 0}
      errorMessage={accountsError}
      onRetry={() => dispatch(fetchAccounts())}
      accountNumberText={accountNumberText}
      canCopyAccountNumber={copyableAccountNumber !== null}
      onCopyAccountNumber={handleCopyAccountNumber}
      copyNotice={
        visibleCopyNotice
          ? {
              message: visibleCopyNotice.ok ? COPY_SUCCESS_MESSAGE : COPY_FAILURE_MESSAGE,
              isError: !visibleCopyNotice.ok,
            }
          : null
      }
      detailError={detailErrorMessage}
      onRetryDetail={handleRetryDetail}
      refreshError={
        balanceCheckFailed
          ? BALANCE_CHECK_FAILED_MESSAGE
          : (refreshError ?? (hasAccounts ? accountsError : null))
      }
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
      onBack={handleBack}
      onTransferPress={handleTransferPress}
      onHistoryPress={handleHistoryPress}
      onTransactionPress={detail ? handleTransactionPress : undefined}
    />
  );
}
