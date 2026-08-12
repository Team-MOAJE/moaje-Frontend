import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moneyRecapColors, moneyRecapRadius } from '../../../constants/moneyRecapTheme';
import { STORY3_VM } from '../../../constants/moneyRecapMockData';
import MoneyRecapTag from '../MoneyRecapTag';
import { shadows } from '../../../theme';

export default function Story3HourlyPattern() {
  const insets = useSafeAreaInsets();
  const vm = STORY3_VM;
  const max = Math.max(...vm.hours.map(h => h.value));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.eyebrow}>{vm.eyebrow}</Text>
      {vm.titleLines.map(line => (
        <Text key={line} style={styles.title}>
          {line}
        </Text>
      ))}

      <View style={[styles.chartCard, shadows.sm]}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartLabel}>{vm.chartLabel}</Text>
          <View style={styles.peakBadge}>
            <Text style={styles.peakBadgeText}>{vm.peakBadgeText}</Text>
          </View>
        </View>

        <View style={styles.barsRow}>
          {vm.hours.map(item => {
            const isPeak = vm.peakHourKeys.includes(item.hour);
            return (
              <View key={item.hour} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: `${(item.value / max) * 100}%` },
                      isPeak ? styles.barPeak : styles.barNormal,
                    ]}
                  >
                    {item.hour === vm.peakCalloutHour ? (
                      <Text style={styles.callout}>{vm.peakCalloutLabel}</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.hourLabel, isPeak && styles.hourLabelPeak]}>{item.hour}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.tagRow}>
        {vm.tags.map(tag => (
          <MoneyRecapTag key={tag.label} label={tag.label} variant={tag.variant} />
        ))}
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
  chartCard: {
    backgroundColor: moneyRecapColors.card,
    borderRadius: moneyRecapRadius.lg,
    borderWidth: 1,
    borderColor: moneyRecapColors.border,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    flex: 1,
    marginTop: 16,
    marginBottom: 14,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartLabel: { color: moneyRecapColors.textLight, fontSize: 11 },
  peakBadge: {
    backgroundColor: moneyRecapColors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  peakBadgeText: { color: moneyRecapColors.primary, fontSize: 10, fontWeight: '700' },
  barsRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  barColumn: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 6, borderRadius: 5, alignItems: 'center' },
  barPeak: {
    backgroundColor: moneyRecapColors.primary,
    borderWidth: 1.5,
    borderColor: moneyRecapColors.primaryLight,
  },
  barNormal: { backgroundColor: moneyRecapColors.accentSoft },
  callout: {
    position: 'absolute',
    top: -18,
    backgroundColor: moneyRecapColors.primary,
    color: moneyRecapColors.white,
    fontSize: 8,
    fontWeight: '700',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  hourLabel: { fontSize: 9, color: moneyRecapColors.textLight },
  hourLabelPeak: { color: moneyRecapColors.primary, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
