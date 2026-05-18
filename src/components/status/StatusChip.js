import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { chipTheme, radius, spacing } from '../../constants/statusTheme';

const StatusChip = ({ chipKey }) => {
  const theme = chipTheme[chipKey];
  if (!theme) return null;

  return (
    <View style={[styles.chip, { backgroundColor: theme.bg }]}>
      <View style={[styles.dot, { backgroundColor: theme.dot }]} />
      <Text style={[styles.label, { color: theme.text }]}>{theme.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

export default StatusChip;
