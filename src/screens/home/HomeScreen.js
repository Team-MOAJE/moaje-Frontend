import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../../components/home/AppHeader';
import DailyLimitCard from '../../components/home/DailyLimitCard';
import AccountLedgerCard from '../../components/home/AccountLedgerCard';
import QuickActions from '../../components/home/QuickActions';
import CashFlowSummaryCard from '../../components/home/CashFlowSummaryCard';
import BottomNavBar from '../../components/home/BottomNavBar';
import { colors } from '../../theme';
import { ROUTES } from '../../constants/routes';

export default function HomeScreen({ navigation }) {
  const handleBellPress = () => {};
  const handleTransferPress = () => {};
  const handleConnectAccountPress = () => {};
  const handleTransactionHistoryPress = () => {};
  const handleAnalysisPress = () => {};
  const handleBottomHomePress = () => {};
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomChartPress = () => {};
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
          <AppHeader onBellPress={handleBellPress} />
          <DailyLimitCard />
          <AccountLedgerCard />
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
