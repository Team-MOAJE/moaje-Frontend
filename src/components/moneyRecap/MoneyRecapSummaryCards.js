import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';

export default function MoneyRecapSummaryCards({
  avgDailyLimit,
  totalTransactionCount,
  mostSavedDate,
  mostSpentDate,
  topCategory,
}) {
  const items = [
    { key: 'avg', label: '평균 Daily Limit', value: formatKRW(avgDailyLimit), emphasis: true },
    { key: 'count', label: '총 거래 건수', value: `${totalTransactionCount}건` },
    { key: 'saved', label: '가장 아낀 날', value: mostSavedDate },
    { key: 'spent', label: '가장 많이 쓴 날', value: mostSpentDate },
  ];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.grid}>
        {items.map(item => (
          <View
            key={item.key}
            style={[
              styles.card,
              shadows.xs,
              item.emphasis ? styles.cardEmphasis : styles.cardNormal,
            ]}
          >
            <Text style={[styles.label, item.emphasis && styles.labelOnDark]}>{item.label}</Text>
            <Text style={[styles.value, item.emphasis && styles.valueOnDark]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.categoryCard, shadows.xs]}>
        <View style={styles.categoryIconBox}>
          <Feather name="pie-chart" size={18} color={colors.oliveDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.categoryLabel}>주요 소비 카테고리</Text>
          <Text style={styles.categoryName}>{topCategory.label}</Text>
        </View>
        <Text style={styles.categoryPercent}>{topCategory.percent}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    width: '48%',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  cardNormal: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardEmphasis: {
    backgroundColor: colors.oliveDark,
  },
  label: {
    fontSize: 11,
    color: colors.textMid,
  },
  labelOnDark: {
    color: 'rgba(255,255,255,0.75)',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textDark,
  },
  valueOnDark: {
    color: colors.white,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  categoryIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(184,216,107,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontSize: 11,
    color: colors.textMid,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
    marginTop: 2,
  },
  categoryPercent: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.oliveDark,
  },
});
