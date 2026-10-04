import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';

import HomeSafeAmountSection from '../../components/home/HomeSafeAmountSection';
import HomeMiniTabs from '../../components/home/HomeMiniTabs';
import HomeAccountTab from '../../components/home/HomeAccountTab';
import HomeMoneyTypeTab from '../../components/home/HomeMoneyTypeTab';
import BottomNavBar from '../../components/home/BottomNavBar';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts } from '../../features/asset/assetApi';
import { fetchDailyLimit } from '../../features/work/workApi';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import { buildFinancialOnboardingResultViewModel } from '../../features/onboarding/buildFinancialOnboardingResultViewModel';

// 실제 데이터 소스가 있는 탭만 노출한다. (거래내역 요약/생활비 분석은 연동 API가 생기면 추가)
const HOME_TABS = [
  { key: 'account', label: '계좌' },
  { key: 'moneyType', label: '머니 타입' },
];

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const formatMonthDay = date => `${date.getMonth() + 1}월 ${date.getDate()}일`;

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);
  const accounts = useSelector(state => state.asset.accounts);
  const dailyLimit = useSelector(state => state.work.dailyLimit);

  const [activeTab, setActiveTab] = useState('account');
  const [moneyTypeProfile, setMoneyTypeProfile] = useState(null);

  const userId = user?.userId;
  const repository = useMemo(() => getOnboardingRepository(userId ?? 'guest'), [userId]);

  const today = useMemo(() => new Date(), []);
  const dateLabel = `${formatMonthDay(today)} ${WEEKDAY_NAMES[today.getDay()]}`;

  useEffect(() => {
    dispatch(fetchAccounts());
    dispatch(fetchDailyLimit());
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const loadMoneyType = async () => {
      try {
        const result = await repository.loadResult();
        if (cancelled || !result?.answers) return;
        setMoneyTypeProfile(buildFinancialOnboardingResultViewModel(result.answers).profile);
      } catch (e) {
        // 결과를 읽지 못하면 빈 상태를 유지한다.
      }
    };
    loadMoneyType();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const accountItems = useMemo(
    () =>
      (accounts ?? []).map(account => ({
        id: account.id,
        name: account.bankName,
        token: account.tokenId,
        balance: account.balance,
      })),
    [accounts]
  );
  const totalBalance = accountItems.reduce(
    (sum, account) => sum + (Number(account.balance) || 0),
    0
  );

  const amount = dailyLimit?.amount;
  const usedToday = dailyLimit?.spent ?? 0;
  const remaining = Math.max((amount ?? 0) - usedToday, 0);

  const handleWhyPress = () => navigation.navigate(ROUTES.DAILY_LIMIT);
  const handleAccountPress = () => navigation.navigate(ROUTES.ACCOUNT_DETAIL);
  const handleConnectAccountPress = () => {};
  const handleFutureProfilePress = () => navigation.navigate(ROUTES.FINANCIAL_ONBOARDING_RESULT);
  const handleBottomHomePress = () => {};
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'moneyType':
        return (
          <HomeMoneyTypeTab profile={moneyTypeProfile} onDetailPress={handleFutureProfilePress} />
        );
      case 'account':
      default:
        return (
          <HomeAccountTab
            accounts={accountItems}
            totalBalance={totalBalance}
            onAccountPress={handleAccountPress}
            onConnectPress={handleConnectAccountPress}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {amount != null && (
            <HomeSafeAmountSection
              amount={amount}
              usedToday={usedToday}
              remaining={remaining}
              nextIncomeDays={dailyLimit?.daysLeft}
              dateLabel={dateLabel}
              onWhyPress={handleWhyPress}
            />
          )}

          <View style={styles.tabsWrap}>
            <HomeMiniTabs tabs={HOME_TABS} activeKey={activeTab} onChange={setActiveTab} />
          </View>

          <View style={styles.tabContent}>{renderTabContent()}</View>
        </ScrollView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onCategoryPress={handleBottomCategoryPress}
          activeKey="home"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingBottom: 110,
  },
  tabsWrap: {
    marginTop: 48,
  },
  tabContent: {
    marginTop: 32,
  },
});
