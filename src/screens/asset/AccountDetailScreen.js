import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ROUTES } from '../../constants/routes';
import { fetchAccountDetail, fetchAccounts, refreshAccount } from '../../features/asset/assetApi';
import { setSelectedAccountId } from '../../features/asset/assetSlice';
import {
  canTransferFrom,
  describeSyncStatus,
  formatExactMoney,
  getAccountStatusNotice,
} from '../../features/asset/assetScreenLogic';
import AccountDetailView from '../../components/asset/AccountDetailView';

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
  } = useSelector(state => state.asset);

  const routeAccountId = route?.params?.accountId;
  const hasAccounts = accounts.length > 0;
  // route로 받은 accountId가 목록에 있으면 그 계좌를 우선 선택한다. 목록에 없으면 무시하고 Redux 선택 상태를 따른다.
  const routeSeedPending =
    typeof routeAccountId === 'string' &&
    routeAccountId !== selectedAccountId &&
    accounts.some(account => account.id === routeAccountId);

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  useEffect(() => {
    if (routeSeedPending) dispatch(setSelectedAccountId(routeAccountId));
  }, [dispatch, routeSeedPending, routeAccountId]);

  // 선택 계좌가 확정되면 API-11을 조회한다(계좌 변경 시 reducer가 이전 상세를 비우고 이전 응답을 무시한다).
  useEffect(() => {
    if (!hasAccounts || selectedAccountId == null || routeSeedPending) return;
    dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
  }, [dispatch, hasAccounts, selectedAccountId, routeSeedPending]);

  const selectedAccount = accounts.find(account => account.id === selectedAccountId) ?? null;
  // 선택 계좌와 같은 계좌의 상세만 사용한다(다른 계좌의 이전 상세·거래를 보여주지 않는다).
  const detail =
    selectedAccountId != null && accountDetailAccountId === selectedAccountId
      ? accountDetail
      : null;

  const balanceSource = detail ?? selectedAccount;
  const balanceText = balanceSource
    ? formatExactMoney(balanceSource.balance, balanceSource.balanceExact)
    : '-';

  const isRefreshing = refreshingAccountId != null && refreshingAccountId === selectedAccountId;
  const detailErrorMessage = !detail && !accountDetailLoading ? accountDetailError : null;

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
      titleText={selectedAccount?.label ?? '계좌를 선택해 주세요'}
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
      refreshError={refreshError ?? detailErrorMessage ?? (hasAccounts ? accountsError : null)}
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
      onBack={handleBack}
      onTransferPress={handleTransferPress}
      onHistoryPress={handleHistoryPress}
      onTransactionPress={detail ? handleTransactionPress : undefined}
    />
  );
}
