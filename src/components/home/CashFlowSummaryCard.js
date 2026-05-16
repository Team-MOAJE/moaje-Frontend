import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, shadows } from '../../theme';

const FLOW_ITEMS = [
  { label: '수입', value: '520,000원', dotColor: colors.green },
  { label: '변동 지출', value: '284,000원', dotColor: colors.orange },
  { label: '고정 지출', value: '150,000원', dotColor: colors.oliveMid },
  { label: '예비비', value: '36,500원', dotColor: colors.oliveLight },
];

export default function CashFlowSummaryCard() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>이번 달 흐름</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>📈</Text>
          <Text style={styles.badgeText}>소비 위험도 보통</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {FLOW_ITEMS.map(item => (
          <View key={item.label} style={styles.gridCell}>
            <View style={styles.cellHeader}>
              <View style={[styles.dot, { backgroundColor: item.dotColor }]} />
              <Text style={styles.cellLabel}>{item.label}</Text>
            </View>
            <Text style={styles.cellValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tipBox}>
        <Text style={styles.tipText}>💡 다음 주 시험기간 예비비를 조금 남겨두는 걸 추천해요.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDark,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,159,28,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeEmoji: {
    fontSize: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.orange,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    width: '47%',
    backgroundColor: colors.bgLight,
    borderRadius: radius.sm,
    padding: 10,
    gap: 4,
  },
  cellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  cellLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
  },
  cellValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  tipBox: {
    backgroundColor: colors.bgWarn,
    borderRadius: radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderWarn,
  },
  tipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textDark,
    lineHeight: 18,
  },
});
