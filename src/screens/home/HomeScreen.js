import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';

import AppHeader from '../../components/home/AppHeader';
import DailyLimitCard from '../../components/home/DailyLimitCard';
import AccountLedgerCard from '../../components/home/AccountLedgerCard';
import QuickActions from '../../components/home/QuickActions';
import CashFlowSummaryCard from '../../components/home/CashFlowSummaryCard';
import BottomNavBar from '../../components/home/BottomNavBar';
import { colors } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts } from '../../features/asset/assetApi';
import { fetchDailyLimit } from '../../features/work/workApi';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);
  const accounts = useSelector(state => state.asset.accounts);
  const dailyLimit = useSelector(state => state.work.dailyLimit);
  const defaultAccount = selectDefaultAccount(accounts);

  useEffect(() => {
    dispatch(fetchAccounts());
    dispatch(fetchDailyLimit());
  }, [dispatch]);

  const handleBellPress = () => {};
  const handleTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleConnectAccountPress = () => {};
  const handleTransactionHistoryPress = () => navigation.navigate(ROUTES.TRANSACTION_HISTORY);
  const handleAnalysisPress = () => navigation.navigate(ROUTES.DAILY_LIMIT);
  const handleBottomHomePress = () => {};
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomChartPress = () => navigation.navigate(ROUTES.DAILY_LIMIT);
  const handleBottomGridPress = () => {
    navigation.navigate(ROUTES.CATEGORY);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <AppHeader onBellPress={handleBellPress} userName={user?.name} />
          <DailyLimitCard
            onPress={() => navigation.navigate(ROUTES.DAILY_LIMIT)}
            amount={dailyLimit?.amount}
            daysLeft={dailyLimit?.daysLeft}
            formulaItems={dailyLimit?.formulaItems}
          />
          <AccountLedgerCard
            bankName={defaultAccount?.bankName}
            tokenId={defaultAccount?.tokenId}
            balance={defaultAccount?.balance}
            onPress={() => navigation.navigate(ROUTES.ACCOUNT_DETAIL)}
          />
          <QuickActions
            onTransfer={handleTransferPress}
            onConnect={handleConnectAccountPress}
            onHistory={handleTransactionHistoryPress}
            onAnalysis={handleAnalysisPress}
          />
          <CashFlowSummaryCard />
          <View style={styles.bottomSpacer} />
        </ScrollView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onChartPress={handleBottomChartPress}
          onGridPress={handleBottomGridPress}
          activeKey="home"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  bottomSpacer: {
    height: 8,
  },
});
