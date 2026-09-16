import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// 진행률에 따라 즉시 전환되는 새싹 성장 단계(애니메이션 없음 — 읽기/선택이 느려지면 안 됨)
const GROWTH_ICONS = ['seed-outline', 'sprout-outline', 'sprout', 'flower'];

export default function OnboardingProgress({ currentIndex, total, phase, phaseTitle }) {
  const current = currentIndex + 1;
  const ratio = total > 0 ? current / total : 0;
  const stage = Math.min(GROWTH_ICONS.length - 1, Math.floor(ratio * (GROWTH_ICONS.length - 1)));

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.counter}>
          {current} / {total}
        </Text>
        <View style={styles.growthBadge}>
          <MaterialCommunityIcons name={GROWTH_ICONS[stage]} size={16} color={colors.oliveDark} />
        </View>
      </View>
      <Text style={styles.phaseLabel}>
        Phase {phase} · {phaseTitle}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  growthBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.bgOuter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMid,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.olive,
  },
});
