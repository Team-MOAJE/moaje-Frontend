import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moneyRecapColors, moneyRecapRadius } from '../../../constants/moneyRecapTheme';
import { STORY6_VM } from '../../../constants/moneyRecapMockData';
import { shadows } from '../../../theme';

function ExamCard({ tone, label, period, multiplierLabel, rows }) {
  const isWarn = tone === 'warn';
  return (
    <View style={[styles.examCard, isWarn ? styles.examCardWarn : styles.examCardFinal]}>
      <View style={styles.examHeader}>
        <View
          style={[
            styles.examDot,
            {
              backgroundColor: isWarn
                ? moneyRecapColors.examWarnDot
                : moneyRecapColors.primaryLight,
            },
          ]}
        />
        <Text
          style={[
            styles.examLabel,
            { color: isWarn ? moneyRecapColors.examWarnLabel : moneyRecapColors.tagText },
          ]}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.examPeriod,
          { color: isWarn ? moneyRecapColors.examWarnMeta : moneyRecapColors.textMid },
        ]}
      >
        {period}
      </Text>
      <Text
        style={[
          styles.examMultiplier,
          { color: isWarn ? moneyRecapColors.examWarnValue : moneyRecapColors.primary },
        ]}
      >
        {multiplierLabel}
      </Text>
      <Text
        style={[
          styles.examVsLabel,
          { color: isWarn ? moneyRecapColors.examWarnMeta : moneyRecapColors.textLight },
        ]}
      >
        평소 대비
      </Text>
      <View style={{ gap: 5 }}>
        {rows.map(([l, v]) => (
          <View key={l} style={styles.examRow}>
            <Text
              style={[
                styles.examRowLabel,
                { color: isWarn ? moneyRecapColors.examWarnMeta : moneyRecapColors.textLight },
              ]}
            >
              {l}
            </Text>
            <Text
              style={[
                styles.examRowValue,
                { color: isWarn ? moneyRecapColors.examWarnMetaStrong : moneyRecapColors.textDark },
              ]}
            >
              {v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Story6Comparison() {
  const insets = useSafeAreaInsets();
  const vm = STORY6_VM;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.eyebrow}>{vm.eyebrow}</Text>
      {vm.titleLines.map(line => (
        <Text key={line} style={styles.title}>
          {line}
        </Text>
      ))}

      <View style={styles.examRowWrap}>
        <ExamCard tone="warn" {...vm.midterm} />
        <ExamCard tone="final" {...vm.final} />
      </View>

      <View style={[styles.compareCard, shadows.sm]}>
        <Text style={styles.compareLabel}>{vm.totalCompare.cardLabel}</Text>
        {vm.totalCompare.rows.map(row => (
          <View key={row.label} style={styles.compareRowBlock}>
            <View style={styles.compareRowHeader}>
              <Text style={styles.compareRowLabel}>{row.label}</Text>
              <Text style={styles.compareRowValue}>{row.value}</Text>
            </View>
            <View style={styles.compareTrack}>
              <View
                style={[
                  styles.compareFill,
                  {
                    width: `${row.widthPercent}%`,
                    backgroundColor:
                      row.label === vm.midterm.label
                        ? moneyRecapColors.examWarnDot
                        : moneyRecapColors.primaryLight,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.fdsCard}>
        <View style={styles.fdsIconBox}>
          <Feather name="shield" size={18} color={moneyRecapColors.accentSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fdsTitle}>{vm.fds.titleLine}</Text>
          <Text style={styles.fdsDesc}>{vm.fds.desc}</Text>
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
  examRowWrap: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 10 },
  examCard: { flex: 1, borderRadius: moneyRecapRadius.sm, padding: 12, borderWidth: 1 },
  examCardWarn: {
    backgroundColor: moneyRecapColors.examWarnBg,
    borderColor: moneyRecapColors.examWarnBorder,
  },
  examCardFinal: {
    backgroundColor: moneyRecapColors.accentSoft,
    borderColor: moneyRecapColors.tagGreen,
  },
  examHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  examDot: { width: 7, height: 7, borderRadius: 4 },
  examLabel: { fontSize: 11, fontWeight: '700' },
  examPeriod: { fontSize: 10, marginBottom: 8 },
  examMultiplier: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 1 },
  examVsLabel: { fontSize: 10, marginBottom: 10 },
  examRow: { flexDirection: 'row', justifyContent: 'space-between' },
  examRowLabel: { fontSize: 10 },
  examRowValue: { fontSize: 10, fontWeight: '600' },
  compareCard: {
    backgroundColor: moneyRecapColors.card,
    borderRadius: moneyRecapRadius.sm,
    borderWidth: 1,
    borderColor: moneyRecapColors.border,
    padding: 14,
    marginBottom: 10,
  },
  compareLabel: { color: moneyRecapColors.textLight, fontSize: 10, marginBottom: 10 },
  compareRowBlock: { marginBottom: 8 },
  compareRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  compareRowLabel: { fontSize: 10, color: moneyRecapColors.textDark },
  compareRowValue: { fontSize: 10, fontWeight: '600', color: moneyRecapColors.textDark },
  compareTrack: {
    backgroundColor: moneyRecapColors.border,
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
  },
  compareFill: { height: '100%', borderRadius: 999 },
  fdsCard: {
    backgroundColor: moneyRecapColors.primary,
    borderRadius: moneyRecapRadius.sm,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fdsIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fdsTitle: {
    color: moneyRecapColors.accentSoft,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  fdsDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
});
