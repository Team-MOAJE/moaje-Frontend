import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../../theme';
import { Leaf } from './FutureProfileDecor';

// 첫 실천 카드. dev/prod 판단은 하지 않고 CTA 동작·비활성·안내 문구는 props로만 받는다.
export default function FirstStepCard({
  badge,
  title,
  description,
  ctaLabel,
  icon,
  onPressCta,
  ctaDisabled,
  ctaHint,
}) {
  return (
    <View style={styles.card}>
      {/* 아주 약한 성장/자산 장식(코인 더미 + 새싹). 텍스트 뒤에 깔리며 터치와 무관 */}
      <View style={styles.decor} pointerEvents="none">
        <Leaf size={16} color="rgba(126,145,72,0.22)" rotate={-25} style={styles.decorLeaf} />
        <View style={[styles.coin, { width: 46, marginBottom: 0 }]} />
        <View style={[styles.coin, { width: 42 }]} />
        <View style={[styles.coin, { width: 38 }]} />
      </View>

      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Feather name={icon ?? 'target'} size={22} color={colors.oliveDark} />
        </View>
        <View style={styles.textBox}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>

      <Pressable
        onPress={ctaDisabled ? undefined : onPressCta}
        disabled={ctaDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!ctaDisabled }}
        style={({ pressed }) => [
          styles.cta,
          pressed && !ctaDisabled && styles.ctaPressed,
          ctaDisabled && styles.ctaDisabled,
        ]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <Feather name="chevron-right" size={18} color={colors.cream} />
      </Pressable>

      {!!ctaHint && <Text style={styles.hint}>{ctaHint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.md,
  },
  decor: {
    position: 'absolute',
    right: spacing.xl,
    top: spacing.lg,
    alignItems: 'center',
    flexDirection: 'column-reverse',
    gap: 3,
  },
  decorLeaf: {
    marginTop: -4,
  },
  coin: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(254,229,0,0.28)',
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.oliveLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBox: {
    flex: 1,
    paddingRight: spacing.xxxl,
    gap: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.bgOuter,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.oliveDark,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textDark,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMid,
  },
  cta: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.olive,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  ctaPressed: {
    backgroundColor: colors.oliveDark,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.cream,
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    color: colors.textLight,
  },
});
