import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';
import MoneyRecapTag from '../MoneyRecapTag';

// 요일 소비 레벨(1 낮음 / 2 보통 / 3 높음) → neutral → olive 단계
const dayCellStyle = level =>
  level >= 3 ? styles.dayHigh : level === 2 ? styles.dayMid : styles.dayLow;

export default function Story4CategoryDay({ vm = {} }) {
  const categories = vm.categories ?? [];
  const days = vm.days ?? [];

  return (
    <StoryFrame eyebrow={vm.eyebrow} titleLines={vm.titleLines}>
      {categories.length ? (
        <View style={styles.section}>
          {vm.categoryCardLabel ? (
            <Text style={styles.sectionLabel}>{vm.categoryCardLabel}</Text>
          ) : null}
          <View style={styles.list}>
            {categories.map((cat, index) => (
              <View key={cat.key} style={styles.catRow}>
                <Text style={styles.catLabel}>{cat.label}</Text>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      { width: `${cat.percent}%` },
                      index === 0 ? styles.catFillTop : styles.catFillRest,
                    ]}
                  />
                </View>
                <Text style={[styles.catPercent, index === 0 && styles.catPercentTop]}>
                  {cat.percent}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {days.length ? (
        <View style={styles.section}>
          {vm.weeklyCardLabel ? (
            <Text style={styles.sectionLabel}>{vm.weeklyCardLabel}</Text>
          ) : null}
          <View style={styles.dayRow}>
            {days.map(d => (
              <View key={d.day} style={styles.dayCol}>
                <View style={[styles.dayCell, dayCellStyle(d.level)]} />
                <Text style={[styles.dayLabel, d.level >= 3 && styles.dayLabelHigh]}>{d.day}</Text>
              </View>
            ))}
          </View>
          {vm.legend?.length ? (
            <View style={styles.legendRow}>
              {vm.legend.map(item => (
                <View key={item.level} style={styles.legendItem}>
                  <View style={[styles.legendDot, dayCellStyle(item.level)]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {vm.tags?.length ? (
        <View style={styles.tagRow}>
          {vm.tags.map(tag => (
            <MoneyRecapTag key={tag.label} label={tag.label} variant={tag.variant} />
          ))}
        </View>
      ) : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textSecondary,
    marginBottom: 12,
  },
  list: { gap: 12 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catLabel: { width: 44, fontSize: 14, color: redesign.textPrimary },
  catTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: redesign.surfaceSoft,
    overflow: 'hidden',
  },
  catFill: { height: '100%', borderRadius: 3 },
  catFillTop: { backgroundColor: redesign.accent },
  catFillRest: { backgroundColor: redesign.navInactive, opacity: 0.55 },
  catPercent: { width: 40, textAlign: 'right', fontSize: 14, color: redesign.textSecondary },
  catPercentTop: { fontWeight: '700', color: redesign.accent },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayCol: { flex: 1, alignItems: 'center', gap: 6 },
  dayCell: { width: '100%', height: 32, borderRadius: 6 },
  dayLow: { backgroundColor: redesign.surfaceSoft },
  dayMid: { backgroundColor: redesign.navInactive, opacity: 0.4 },
  dayHigh: { backgroundColor: redesign.accent },
  dayLabel: { fontSize: 12, color: redesign.textSecondary },
  dayLabelHigh: { fontWeight: '700', color: redesign.textPrimary },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 11, color: redesign.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 28 },
});
