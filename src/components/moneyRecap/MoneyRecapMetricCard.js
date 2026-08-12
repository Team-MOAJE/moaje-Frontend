import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { moneyRecapColors, moneyRecapRadius } from '../../constants/moneyRecapTheme';
import { shadows } from '../../theme';

export default function MoneyRecapMetricCard({ label, value, sub, iconName, accent, highlight }) {
  const valueColor = accent
    ? moneyRecapColors.white
    : highlight === 'green'
      ? moneyRecapColors.greenStrong
      : highlight === 'red'
        ? moneyRecapColors.redStrong
        : moneyRecapColors.textDark;

  return (
    <View style={[styles.card, accent ? styles.accentCard : shadows.sm]}>
      {iconName ? (
        <Feather
          name={iconName}
          size={14}
          color={accent ? moneyRecapColors.accentSoft : moneyRecapColors.textLight}
        />
      ) : null}
      <Text style={[styles.label, accent && styles.accentLabel]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {sub ? <Text style={[styles.sub, accent && styles.accentSub]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: moneyRecapColors.card,
    borderRadius: moneyRecapRadius.sm,
    borderWidth: 1,
    borderColor: moneyRecapColors.border,
    padding: 12,
    gap: 3,
  },
  accentCard: {
    backgroundColor: moneyRecapColors.primary,
    borderColor: 'transparent',
  },
  label: { fontSize: 11, color: moneyRecapColors.textLight },
  accentLabel: { color: 'rgba(255,255,255,0.6)' },
  value: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 11, color: moneyRecapColors.textLight },
  accentSub: { color: 'rgba(255,255,255,0.5)' },
});
