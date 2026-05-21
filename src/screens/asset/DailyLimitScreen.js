import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { colors, radius, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchDailyLimit } from '../../features/work/workApi';
import DailyLimitHeroCard from '../../components/dailylimit/DailyLimitHeroCard';
import DailyLimitStatusCard from '../../components/dailylimit/DailyLimitStatusCard';
import DailyLimitFormulaCard from '../../components/dailylimit/DailyLimitFormulaCard';
import RecommendationActionCard from '../../components/dailylimit/RecommendationActionCard';
import BottomNavBar from '../../components/home/BottomNavBar';

// ── 금액 포맷 유틸 ─────────────────────────────────────────────
const formatCurrency = amount => `${Number(amount).toLocaleString()}원`;

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

// ── Toast 설정 ─────────────────────────────────────────────────
const TOAST_CONFIG = {
  info: { bg: colors.textDark, textColor: '#E8F0CF', iconName: 'info' },
  success: { bg: colors.green, textColor: '#FFFFFF', iconName: 'check' },
  danger: { bg: colors.red, textColor: '#FFFFFF', iconName: 'alert-triangle' },
  olive: { bg: colors.olive, textColor: colors.cream, iconName: 'info' },
};

// ── 히어로 스켈레톤 ────────────────────────────────────────────
function HeroSkeleton() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[skStyles.container, { opacity }]}>
      <View style={skStyles.titleBar} />
      <View style={skStyles.body}>
        <View style={skStyles.circle} />
        <View style={skStyles.textGroup}>
          <View style={skStyles.amountBar} />
          <View style={skStyles.subBar} />
        </View>
      </View>
      <View style={skStyles.grid}>
        {[0, 1, 2].map(i => (
          <View key={i} style={skStyles.gridCell} />
        ))}
      </View>
    </Animated.View>
  );
}

const skStyles = StyleSheet.create({
  container: {
    borderRadius: radius.xxl,
    padding: 20,
    backgroundColor: colors.olive,
    overflow: 'hidden',
  },
  titleBar: {
    height: 16,
    width: 160,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  circle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  textGroup: {
    flex: 1,
    gap: 8,
  },
  amountBar: {
    height: 28,
    width: 128,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  subBar: {
    height: 12,
    width: 96,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  gridCell: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});

// ── 메인 화면 ──────────────────────────────────────────────────
export default function DailyLimitScreen({ navigation }) {
  const dispatch = useDispatch();
  const dailyLimit = useSelector(state => state.work.dailyLimit);
  const isLoading = useSelector(state => state.work.dailyLimitLoading);

  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', variant: 'info' });

  useEffect(() => {
    dispatch(fetchDailyLimit());
  }, [dispatch]);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(8)).current;

  const showToast = (message, variant = 'info') => {
    setToast({ visible: true, message, variant });
    toastOpacity.setValue(0);
    toastTranslateY.setValue(8);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(2100),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(p => ({ ...p, visible: false })));
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleBottomHomePress = () => navigation.navigate(ROUTES.HOME);
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomGridPress = () => navigation.navigate(ROUTES.CATEGORY);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    showToast('가용금액을 다시 계산하고 있어요.', 'info');
    try {
      const result = await dispatch(fetchDailyLimit());
      if (fetchDailyLimit.fulfilled.match(result)) {
        showToast('가용금액이 업데이트됐어요.', 'success');
      } else {
        showToast('가용금액을 불러오지 못했어요. 잠시 후 다시 시도해주세요.', 'danger');
      }
    } catch {
      showToast('가용금액을 불러오지 못했어요. 잠시 후 다시 시도해주세요.', 'danger');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = action => {
    if (action === 'transfer') {
      navigation.navigate(ROUTES.TRANSFER);
    } else {
      showToast('아직 준비 중인 기능이에요 🌱', 'olive');
    }
  };

  const safeData = dailyLimit ?? {
    amount: 0,
    spent: 0,
    daysLeft: 0,
    status: 'safe',
    formulaItems: [],
    recommendItems: [],
  };

  const formattedFormulaItems = safeData.formulaItems.map(item => ({
    ...item,
    displayValue: item.unit ? `${item.value}${item.unit}` : formatCurrency(item.value),
  }));

  const uiStatus = mapDailyLimitStatus(safeData.status);
  const toastCfg = TOAST_CONFIG[toast.variant] ?? TOAST_CONFIG.info;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        {/* 커스텀 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.75}>
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>오늘의 가용금액</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.headerBtn, refreshing && styles.headerBtnDisabled]}
            activeOpacity={0.75}
            disabled={refreshing}
          >
            <Feather name="refresh-cw" size={20} color={colors.textDark} />
          </TouchableOpacity>
        </View>

        <Text style={styles.headerSub}>오늘 하루 안전하게 쓸 수 있는 금액을 계산했어요.</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading || (!dailyLimit && !refreshing) ? (
            <HeroSkeleton />
          ) : (
            <DailyLimitHeroCard
              amount={safeData.amount}
              spent={safeData.spent}
              daysLeft={safeData.daysLeft}
            />
          )}

          <DailyLimitStatusCard
            status={uiStatus}
            recommended={safeData.amount}
            spent={safeData.spent}
          />

          <DailyLimitFormulaCard items={formattedFormulaItems} />

          <RecommendationActionCard items={safeData.recommendItems} onAction={handleAction} />

          <View style={styles.bottomPad} />
        </ScrollView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onChartPress={() => {}}
          onGridPress={handleBottomGridPress}
          activeKey="chart"
        />

        {/* Inline Toast */}
        {toast.visible && (
          <Animated.View
            style={[
              styles.toast,
              {
                backgroundColor: toastCfg.bg,
                opacity: toastOpacity,
                transform: [{ translateY: toastTranslateY }],
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.toastIconWrap}>
              <Feather name={toastCfg.iconName} size={16} color={toastCfg.textColor} />
            </View>
            <Text style={[styles.toastText, { color: toastCfg.textColor }]}>{toast.message}</Text>
          </Animated.View>
        )}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  headerBtnDisabled: {
    opacity: 0.4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.8)',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 110,
    gap: 12,
  },
  bottomPad: {
    height: 8,
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    zIndex: 100,
    ...shadows.xl,
  },
  toastIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toastText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});
