import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

export default function OnboardingOptionCard({ label, iconName, selected, onPress, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && !disabled && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}
    >
      <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
        <Feather name={iconName} size={18} color={selected ? colors.cream : colors.textMid} />
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {selected && <Feather name="check-circle" size={20} color={colors.olive} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSelected: {
    backgroundColor: colors.olive,
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
});
