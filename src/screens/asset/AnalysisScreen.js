import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import BottomNavBar from '../../components/home/BottomNavBar';
import { loadCategoryCashflow, loadMonthlyCashflow } from '../../features/asset/assetApi';
import { setCashflowYearMonth } from '../../features/asset/assetSlice';
import {
  buildCategoryRows,
  buildMonthlySummaryRows,
  formatYearMonthLabel,
  getCurrentYearMonth,
  hasRevisionMismatch,
  isCashflowEmpty,
  isFutureYearMonth,
  resolveCashflowViewState,
  shiftYearMonth,
} from '../../features/asset/cashflowScreenLogic';

// 월별 수입·지출·자금이동(API-16)과 카테고리별 소비(API-17). 서버가 내려준 값만 표시한다.
// - 수입/지출/자금이동은 서로 합산하지 않고 따로 보여준다. 카테고리 비율(%)은 서버에 없으므로 표시하지 않는다.
// - 두 API는 같은 조회 월(state.asset.cashflowYearMonth)로 요청한다.
export default function AnalysisScreen({ navigation }) {
  const dispatch = useDispatch();
  const yearMonth = useSelector(state => state.asset.cashflowYearMonth);
  const monthly = useSelector(state => state.asset.cashflowMonthly);
  const category = useSelector(state => state.asset.cashflowCategory);

  const currentYearMonth = useMemo(() => getCurrentYearMonth(), []);

  // 월을 정하고 두 API를 한 번씩 요청한다(자동 반복·자동 재시도 없음). 월이 바뀌면 이전 월의 응답은 reducer가 버린다.
  const selectMonth = nextYearMonth => {
    if (!nextYearMonth || isFutureYearMonth(nextYearMonth, currentYearMonth)) return;
    dispatch(setCashflowYearMonth(nextYearMonth));
    dispatch(loadMonthlyCashflow(nextYearMonth));
    dispatch(loadCategoryCashflow(nextYearMonth));
  };

  useEffect(() => {
    selectMonth(currentYearMonth);
    // 화면 진입 시 한 번만 현재 월로 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate(ROUTES.HOME);
  };
  const handleBottomHomePress = () => navigation.navigate(ROUTES.HOME);
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);

  const handlePrevMonth = () => selectMonth(shiftYearMonth(yearMonth, -1));
  const handleNextMonth = () => selectMonth(shiftYearMonth(yearMonth, 1));
  const canGoNext =
    yearMonth != null && !isFutureYearMonth(shiftYearMonth(yearMonth, 1), currentYearMonth);

  const retryMonthly = () => {
    if (yearMonth) dispatch(loadMonthlyCashflow(yearMonth));
  };
  const retryCategory = () => {
    if (yearMonth) dispatch(loadCategoryCashflow(yearMonth));
  };
  const reloadBoth = () => {
    retryMonthly();
    retryCategory();
  };

  const monthlyView = resolveCashflowViewState(monthly);
  const categoryView = resolveCashflowViewState(category);
  const summaryRows = buildMonthlySummaryRows(monthly.data);
  const categoryRows = buildCategoryRows(category.data?.categories);
  const empty = isCashflowEmpty(monthly.data, category.data);
  const mismatch = hasRevisionMismatch(monthly.data, category.data);

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
          <Text style={styles.headerTitle}>월별 분석</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.monthRow}>
            <Pressable
              onPress={handlePrevMonth}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="이전 달"
              disabled={yearMonth == null}
              style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}
            >
              <Feather name="chevron-left" size={22} color={redesign.textPrimary} />
            </Pressable>
            <Text style={styles.monthLabel}>{formatYearMonthLabel(yearMonth)}</Text>
            <Pressable
              onPress={handleNextMonth}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              disabled={!canGoNext}
              style={({ pressed }) => [
                styles.monthBtn,
                !canGoNext && styles.monthBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="chevron-right" size={22} color={redesign.textPrimary} />
            </Pressable>
          </View>

          {/* 월별 수입·지출·자금이동 (API-16) */}
          {monthlyView === 'loading' && (
            <View style={styles.stateBox}>
              <ActivityIndicator size="small" color={redesign.accent} />
              <Text style={styles.stateText}>월별 내역을 불러오는 중이에요</Text>
            </View>
          )}
          {monthlyView === 'error' && (
            <View style={styles.stateBox}>
              <Text style={styles.stateTitle}>월별 내역을 불러오지 못했어요</Text>
              {monthly.error ? <Text style={styles.stateText}>{monthly.error}</Text> : null}
              <Pressable
                onPress={retryMonthly}
                accessibilityRole="button"
                accessibilityLabel="다시 시도"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
            </View>
          )}
          {monthlyView === 'ready' && (
            <View style={styles.summary}>
              {summaryRows.map((row, index) => (
                <View
                  key={row.key}
                  style={[styles.summaryRow, index < summaryRows.length - 1 && styles.divider]}
                >
                  <Text style={styles.summaryLabel}>{row.label}</Text>
                  <Text style={styles.summaryValue}>{row.amountText}</Text>
                </View>
              ))}
            </View>
          )}

          {empty && <Text style={styles.stateText}>이 달에는 집계된 거래가 없어요</Text>}
          {mismatch && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>
                월별 내역과 카테고리 내역의 집계 시점이 달라요. 다시 불러오면 맞춰져요.
              </Text>
              <Pressable
                onPress={reloadBoth}
                accessibilityRole="button"
                accessibilityLabel="다시 불러오기"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>다시 불러오기</Text>
              </Pressable>
            </View>
          )}

          {/* 카테고리별 소비 (API-17) */}
          <Text style={styles.sectionTitle}>카테고리별 소비</Text>
          {categoryView === 'loading' && (
            <View style={styles.stateBox}>
              <ActivityIndicator size="small" color={redesign.accent} />
              <Text style={styles.stateText}>카테고리 내역을 불러오는 중이에요</Text>
            </View>
          )}
          {categoryView === 'error' && (
            <View style={styles.stateBox}>
              <Text style={styles.stateTitle}>카테고리 내역을 불러오지 못했어요</Text>
              {category.error ? <Text style={styles.stateText}>{category.error}</Text> : null}
              <Pressable
                onPress={retryCategory}
                accessibilityRole="button"
                accessibilityLabel="다시 시도"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
            </View>
          )}
          {categoryView === 'ready' && categoryRows.length === 0 && (
            <Text style={styles.stateText}>이 달에는 카테고리별 소비가 없어요</Text>
          )}
          {categoryView === 'ready' &&
            categoryRows.map(row => (
              <View key={row.key} style={styles.item}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{row.name}</Text>
                  <Text style={styles.itemAmount}>{row.amountText}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${row.barRatio * 100}%` }]} />
                </View>
              </View>
            ))}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 20,
    paddingBottom: 110,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthBtn: {
    padding: 6,
  },
  monthBtnDisabled: {
    opacity: 0.3,
  },
  monthLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  summary: {
    marginTop: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginTop: 40,
  },
  item: {
    marginTop: 22,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: redesign.divider,
    overflow: 'hidden',
    marginTop: 10,
  },
  fill: {
    height: 4,
    backgroundColor: redesign.textPrimary,
  },
  stateBox: {
    marginTop: 22,
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  stateText: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 12,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 8,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.6,
  },
});
