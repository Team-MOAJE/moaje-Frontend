import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { moneyRecapColors, moneyRecapRadius } from '../../constants/moneyRecapTheme';
import { shadows } from '../../theme';

const ICON_FAMILIES = { feather: Feather, ionicons: Ionicons };

export default function MoneyRecapInsightCard({
  iconName,
  iconFamily = 'feather',
  title,
  body,
  isDark,
}) {
  const Icon = ICON_FAMILIES[iconFamily] ?? Feather;

  return (
    <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight, !isDark && shadows.sm]}>
      <View style={styles.header}>
        <View style={[styles.iconBox, isDark ? styles.iconBoxDark : styles.iconBoxLight]}>
          <Icon
            name={iconName}
            size={14}
            color={isDark ? moneyRecapColors.accentSoft : moneyRecapColors.textMid}
          />
        </View>
        <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
      </View>
      <Text style={[styles.body, isDark && styles.bodyDark]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: moneyRecapRadius.sm, padding: 14 },
  cardLight: {
    backgroundColor: moneyRecapColors.card,
    borderWidth: 1,
    borderColor: moneyRecapColors.border,
  },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxLight: { backgroundColor: moneyRecapColors.accentSoft },
  iconBoxDark: { backgroundColor: 'rgba(255,255,255,0.15)' },
  title: { fontSize: 13, fontWeight: '700', color: moneyRecapColors.textMid },
  titleDark: { color: moneyRecapColors.accentSoft },
  body: { fontSize: 13, lineHeight: 20, color: moneyRecapColors.textDark },
  bodyDark: { color: 'rgba(255,255,255,0.82)' },
});
