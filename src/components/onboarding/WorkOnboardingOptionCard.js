import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// 서버 선택지용 카드. 서버는 선택지 아이콘을 제공하지 않으므로 아이콘 없이 label만 표시한다.
export default function WorkOnboardingOptionCard({ label, selected, onPress, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && !disabled && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      <View style={styles.checkSlot}>
        {selected && <Feather name="check-circle" size={20} color={colors.olive} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  cardSelected: {
    borderColor: colors.olive,
    backgroundColor: colors.bgOuter,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  labelSelected: {
    color: colors.oliveDark,
  },
  checkSlot: {
    width: 20,
    height: 20,
  },
});
