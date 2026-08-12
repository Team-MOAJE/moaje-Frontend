import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  moneyRecapColors,
  moneyRecapGradients,
  gradientDirection,
} from '../../../constants/moneyRecapTheme';
import { STORY5_VM } from '../../../constants/moneyRecapMockData';
import MoneyRecapInsightCard from '../MoneyRecapInsightCard';

export default function Story5AIInsights() {
  const insets = useSafeAreaInsets();
  const vm = STORY5_VM;

  return (
    <LinearGradient
      colors={moneyRecapGradients.aiDark.colors}
      locations={moneyRecapGradients.aiDark.locations}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.decorTop} />
      <View style={styles.decorBottom} />

      <View style={styles.badgeRow}>
        <View style={styles.badgeIconBox}>
          <Ionicons name="sparkles" size={18} color={moneyRecapColors.accentSoft} />
        </View>
        <View>
          <Text style={styles.badgeLabel}>{vm.badgeLabel}</Text>
          <Text style={styles.badgeTitle}>{vm.title}</Text>
        </View>
      </View>

      <View style={styles.cards}>
        {vm.insights.map(insight => (
          <MoneyRecapInsightCard
            key={insight.key}
            iconName={insight.iconName}
            iconFamily={insight.iconFamily}
            title={insight.title}
            body={insight.body}
            isDark
          />
        ))}
      </View>

      <Text style={styles.footer}>{vm.footerText}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, overflow: 'hidden' },
  decorTop: {
    position: 'absolute',
    top: 50,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  decorBottom: {
    position: 'absolute',
    bottom: 70,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  badgeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    color: moneyRecapColors.accentSoft,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  badgeTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 18, fontWeight: '700' },
  cards: { flex: 1, gap: 10 },
  footer: { color: 'rgba(255,255,255,0.32)', fontSize: 11, textAlign: 'center', marginTop: 14 },
});
