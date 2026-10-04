import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';

// 값이 없는 항목(등급/점수/요약)은 해당 줄만 생략한다.
export default function Story1Cover({ vm = {} }) {
  const hasScore = vm.score != null;
  const summaryText = vm.summaryText ? vm.summaryText.replace(/^✦\s*/, '') : null;

  return (
    <StoryFrame eyebrow={vm.badgeLabel} titleLines={vm.titleLines}>
      {vm.period ? <Text style={styles.period}>{vm.period}</Text> : null}

      <View style={styles.spacer} />

      {vm.grade ? (
        <View style={styles.block}>
          <Text style={styles.label}>{vm.gradeLabel}</Text>
          <Text style={styles.grade}>{vm.grade}</Text>
        </View>
      ) : null}

      {hasScore ? (
        <View style={styles.block}>
          <Text style={styles.label}>{vm.scoreLabel}</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>{vm.score}</Text>
            {vm.scoreMax != null ? <Text style={styles.scoreMax}> / {vm.scoreMax}</Text> : null}
          </View>
          {vm.scorePercent != null ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${vm.scorePercent}%` }]} />
            </View>
          ) : null}
        </View>
      ) : null}

      {summaryText ? <Text style={styles.summary}>{summaryText}</Text> : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  period: { marginTop: 8, fontSize: 13, color: redesign.textSecondary },
  spacer: { flex: 1, minHeight: 24 },
  block: { marginBottom: 28 },
  label: { fontSize: 13, color: redesign.textSecondary },
  grade: {
    marginTop: 4,
    fontSize: 56,
    lineHeight: 64,
    fontWeight: '800',
    letterSpacing: -1,
    color: redesign.textPrimary,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  score: { fontSize: 34, lineHeight: 42, fontWeight: '800', color: redesign.textPrimary },
  scoreMax: { fontSize: 16, color: redesign.textSecondary },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: redesign.divider,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: redesign.accent },
  summary: { fontSize: 15, lineHeight: 23, color: redesign.textPrimary },
});
