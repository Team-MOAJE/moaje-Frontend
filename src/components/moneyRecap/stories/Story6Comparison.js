import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';

function ExamBlock({ label, period, multiplierLabel, rows }) {
  return (
    <View style={styles.exam}>
      <View style={styles.examHeader}>
        <View>
          <Text style={styles.examLabel}>{label}</Text>
          {period ? <Text style={styles.examPeriod}>{period}</Text> : null}
        </View>
        {multiplierLabel ? (
          <Text style={styles.examMultiplier}>평소 대비 {multiplierLabel}</Text>
        ) : null}
      </View>
      {(rows ?? []).map(([l, v]) => (
        <View key={l} style={styles.examRow}>
          <Text style={styles.examRowLabel}>{l}</Text>
          <Text style={styles.examRowValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Story6Comparison({ vm = {} }) {
  const compareRows = vm.totalCompare?.rows ?? [];

  return (
    <StoryFrame eyebrow={vm.eyebrow} titleLines={vm.titleLines}>
      <View style={styles.blocks}>
        {vm.midterm ? <ExamBlock {...vm.midterm} /> : null}
        {vm.final ? <ExamBlock {...vm.final} /> : null}
      </View>

      {compareRows.length ? (
        <View style={styles.compare}>
          {vm.totalCompare.cardLabel ? (
            <Text style={styles.compareLabel}>{vm.totalCompare.cardLabel}</Text>
          ) : null}
          {compareRows.map(row => {
            const isFinal = row.label === vm.final?.label;
            return (
              <View key={row.label} style={styles.compareRow}>
                <View style={styles.compareHeader}>
                  <Text style={styles.compareRowLabel}>{row.label}</Text>
                  <Text style={styles.compareRowValue}>{row.value}</Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${row.widthPercent}%` },
                      isFinal ? styles.fillFinal : styles.fillMidterm,
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {vm.fds ? (
        <View style={styles.fds}>
          <Text style={styles.fdsTitle}>{vm.fds.titleLine}</Text>
          <Text style={styles.fdsDesc}>{vm.fds.desc}</Text>
        </View>
      ) : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  blocks: { marginTop: 24, gap: 20 },
  exam: { borderTopWidth: 1, borderTopColor: redesign.divider, paddingTop: 14 },
  examHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  examLabel: { fontSize: 17, fontWeight: '700', color: redesign.textPrimary },
  examPeriod: { fontSize: 12, color: redesign.textSecondary, marginTop: 2 },
  examMultiplier: { fontSize: 13, fontWeight: '600', color: redesign.accent },
  examRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  examRowLabel: { fontSize: 14, color: redesign.textSecondary },
  examRowValue: { fontSize: 14, fontWeight: '600', color: redesign.textPrimary },
  compare: { marginTop: 28, gap: 14 },
  compareLabel: { fontSize: 13, fontWeight: '600', color: redesign.textSecondary },
  compareRow: { gap: 6 },
  compareHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  compareRowLabel: { fontSize: 14, color: redesign.textPrimary },
  compareRowValue: { fontSize: 14, fontWeight: '700', color: redesign.textPrimary },
  track: { height: 6, borderRadius: 3, backgroundColor: redesign.surfaceSoft, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  fillMidterm: { backgroundColor: redesign.navInactive, opacity: 0.55 },
  fillFinal: { backgroundColor: redesign.accent },
  fds: {
    marginTop: 28,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
    gap: 2,
  },
  fdsTitle: { fontSize: 13, fontWeight: '600', color: redesign.textPrimary },
  fdsDesc: { fontSize: 12, color: redesign.textSecondary },
});
