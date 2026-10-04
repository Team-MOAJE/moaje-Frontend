import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

const formatNumber = amount => Number(amount).toLocaleString('ko-KR');
const formatCurrency = amount => `${formatNumber(amount)}원`;

// 핵심 금액 + 오늘 사용 현황. Home의 안전 금액 영역과 같은 시각 언어를 쓴다.
export default function DailyLimitHeroCard({ amount, spent, daysLeft }) {
  const remaining = Math.max(amount - spent, 0);
  const usedRatio = amount > 0 ? Math.min(spent / amount, 1) : 0;

  return (
    <View>
      <Text style={styles.caption}>오늘 안전하게 쓸 수 있는 돈</Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatNumber(amount)}</Text>
        <Text style={styles.won}>원</Text>
      </View>
      <Text style={styles.income}>
        다음 알바비까지 <Text style={styles.incomeDays}>{daysLeft}일</Text>
      </Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${usedRatio * 100}%` }]} />
      </View>
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>
          오늘 쓴 돈 <Text style={styles.usageValue}>{formatCurrency(spent)}</Text>
        </Text>
        <Text style={styles.usageLabel}>
          남은 돈 <Text style={styles.usageValue}>{formatCurrency(remaining)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 15,
    color: redesign.textSecondary,
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
  income: {
    fontSize: 14,
    color: redesign.textPrimary,
    marginTop: 12,
  },
  incomeDays: {
    fontWeight: '700',
    color: redesign.accent,
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
});
