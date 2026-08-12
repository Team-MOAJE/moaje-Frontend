import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  moneyRecapColors,
  moneyRecapGradients,
  moneyRecapRadius,
  gradientDirection,
} from '../../../constants/moneyRecapTheme';
import { STORY1_VM } from '../../../constants/moneyRecapMockData';

export default function Story1Cover() {
  const insets = useSafeAreaInsets();
  const vm = STORY1_VM;

  return (
    <LinearGradient
      colors={moneyRecapGradients.cover.colors}
      locations={moneyRecapGradients.cover.locations}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.decorTop} />
      <View style={styles.decorBottom} />
      <View style={styles.decorRight} />

      <View style={styles.content}>
        <View style={styles.badge}>
          <MaterialCommunityIcons name="leaf" size={12} color={moneyRecapColors.accentSoft} />
          <Text style={styles.badgeText}>{vm.badgeLabel}</Text>
        </View>

        <View>
          {vm.titleLines.map(line => (
            <Text key={line} style={styles.titleLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.period}>{vm.period}</Text>
        </View>

        <View style={{ flex: 1, minHeight: 16 }} />

        <View style={styles.gradeCard}>
          <View style={styles.gradeRow}>
            <View>
              <Text style={styles.smallLabel}>{vm.gradeLabel}</Text>
              <Text style={styles.gradeValue}>{vm.grade}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.smallLabel}>{vm.scoreLabel}</Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreValue}>{vm.score}</Text>
                <Text style={styles.scoreMax}>/{vm.scoreMax}</Text>
              </View>
            </View>
          </View>
          <View style={styles.scoreTrack}>
            <View style={[styles.scoreFill, { width: `${vm.scorePercent}%` }]} />
          </View>
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{vm.summaryText}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, overflow: 'hidden' },
  decorTop: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorBottom: {
    position: 'absolute',
    bottom: 30,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  decorRight: {
    position: 'absolute',
    bottom: -30,
    right: 10,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  content: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 18,
  },
  badgeText: { color: moneyRecapColors.accentSoft, fontSize: 11, fontWeight: '600' },
  titleLine: {
    color: moneyRecapColors.white,
    fontSize: 60,
    fontWeight: '900',
    lineHeight: 62,
    letterSpacing: -2,
  },
  period: { color: 'rgba(255,255,255,0.5)', fontSize: 13, letterSpacing: 0.5, marginTop: 16 },
  gradeCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: moneyRecapRadius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 14,
  },
  gradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  smallLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 },
  gradeValue: { color: moneyRecapColors.white, fontSize: 52, fontWeight: '900', letterSpacing: -1 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreValue: {
    color: moneyRecapColors.accentSoft,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  scoreMax: { color: 'rgba(255,255,255,0.38)', fontSize: 18, fontWeight: '500' },
  scoreTrack: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
  },
  scoreFill: { height: '100%', backgroundColor: moneyRecapColors.accent, borderRadius: 999 },
  summaryBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: moneyRecapRadius.xs,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 21 },
});
