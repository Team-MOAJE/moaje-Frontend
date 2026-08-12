import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { moneyRecapColors, moneyRecapRadius } from '../../constants/moneyRecapTheme';

export default function MoneyRecapTag({ label, variant = 'default' }) {
  const isPrimary = variant === 'primary';
  const isWarning = variant === 'warning';
  const prefix = isPrimary ? '✦ ' : isWarning ? '⚡ ' : '';

  return (
    <View style={[styles.tag, isPrimary && styles.primary, isWarning && styles.warning]}>
      <Text
        style={[styles.label, isPrimary && styles.labelPrimary, isWarning && styles.labelWarning]}
      >
        {prefix}
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: moneyRecapRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: moneyRecapColors.tagGreen,
  },
  primary: { backgroundColor: moneyRecapColors.primary },
  warning: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFCC80',
  },
  label: { fontSize: 11, fontWeight: '600', color: moneyRecapColors.tagText },
  labelPrimary: { color: moneyRecapColors.white },
  labelWarning: { color: '#E65100' },
});
