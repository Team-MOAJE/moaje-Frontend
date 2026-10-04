import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';

export default function HomeExpenseAnalysisTab({ monthLabel, total, topCategoryName, categories }) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>{`${monthLabel} 생활비`}</Text>
        <Text style={styles.total}>{formatKRW(total)}</Text>
      </View>
      <Text style={styles.sub}>{`${topCategoryName}에 가장 많이 썼어요`}</Text>

      {categories.map(category => (
        <View key={category.key} style={styles.item}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>
              {category.name} <Text style={styles.itemPercent}>{`${category.percent}%`}</Text>
            </Text>
            <Text style={styles.itemAmount}>{formatKRW(category.amount)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${category.percent}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  total: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  sub: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 6,
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
  itemPercent: {
    fontSize: 12,
    fontWeight: '400',
    color: redesign.textSecondary,
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
});
