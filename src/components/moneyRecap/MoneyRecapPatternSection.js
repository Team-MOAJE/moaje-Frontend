import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, typography } from '../../theme';

const INDICATOR_TONES = {
  olive: {
    background: 'rgba(111,127,63,0.1)',
    color: colors.oliveDark,
  },
  green: {
    background: 'rgba(47,158,68,0.1)',
    color: colors.green,
  },
};

const RHYTHM_LEVEL_COLORS = {
  low: { background: colors.bgLight, text: colors.textMid },
  mid: { background: colors.oliveLight, text: colors.textDark },
  high: { background: colors.oliveDark, text: colors.white },
};

function HourlyChart({ data, indicators }) {
  const maxAmount = Math.max(...data.map(item => item.amount), 1);

  return (
    <View style={[styles.card, shadows.xs]}>
      <Text style={styles.cardTitle}>시간대별 소비</Text>

      <View style={styles.barsRow}>
        {data.map(item => {
          const heightPct = Math.max((item.amount / maxAmount) * 100, 4);
          return (
            <View key={item.hour} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${heightPct}%` },
                    item.highlight ? styles.barHighlight : styles.barNormal,
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, item.highlight && styles.barLabelHighlight]}>
                {item.hour}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.indicatorRow}>
        {indicators.map(indicator => {
          const tone = INDICATOR_TONES[indicator.tone] ?? INDICATOR_TONES.olive;
          return (
            <View
              key={indicator.text}
              style={[styles.indicatorChip, { backgroundColor: tone.background }]}
            >
              <Feather name={indicator.iconName} size={12} color={tone.color} />
              <Text style={[styles.indicatorText, { color: tone.color }]}>{indicator.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CategoryBreakdown({ data }) {
  return (
    <View style={[styles.card, shadows.xs]}>
      <Text style={styles.cardTitle}>카테고리별 소비 비중</Text>

      <View style={styles.stackedBar}>
        {data.map(item => (
          <View
            key={item.key}
            style={[styles.stackedSegment, { flex: item.percent, backgroundColor: item.color }]}
          />
        ))}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {data.map(item => (
          <View key={item.key} style={styles.categoryRow}>
            <View style={[styles.categoryIconBox, { backgroundColor: colors.bgLight }]}>
              <Feather name={item.iconName} size={14} color={item.color} />
            </View>
            <Text style={styles.categoryLabel}>{item.label}</Text>
            <View style={styles.categoryProgressTrack}>
              <View
                style={[
                  styles.categoryProgressFill,
                  { width: `${item.percent}%`, backgroundColor: item.color },
                ]}
              />
            </View>
            <Text style={styles.categoryPercent}>{item.percent}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeeklyRhythm({ data }) {
  return (
    <View style={[styles.card, shadows.xs]}>
      <Text style={styles.cardTitle}>요일별 소비 리듬</Text>

      <View style={styles.weekRow}>
        {data.map(item => {
          const level = RHYTHM_LEVEL_COLORS[item.level] ?? RHYTHM_LEVEL_COLORS.low;
          return (
            <View key={item.day} style={[styles.weekCell, { backgroundColor: level.background }]}>
              <Text style={[styles.weekDay, { color: level.text }]}>{item.day}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: RHYTHM_LEVEL_COLORS.low.background }]}
          />
          <Text style={styles.legendText}>낮음</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: RHYTHM_LEVEL_COLORS.mid.background }]}
          />
          <Text style={styles.legendText}>보통</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: RHYTHM_LEVEL_COLORS.high.background }]}
          />
          <Text style={styles.legendText}>높음</Text>
        </View>
      </View>
    </View>
  );
}

export default function MoneyRecapPatternSection({
  hourlyData,
  hourlyIndicators,
  categoryData,
  weeklyData,
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={typography.sectionTitle}>소비 패턴 분석</Text>
      <HourlyChart data={hourlyData} indicators={hourlyIndicators} />
      <CategoryBreakdown data={categoryData} />
      <WeeklyRhythm data={weeklyData} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 90,
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '100%',
    height: 70,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs,
  },
  barNormal: {
    backgroundColor: colors.oliveLight,
  },
  barHighlight: {
    backgroundColor: colors.oliveDark,
    borderWidth: 1,
    borderColor: colors.oliveDeep,
  },
  barLabel: {
    fontSize: 8,
    color: colors.textLight,
    marginTop: 4,
  },
  barLabelHighlight: {
    color: colors.oliveDark,
    fontWeight: '700',
  },
  indicatorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  indicatorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  indicatorText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  stackedSegment: {
    height: '100%',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    width: 40,
    fontSize: 12,
    color: colors.textDark,
  },
  categoryProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.bgMain,
    overflow: 'hidden',
  },
  categoryProgressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  categoryPercent: {
    width: 36,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDark,
  },
  weekRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  weekCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDay: {
    fontSize: 13,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: colors.textMid,
  },
});
