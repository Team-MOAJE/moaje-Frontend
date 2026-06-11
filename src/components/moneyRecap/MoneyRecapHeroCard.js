import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows } from '../../theme';

export default function MoneyRecapHeroCard({
  semesterLabel,
  period,
  grade,
  score,
  scoreMax,
  summary,
}) {
  const progressPct = Math.min(Math.max((score / scoreMax) * 100, 0), 100);

  return (
    <LinearGradient
      colors={[colors.oliveDark, colors.oliveDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, shadows.lg]}
    >
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <View style={styles.badge}>
        <Text style={styles.badgeText}>🍀 {semesterLabel}</Text>
      </View>

      <Text style={styles.title}>{'머니\n리캡'}</Text>
      <Text style={styles.period}>{period}</Text>

      <View style={styles.glassCard}>
        <View style={styles.glassColumn}>
          <Text style={styles.glassLabel}>종합 소비 등급</Text>
          <Text style={styles.gradeValue}>{grade}</Text>
        </View>
        <View style={styles.glassDivider} />
        <View style={styles.glassColumn}>
          <Text style={styles.glassLabel}>소비 점수</Text>
          <Text style={styles.scoreValue}>
            {score}
            <Text style={styles.scoreMax}>/{scoreMax}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>✦ {summary}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xxl,
    padding: 24,
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    right: -32,
    top: -32,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circle2: {
    position: 'absolute',
    right: 16,
    top: 64,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.oliveLight,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    color: colors.white,
    marginTop: 12,
  },
  period: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },
  glassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  glassColumn: {
    flex: 1,
  },
  glassDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 12,
  },
  glassLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  gradeValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.oliveLight,
  },
  scoreMax: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.oliveLight,
  },
  summaryBox: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: 12,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.white,
  },
});
