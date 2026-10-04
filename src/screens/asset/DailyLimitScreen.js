import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchDailyLimit } from '../../features/work/workApi';
import DailyLimitHeroCard from '../../components/dailylimit/DailyLimitHeroCard';
import DailyLimitStatusCard from '../../components/dailylimit/DailyLimitStatusCard';
import DailyLimitFormulaCard from '../../components/dailylimit/DailyLimitFormulaCard';
import BottomNavBar from '../../components/home/BottomNavBar';

// ── 금액 포맷 유틸 ─────────────────────────────────────────────
const formatCurrency = amount => `${Number(amount).toLocaleString()}원`;

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// ── 서버 상태값 → UI 상태 매핑 ────────────────────────────────
const mapDailyLimitStatus = serverStatus => {
  switch (serverStatus) {
    case 'SAFE':
    case 'safe':
      return 'safe';
    case 'WARNING':
    case 'warning':
      return 'warning';
    case 'EXCEEDED':
    case 'exceeded':
      return 'exceeded';
    default:
      // UNKNOWN, RECONCILIATION_REQUIRED 등 내부 상태값은 사용자에게 직접 표시 안 함
      return 'safe';
  }
};

// ── 메인 화면 ──────────────────────────────────────────────────
export default function DailyLimitScreen({ navigation }) {
  const dispatch = useDispatch();
  const dailyLimit = useSelector(state => state.work.dailyLimit);

  useEffect(() => {
    dispatch(fetchDailyLimit());
  }, [dispatch]);

  const today = useMemo(() => new Date(), []);
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 ${WEEKDAY_NAMES[today.getDay()]}`;

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleBottomHomePress = () => navigation.navigate(ROUTES.HOME);
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);
  // TODO: 오늘 거래만 필터링하려면 TransactionHistory가 기간 params를 받아야 한다(현재는 전체 내역).
  const handleViewTodaySpendingPress = () => navigation.navigate(ROUTES.TRANSACTION_HISTORY);

  // formulaItems를 표시용으로 변환 (number → 포맷 문자열)
  const formattedFormulaItems = (dailyLimit?.formulaItems ?? []).map(item => ({
    ...item,
    displayValue: item.unit ? `${item.value}${item.unit}` : formatCurrency(item.value),
  }));

  const uiStatus = mapDailyLimitStatus(dailyLimit?.status);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={24} color={redesign.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>오늘의 가용금액</Text>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {dailyLimit && (
            <>
              <DailyLimitHeroCard
                amount={dailyLimit.amount}
                spent={dailyLimit.spent}
                daysLeft={dailyLimit.daysLeft}
              />

              <View style={styles.status}>
                <DailyLimitStatusCard status={uiStatus} />
              </View>

              <View style={styles.formula}>
                <DailyLimitFormulaCard
                  title={`${formatCurrency(dailyLimit.amount)}은 이렇게 계산했어요`}
                  items={formattedFormulaItems}
                />
              </View>
            </>
          )}

          <Pressable
            onPress={handleViewTodaySpendingPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="오늘 쓴 돈 보기"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>오늘 쓴 돈 보기</Text>
            <Text style={styles.linkChevron}>›</Text>
          </Pressable>

          <View style={styles.bottomPad} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    marginLeft: -8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginLeft: 4,
  },
  headerDate: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 28,
    paddingBottom: 110,
  },
  status: {
    marginTop: 28,
  },
  formula: {
    marginTop: 44,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 32,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.accent,
  },
  linkChevron: {
    fontSize: 18,
    color: redesign.accent,
    marginLeft: 6,
  },
  pressed: {
    opacity: 0.6,
  },
  bottomPad: {
    height: 8,
  },
});
