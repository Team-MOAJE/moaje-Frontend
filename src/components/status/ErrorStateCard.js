import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  radius,
  spacing,
  shadow,
  iconBoxTheme,
  chipTheme,
} from '../../constants/statusTheme';
import StatusChip from './StatusChip';
import { PrimaryButton, SecondaryButton } from './StatusButton';

const ErrorStateCard = ({
  iconName = 'alert-circle-outline',
  chipKey,
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
  loading = false,
  disabled = false,
}) => {
  const iconTheme = iconBoxTheme[chipKey] ?? iconBoxTheme.CONTACT_SUPPORT;

  return (
    <View style={styles.card}>
      <StatusChip chipKey={chipKey} />

      <View style={[styles.iconBox, { backgroundColor: iconTheme.bg }]}>
        <Ionicons name={iconName} size={36} color={iconTheme.color} />
      </View>

      <View style={styles.textArea}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.actions}>
        <PrimaryButton
          label={primaryLabel}
          onPress={onPrimaryPress}
          loading={loading}
          disabled={disabled}
          loadingLabel="다시 시도 중"
        />
        {secondaryLabel && onSecondaryPress && (
          <SecondaryButton label={secondaryLabel} onPress={onSecondaryPress} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    gap: spacing.xl,
    ...shadow.cardHeavy,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  textArea: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    lineHeight: 22,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
});

export default ErrorStateCard;
