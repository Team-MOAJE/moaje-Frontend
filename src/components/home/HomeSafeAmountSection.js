import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';

const formatNumber = amount => amount.toLocaleString('ko-KR');

export default function HomeSafeAmountSection({
  amount,
  usedToday,
  remaining,
  nextIncomeDays,
  nextIncomeLabel,
  dateLabel,
  onWhyPress,
  onCalculatePress,
}) {
  // API-15 계산 전에는 서버 금액이 없다. 기존 히어로 레이아웃은 유지하되 금액 자리는 '-'로 두고 계산 진입만 제공한다.
  if (amount == null) {
    return (
      <View>
        <Text style={styles.date}>{dateLabel}</Text>

        <Text style={styles.caption}>오늘 안전하게 쓸 수 있는 돈</Text>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, styles.amountPending]}>-</Text>
          <Text style={styles.won}>원</Text>
        </View>
        <Text style={styles.pendingHint}>금액을 계산하면 오늘 쓸 수 있는 돈이 표시돼요</Text>

        <Pressable
          onPress={onCalculatePress}
          accessibilityRole="button"
          accessibilityLabel="오늘 쓸 수 있는 금액 계산하기"
          style={({ pressed }) => [styles.calculate, pressed && styles.pressed]}
        >
          <Text style={styles.calculateText}>오늘 쓸 수 있는 금액 계산하기</Text>
        </Pressable>
      </View>
    );
  }

  // 서버가 오늘 사용 금액을 주지 않으면(API-15에는 없음) 진행바·사용/남은 금액을 그리지 않는다. 0으로 채우지 않는다.
  const hasUsage = usedToday != null && remaining != null;
  const total = hasUsage ? usedToday + remaining : 0;
  const usedRatio = total > 0 ? Math.min(Math.max(usedToday / total, 0), 1) : 0;

  return (
    <View>
      <Text style={styles.date}>{dateLabel}</Text>

      <Text style={styles.caption}>오늘 안전하게 쓸 수 있는 돈</Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatNumber(amount)}</Text>
        <Text style={styles.won}>원</Text>
      </View>
      {nextIncomeDays != null && (
        <Text style={styles.income}>
          다음 수입일까지 <Text style={styles.incomeDays}>{nextIncomeDays}일</Text>
          {!!nextIncomeLabel && <Text style={styles.incomeLabel}>{` · ${nextIncomeLabel}`}</Text>}
        </Text>
      )}

      {hasUsage && (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${usedRatio * 100}%` }]} />
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>
              오늘 쓴 돈 <Text style={styles.usageValue}>{formatKRW(usedToday)}</Text>
            </Text>
            <Text style={styles.usageLabel}>
              남은 돈 <Text style={styles.usageValue}>{formatKRW(remaining)}</Text>
            </Text>
          </View>
        </>
      )}

      <Pressable
        onPress={onWhyPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`왜 ${formatKRW(amount)}인가요?`}
        style={({ pressed }) => [styles.why, pressed && styles.pressed]}
      >
        <Text style={styles.whyText}>{`왜 ${formatKRW(amount)}인가요?`}</Text>
        <Text style={styles.whyChevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  date: {
    alignSelf: 'flex-end',
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 12,
  },
  caption: {
    fontSize: 15,
    color: redesign.textSecondary,
    marginTop: 36,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  amount: {
    fontSize: 56,
    fontWeight: '800',
    color: redesign.textPrimary,
    letterSpacing: -1,
  },
  won: {
    fontSize: 24,
    fontWeight: '700',
    color: redesign.accent,
    marginLeft: 8,
  },
  amountPending: {
    color: redesign.textSecondary,
  },
  pendingHint: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 12,
  },
  calculate: {
    alignSelf: 'flex-start',
    marginTop: 20,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calculateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  income: {
    fontSize: 14,
    color: redesign.textPrimary,
    marginTop: 12,
  },
  incomeDays: {
    fontWeight: '700',
    color: redesign.accent,
  },
  incomeLabel: {
    color: redesign.textSecondary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: redesign.divider,
    overflow: 'hidden',
    marginTop: 24,
  },
  fill: {
    height: 4,
    backgroundColor: redesign.textPrimary,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  usageLabel: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  usageValue: {
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  why: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 28,
    paddingVertical: 4,
  },
  whyText: {
    fontSize: 14,
    color: redesign.textPrimary,
  },
  whyChevron: {
    fontSize: 18,
    color: redesign.textSecondary,
    marginLeft: 6,
  },
  pressed: {
    opacity: 0.6,
  },
});
