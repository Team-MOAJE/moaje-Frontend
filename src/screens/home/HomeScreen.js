import React, { useEffect, useMemo, useState } from 'react';
import { AppState, View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';

import HomeSafeAmountSection from '../../components/home/HomeSafeAmountSection';
import HomeMiniTabs from '../../components/home/HomeMiniTabs';
import HomeAccountTab from '../../components/home/HomeAccountTab';
import HomeTransactionTab from '../../components/home/HomeTransactionTab';
import HomeExpenseAnalysisTab from '../../components/home/HomeExpenseAnalysisTab';
import HomeMoneyTypeTab from '../../components/home/HomeMoneyTypeTab';
import HomeFutureProfileGuide from '../../components/home/HomeFutureProfileGuide';
import MoneyRecapPreview from '../../components/home/MoneyRecapPreview';
import BottomNavBar from '../../components/home/BottomNavBar';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import {
  fetchAccountDetail,
  fetchAccounts,
  syncDailyLimitForToday,
} from '../../features/asset/assetApi';
import { loadHomeExpense } from '../../features/asset/homeExpenseThunk';
import {
  buildHomeAccountItems,
  resolveHomeAccountsState,
} from '../../features/asset/assetScreenLogic';
import {
  getCurrentYearMonth,
  getLocalDateKey,
  isDailyLimitCurrent,
  msUntilNextLocalMidnight,
  toDisplayWon,
} from '../../features/asset/cashflowScreenLogic';
import {
  buildHomeExpenseView,
  buildHomeSpendingSummary,
  buildHomeTransactionItems,
  buildTransactionDetailParams,
  resolveHomeTransactionsState,
  shouldFetchHomeAccountDetail,
  shouldLoadHomeExpense,
} from '../../features/asset/homeTabLogic';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import { buildFinancialOnboardingResultViewModel } from '../../features/onboarding/buildFinancialOnboardingResultViewModel';
import { WORK_ONBOARDING_ENABLED } from '../../features/onboarding/workOnboardingConfig';
import { resolveHomeMoneyTypeView } from '../../features/onboarding/workOnboardingNavigation';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import {
  HOME_MONEY_TYPE_KIND,
  resolveHomeMoneyTypeTab,
} from '../../features/onboarding/homeMoneyTypeLogic';
import useHomeFutureProfile from '../../features/onboarding/useHomeFutureProfile';

// 실제 서버 데이터가 있는 탭만 노출한다(거래내역: API-11, 생활비 분석: API-16/17).
const HOME_TABS = [
  { key: 'account', label: '계좌' },
  { key: 'transactions', label: '거래내역' },
  { key: 'analysis', label: '생활비 분석' },
  { key: 'moneyType', label: '머니 타입' },
];

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const formatMonthDay = date => `${date.getMonth() + 1}월 ${date.getDate()}일`;

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const accountsError = useSelector(state => state.asset.accountsError);
  const staleBalanceAccountIds = useSelector(state => state.asset.staleBalanceAccountIds);
  // API-15 서버 계산 결과. 사용자가 오늘의 가용금액 화면에서 입력해 계산했을 때만 있다(홈이 입력 없이 자동 호출하지 않는다).
  const dailyLimit = useSelector(state => state.asset.cashflowDaily.result);
  const dailyLimitMeta = useSelector(state => state.asset.dailyLimitMeta);
  // 거래내역 탭: 선택 계좌 한 곳의 API-11 상세만 사용한다(계좌 간 합산 없음).
  const selectedAccountId = useSelector(state => state.asset.selectedAccountId);
  const accountDetail = useSelector(state => state.asset.accountDetail);
  const accountDetailAccountId = useSelector(state => state.asset.accountDetailAccountId);
  const accountDetailLoading = useSelector(state => state.asset.accountDetailLoading);
  const accountDetailError = useSelector(state => state.asset.accountDetailError);
  // 생활비 분석 탭: AnalysisScreen과 같은 Cashflow 상태를 재사용한다.
  const cashflowYearMonth = useSelector(state => state.asset.cashflowYearMonth);
  const cashflowMonthly = useSelector(state => state.asset.cashflowMonthly);
  const cashflowCategory = useSelector(state => state.asset.cashflowCategory);

  const [activeTab, setActiveTab] = useState('account');
  // 첫 계좌 요청을 보내기 전에는 "계좌 없음"이 아니라 로딩으로 본다(서버 데이터가 아닌 화면 플래그).
  const [accountsRequested, setAccountsRequested] = useState(false);
  const [moneyTypeProfile, setMoneyTypeProfile] = useState(null);

  const userId = user?.userId;
  const repository = useMemo(() => getOnboardingRepository(userId ?? 'guest'), [userId]);

  // 날짜 표시와 API-15 결과 유효성의 기준 시각. 앱 활성화·자정 통과 때 갱신된다.
  const [today, setToday] = useState(() => new Date());
  const todayKey = getLocalDateKey(today);
  const dateLabel = `${formatMonthDay(today)} ${WEEKDAY_NAMES[today.getDay()]}`;

  // API-15 결과 복원/만료 확인(서버 호출 없음). 홈 진입·사용자 변경, 앱 포그라운드 복귀, 홈이 켜진 채 자정 통과 시 실행한다.
  useEffect(() => {
    let timerId = null;
    const check = () => {
      setToday(new Date());
      dispatch(syncDailyLimitForToday());
    };
    const scheduleMidnightCheck = () => {
      timerId = setTimeout(() => {
        check();
        scheduleMidnightCheck();
      }, msUntilNextLocalMidnight());
    };
    check();
    scheduleMidnightCheck();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') check();
    });
    return () => {
      clearTimeout(timerId);
      subscription.remove();
    };
  }, [dispatch, userId]);

  useEffect(() => {
    dispatch(fetchAccounts());
    setAccountsRequested(true);
  }, [dispatch]);

  useEffect(() => {
    // 서버 온보딩(기능 플래그 on)에서는 기존 로컬 머니 타입을 읽지도 계산하지도 않는다(서버 결과와 혼합 금지).
    if (WORK_ONBOARDING_ENABLED) return undefined;
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

  // 서버 Future Profile(API-35): 머니 타입 탭이 열렸고 현재 사용자의 결과가 없을 때만 1회 요청한다(자동 재시도 없음).
  const profileUserId = isValidOnboardingUserId(userId) ? userId : null;
  const { profileState: futureProfileState, retry: handleFutureProfileRetry } =
    useHomeFutureProfile({
      enabled: WORK_ONBOARDING_ENABLED && activeTab === 'moneyType',
      userId: profileUserId,
    });

  // 거래내역 탭이 열렸고 선택 계좌의 상세가 없을 때만 API-11을 요청한다(실패 시 자동 재시도 없음).
  useEffect(() => {
    if (activeTab !== 'transactions') return;
    if (
      shouldFetchHomeAccountDetail({
        selectedAccountId,
        detailAccountId: accountDetailAccountId,
        loading: accountDetailLoading,
        error: accountDetailError,
      })
    ) {
      dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
    }
  }, [
    activeTab,
    dispatch,
    selectedAccountId,
    accountDetailAccountId,
    accountDetailLoading,
    accountDetailError,
  ]);

  const currentYearMonth = useMemo(() => getCurrentYearMonth(), []);
  const loadExpense = () => dispatch(loadHomeExpense(currentYearMonth));
  // 생활비 분석·머니 타입(소비 요약) 탭이 열렸고 현재 월 데이터가 없을 때만 API-16/17을 요청한다(실패 시 자동 재시도 없음).
  useEffect(() => {
    if (activeTab !== 'analysis' && activeTab !== 'moneyType') return;
    if (
      shouldLoadHomeExpense({
        currentYearMonth,
        yearMonth: cashflowYearMonth,
        monthly: cashflowMonthly,
        category: cashflowCategory,
      })
    ) {
      loadExpense();
    }
    // loadExpense는 dispatch와 currentYearMonth에만 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentYearMonth, cashflowYearMonth, cashflowMonthly, cashflowCategory]);

  // 서버에 총잔액 API가 없으므로 계좌 잔액을 합산하지 않는다(null·부정확 잔액이 0원으로 섞이는 것도 방지).
  const accountItems = useMemo(
    () => buildHomeAccountItems(accounts, staleBalanceAccountIds),
    [accounts, staleBalanceAccountIds]
  );
  const accountsState = resolveHomeAccountsState({
    accounts,
    loading: accountsLoading,
    error: accountsError,
    fetched: accountsRequested,
  });

  const transactionsState = resolveHomeTransactionsState({
    selectedAccountId,
    detail: accountDetail,
    detailAccountId: accountDetailAccountId,
    loading: accountDetailLoading,
    error: accountDetailError,
  });
  const transactionItems = useMemo(
    () =>
      transactionsState === 'list'
        ? buildHomeTransactionItems(accountDetail.transactionHistory)
        : [],
    [transactionsState, accountDetail]
  );
  // 계좌가 여러 개일 때만 어느 계좌의 거래인지 표시한다.
  const selectedAccountLabel =
    accounts.length > 1
      ? (accounts.find(account => account.id === selectedAccountId)?.label ?? null)
      : null;
  const expenseView = buildHomeExpenseView({
    yearMonth: cashflowYearMonth,
    monthly: cashflowMonthly,
    category: cashflowCategory,
  });

  // 머니 타입 탭 소비 요약: 이번 달 API-16/17 결과만 사용한다. 조회 월이 이번 달이 아니면 로딩으로 두고 위 효과가 이번 달을 요청한다.
  const spendingSummary = buildHomeSpendingSummary(
    cashflowYearMonth === currentYearMonth
      ? { yearMonth: cashflowYearMonth, monthly: cashflowMonthly, category: cashflowCategory }
      : { yearMonth: currentYearMonth }
  );

  // 서버 dailyLimit(소수 4자리)을 표시할 때만 원 미만을 버린다. 오늘 쓴 돈/남은 돈은 서버가 주지 않아 표시하지 않는다.
  // 계산일이 오늘이 아닌 결과(어제 금액)는 표시하지 않고 기존 "계산하기" 상태로 둔다.
  const amount =
    dailyLimit && isDailyLimitCurrent(dailyLimitMeta.calculatedOn, todayKey)
      ? toDisplayWon(dailyLimit.dailyLimit)
      : null;

  const handleWhyPress = () => navigation.navigate(ROUTES.DAILY_LIMIT);
  // accountId는 문자열 그대로 전달한다(Number 변환 금지).
  const handleAccountPress = account => {
    const valid = typeof account?.id === 'string' && account.id !== '';
    if (__DEV__) {
      // 개발 모드 진단: 계좌 식별값·잔액은 남기지 않고 이동 호출 여부와 id 형식만 기록한다.
      console.log('[Home] account press', { navigate: valid, idType: typeof account?.id });
    }
    if (!valid) return;
    navigation.navigate(ROUTES.ACCOUNT_DETAIL, { accountId: account.id });
  };
  const handleTransactionsRetry = () => {
    if (selectedAccountId != null) dispatch(fetchAccountDetail({ accountId: selectedAccountId }));
  };
  const handleTransactionPress = tx => {
    const params = buildTransactionDetailParams(selectedAccountId, tx.id);
    if (params) navigation.navigate(ROUTES.TRANSACTION_DETAIL, params);
  };
  const handleViewAllTransactionsPress = () =>
    navigation.navigate(
      ROUTES.TRANSACTION_HISTORY,
      selectedAccountId != null ? { accountId: selectedAccountId } : undefined
    );
  const handleAnalysisDetailPress = () => navigation.navigate(ROUTES.ANALYSIS);
  const handleAccountsRetry = () => dispatch(fetchAccounts());
  // 시연용 Mock 계좌 개설 화면(API-09). 기존 계좌 연결 기능과는 다르다.
  const handleNewAccountPress = () => navigation.navigate(ROUTES.ACCOUNT_OPEN);
  const moneyTypeView = resolveHomeMoneyTypeView({ flagEnabled: WORK_ONBOARDING_ENABLED });
  const handleFutureProfilePress = () =>
    navigation.navigate(
      WORK_ONBOARDING_ENABLED
        ? ROUTES.WORK_FINANCIAL_ONBOARDING_RESULT
        : ROUTES.FINANCIAL_ONBOARDING_RESULT
    );
  const handleServerGuidePress = () => {
    if (moneyTypeView.kind === 'server_guide') navigation.dispatch(moneyTypeView.action);
  };
  const handleBottomHomePress = () => {};
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transactions':
        return (
          <HomeTransactionTab
            state={transactionsState}
            transactions={transactionItems}
            accountLabel={selectedAccountLabel}
            errorMessage={accountDetailError}
            onRetry={handleTransactionsRetry}
            onTransactionPress={handleTransactionPress}
            onViewAllPress={handleViewAllTransactionsPress}
          />
        );
      case 'analysis':
        return (
          <HomeExpenseAnalysisTab
            state={expenseView.state}
            monthLabel={expenseView.monthLabel}
            totalText={expenseView.totalText}
            topCategoryName={expenseView.topCategoryName}
            rows={expenseView.rows}
            onRetry={loadExpense}
            onDetailPress={handleAnalysisDetailPress}
          />
        );
      case 'moneyType': {
        const moneyTypeTab = resolveHomeMoneyTypeTab({
          flagEnabled: WORK_ONBOARDING_ENABLED,
          userId: profileUserId,
          profileState: futureProfileState,
          localProfile: moneyTypeProfile,
        });
        if (moneyTypeTab.kind === HOME_MONEY_TYPE_KIND.GUIDE) {
          return (
            <View>
              <HomeFutureProfileGuide
                title={moneyTypeTab.guide.title}
                message={moneyTypeTab.guide.message}
                ctaLabel={moneyTypeTab.guide.ctaLabel}
                onPress={handleServerGuidePress}
              />
              <MoneyRecapPreview recap={spendingSummary} onPress={handleAnalysisDetailPress} />
            </View>
          );
        }
        return (
          <HomeMoneyTypeTab
            profile={moneyTypeTab.profile}
            status={
              moneyTypeTab.kind === HOME_MONEY_TYPE_KIND.LOADING
                ? 'loading'
                : moneyTypeTab.kind === HOME_MONEY_TYPE_KIND.ERROR
                  ? 'error'
                  : 'ready'
            }
            recap={spendingSummary}
            onRecapPress={handleAnalysisDetailPress}
            onDetailPress={handleFutureProfilePress}
            onRetry={handleFutureProfileRetry}
          />
        );
      }
      case 'account':
      default:
        return (
          <HomeAccountTab
            state={accountsState}
            accounts={accountItems}
            errorMessage={accountsError}
            onRetry={handleAccountsRetry}
            onAccountPress={handleAccountPress}
            onNewAccountPress={handleNewAccountPress}
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
          <HomeSafeAmountSection
            amount={amount}
            nextIncomeDays={dailyLimit?.daysUntilNextPayday}
            dateLabel={dateLabel}
            onWhyPress={handleWhyPress}
            onCalculatePress={handleWhyPress}
          />

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
