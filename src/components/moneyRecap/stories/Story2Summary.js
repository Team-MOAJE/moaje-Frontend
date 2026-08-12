import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moneyRecapColors, moneyRecapRadius } from '../../../constants/moneyRecapTheme';
import { STORY2_VM } from '../../../constants/moneyRecapMockData';
import MoneyRecapMetricCard from '../MoneyRecapMetricCard';

const renderMetricCard = metric => {
  const { key, ...cardProps } = metric;
  return <MoneyRecapMetricCard key={key} {...cardProps} />;
};

export default function Story2Summary() {
  const insets = useSafeAreaInsets();
  const vm = STORY2_VM;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.eyebrow}>{vm.eyebrow}</Text>
      <Text style={styles.title}>{vm.title}</Text>

      <View style={styles.quoteCard}>
        <Text style={styles.quoteMark}>&quot;</Text>
        <Text style={styles.quoteText}>{vm.quoteLines.join('\n')}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          {renderMetricCard(vm.metrics[0])}
          {renderMetricCard(vm.metrics[1])}
        </View>
        <View style={styles.gridRow}>
          {renderMetricCard(vm.metrics[2])}
          {renderMetricCard(vm.metrics[3])}
        </View>
      </View>

      <View style={styles.chipWrap}>
        <View style={styles.chip}>
          <Feather name="check-circle" size={13} color={moneyRecapColors.tagText} />
          <Text style={styles.chipText}>{vm.safeChipText}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: moneyRecapColors.bgCream, paddingHorizontal: 20 },
  eyebrow: {
    color: moneyRecapColors.textLight,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  title: { color: moneyRecapColors.textDark, fontSize: 22, fontWeight: '700', lineHeight: 29 },
  quoteCard: {
    backgroundColor: moneyRecapColors.primary,
    borderRadius: moneyRecapRadius.lg,
    padding: 20,
    marginTop: 14,
    marginBottom: 18,
    overflow: 'hidden',
  },
  quoteMark: {
    color: moneyRecapColors.accentSoft,
    fontSize: 32,
    fontWeight: '900',
    opacity: 0.55,
    marginBottom: 6,
  },
  quoteText: { color: moneyRecapColors.white, fontSize: 16, lineHeight: 26, fontWeight: '500' },
  grid: { gap: 10, marginBottom: 14 },
  gridRow: { flexDirection: 'row', gap: 10 },
  chipWrap: { alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: moneyRecapColors.tagGreen,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: { color: moneyRecapColors.tagText, fontSize: 12, fontWeight: '600' },
});
