import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../../theme';
import { Leaf, Orb } from './FutureProfileDecor';

// Hero 다음의 보조 카드. Q9 선택 label을 그대로 보여준다.
// 서로 다른 톤의 녹색 layer, 우하단 growth bar + 새싹, 작은 glow/잎사귀 장식이 한 composition을 이룬다.
// 모든 장식은 비인터랙티브이며 navigation/action affordance는 두지 않는다.
export default function FutureGoalCard({ label, title, icon }) {
  return (
    <LinearGradient
      colors={[colors.oliveDark, colors.olive]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Orb size={220} color="rgba(126,145,72,0.55)" style={{ right: -70, top: -90 }} />
      <Orb size={200} color="rgba(74,90,37,0.45)" style={{ left: -60, bottom: -130 }} />

      <View style={styles.bars} pointerEvents="none">
        <Leaf size={12} color={colors.oliveLight} rotate={-30} style={styles.sprout} />
        <View style={[styles.bar, { height: 22 }]} />
        <View style={[styles.bar, { height: 36 }]} />
        <View style={[styles.bar, { height: 52 }]} />
      </View>

      <View style={styles.iconBox}>
        <Feather name={icon ?? 'flag'} size={22} color={colors.cream} />
      </View>
      <View style={styles.textBox}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Orb size={14} color="rgba(255,253,245,0.35)" style={{ right: 22, top: 18 }} />
      <Leaf size={10} color="rgba(184,216,107,0.7)" rotate={35} style={styles.topLeaf} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.xxl,
    paddingVertical: spacing.xxl,
    paddingLeft: spacing.xl,
    paddingRight: 110,
    overflow: 'hidden',
    ...shadows.md,
  },
  bars: {
    position: 'absolute',
    right: spacing.xl,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  bar: {
    width: 16,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: 'rgba(184,216,107,0.4)',
  },
  sprout: {
    position: 'absolute',
    right: 0,
    top: -18,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBox: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,253,245,0.85)',
  },
  title: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '800',
    color: colors.cream,
  },
  topLeaf: {
    position: 'absolute',
    right: 44,
    top: 22,
  },
});
