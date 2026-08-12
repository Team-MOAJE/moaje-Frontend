import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moneyRecapColors, moneyRecapRadius } from '../../../constants/moneyRecapTheme';
import { STORY4_VM } from '../../../constants/moneyRecapMockData';
import MoneyRecapTag from '../MoneyRecapTag';
import { shadows } from '../../../theme';

const ICON_FAMILIES = { feather: Feather, ionicons: Ionicons, mci: MaterialCommunityIcons };
const DAY_LEVEL_COLORS = [
  moneyRecapColors.dayLevelLowBg,
  moneyRecapColors.accentSoft,
  moneyRecapColors.primaryLight,
];

function CategoryIcon({ family, name, color }) {
  const Icon = ICON_FAMILIES[family] ?? Feather;
  return <Icon name={name} size={12} color={color} />;
}

export default function Story4CategoryDay() {
  const insets = useSafeAreaInsets();
  const vm = STORY4_VM;
  const colorFor = key => moneyRecapColors[key] ?? moneyRecapColors.primary;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.eyebrow}>{vm.eyebrow}</Text>
      {vm.titleLines.map(line => (
        <Text key={line} style={styles.title}>
          {line}
        </Text>
      ))}

      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.cardLabel}>{vm.categoryCardLabel}</Text>
        <View style={styles.stackedBar}>
          {vm.categories.map(cat => (
            <View
              key={cat.key}
              style={{ flex: cat.percent, backgroundColor: colorFor(cat.swatch) }}
            />
          ))}
        </View>
        <View style={{ gap: 7 }}>
          {vm.categories.map(cat => (
            <View key={cat.key} style={styles.catRow}>
              <View style={styles.catLeft}>
                <View style={[styles.catIconBox, { backgroundColor: colorFor(cat.swatch) }]}>
                  <CategoryIcon
                    family={cat.iconFamily}
                    name={cat.iconName}
                    color={colorFor(cat.iconColorKey)}
                  />
                </View>
                <Text style={styles.catLabel}>{cat.label}</Text>
              </View>
              <View style={styles.catRight}>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      { width: `${cat.percent}%`, backgroundColor: colorFor(cat.bar) },
                    ]}
                  />
                </View>
                <Text style={styles.catPercent}>{cat.percent}%</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.cardLabel}>{vm.weeklyCardLabel}</Text>
        <View style={styles.dayRow}>
          {vm.days.map(d => (
            <View key={d.day} style={styles.dayCol}>
              <View style={[styles.dayCell, { backgroundColor: DAY_LEVEL_COLORS[d.level - 1] }]}>
                {d.level === 3 ? <Text style={styles.dayArrowUp}>↑</Text> : null}
                {d.level === 1 ? <Text style={styles.dayArrowDown}>↓</Text> : null}
              </View>
              <Text style={[styles.dayLabel, d.level === 3 && styles.dayLabelHigh]}>{d.day}</Text>
            </View>
          ))}
        </View>
        <View style={styles.legendRow}>
          {vm.legend.map(item => (
            <View key={item.level} style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: DAY_LEVEL_COLORS[item.level - 1] }]}
              />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
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
  card: {
    backgroundColor: moneyRecapColors.card,
    borderRadius: moneyRecapRadius.lg,
    borderWidth: 1,
    borderColor: moneyRecapColors.border,
    padding: 15,
    marginTop: 14,
  },
  cardLabel: {
    color: moneyRecapColors.textLight,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 9,
  },
  stackedBar: {
    flexDirection: 'row',
    borderRadius: 999,
    overflow: 'hidden',
    height: 10,
    marginBottom: 13,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  catIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: { color: moneyRecapColors.textDark, fontSize: 12 },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catTrack: { width: 56, height: 4, borderRadius: 999, backgroundColor: moneyRecapColors.border },
  catFill: { height: '100%', borderRadius: 999 },
  catPercent: {
    color: moneyRecapColors.textMid,
    fontSize: 12,
    fontWeight: '600',
    width: 28,
    textAlign: 'right',
  },
  dayRow: { flexDirection: 'row', gap: 7 },
  dayCol: { flex: 1, alignItems: 'center', gap: 5 },
  dayCell: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayArrowUp: { fontSize: 9, color: moneyRecapColors.primary },
  dayArrowDown: { fontSize: 9, color: moneyRecapColors.textLight },
  dayLabel: { fontSize: 10, color: moneyRecapColors.textLight },
  dayLabelHigh: { color: moneyRecapColors.primary, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendLabel: { fontSize: 9, color: moneyRecapColors.textLight },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
});
