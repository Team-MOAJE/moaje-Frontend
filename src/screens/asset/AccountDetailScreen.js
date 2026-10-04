import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts } from '../../features/asset/assetApi';
import { setSelectedAccountId } from '../../features/asset/assetSlice';
import AccountDetailView from '../../components/asset/AccountDetailView';

export default function AccountDetailScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const { accounts, accountsLoading, accountsError, selectedAccountId } = useSelector(
    state => state.asset
  );

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  // 계좌 선택 우선순위: route.params.accountId(최초 진입 시드) → Redux selectedAccountId
  // → isPrimary 계좌 → 첫 번째 계좌. accounts가 로드된 뒤에만 판단한다.
  useEffect(() => {
    if (accounts.length === 0) return;
    const ids = accounts.map(a => a.id);
    const routeAccountId = route?.params?.accountId;

    if (
      routeAccountId != null &&
      ids.includes(routeAccountId) &&
      selectedAccountId !== routeAccountId
    ) {
      dispatch(setSelectedAccountId(routeAccountId));
      return;
    }

    if (selectedAccountId == null || !ids.includes(selectedAccountId)) {
      const primary = accounts.find(a => a.isPrimary);
      dispatch(setSelectedAccountId(primary?.id ?? accounts[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null;

  const handleRefresh = () => {
    if (accountsLoading) return;
    dispatch(fetchAccounts());
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleTransferPress = () => {
    navigation.navigate(ROUTES.TRANSFER, { fromAccountId: selectedAccountId });
  };

  const handleHistoryPress = () => navigation.navigate(ROUTES.TRANSACTION_HISTORY);

  return (
    <AccountDetailView
      bankName={selectedAccount?.bankName}
      accountLabel={null}
      maskedAccountNumber={null}
      currentBalance={selectedAccount?.balance}
      isAvailableBalanceSupported={false}
      availableBalance={null}
      isRecentTransactionsSupported={false}
      recentTransactions={[]}
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      onSelectAccount={id => dispatch(setSelectedAccountId(id))}
      isLoading={accountsLoading && accounts.length === 0}
      isError={Boolean(accountsError) && accounts.length === 0}
      errorMessage={accountsError}
      onRetry={handleRefresh}
      refreshError={accounts.length > 0 ? accountsError : null}
      isRefreshing={accountsLoading && accounts.length > 0}
      onRefresh={handleRefresh}
      onBack={handleBack}
      onTransferPress={handleTransferPress}
      onHistoryPress={handleHistoryPress}
    />
  );
}
