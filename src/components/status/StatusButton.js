import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../constants/statusTheme';

export const PrimaryButton = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  loadingLabel = '다시 시도 중',
}) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.primary,
        pressed && !isDisabled && styles.primaryPressed,
        isDisabled && styles.primaryDisabled,
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={[styles.primaryLabel, styles.loadingLabelOffset]}>{loadingLabel}</Text>
        </View>
      ) : (
        <Text style={[styles.primaryLabel, isDisabled && styles.primaryLabelDisabled]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
};

export const SecondaryButton = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
  >
    <Text style={styles.secondaryLabel}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.forest,
    borderRadius: radius.full,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryPressed: {
    backgroundColor: colors.forestDark,
    transform: [{ scale: 0.98 }],
  },
  primaryDisabled: {
    backgroundColor: colors.hairline,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    letterSpacing: -0.2,
  },
  primaryLabelDisabled: {
    color: colors.muted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingLabelOffset: {
    marginLeft: spacing.sm,
  },
  secondary: {
    borderRadius: radius.full,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  secondaryPressed: {
    backgroundColor: colors.bgSoft,
    transform: [{ scale: 0.98 }],
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.forest,
    letterSpacing: -0.2,
  },
});
