import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  moneyRecapColors,
  moneyRecapGradients,
  gradientDirection,
} from '../../constants/moneyRecapTheme';
import { MONEY_RECAP_ENTRY_VM } from '../../constants/moneyRecapMockData';

export default function MoneyRecapEntry({ onStart }) {
  const insets = useSafeAreaInsets();
  const { brand, titleLines, subtitleLines, ctaLabel } = MONEY_RECAP_ENTRY_VM;

  return (
    <LinearGradient
      colors={moneyRecapGradients.cover.colors}
      locations={moneyRecapGradients.cover.locations}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.decorTop} />
      <View style={styles.decorBottom} />

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🌱</Text>
        </View>
        <Text style={styles.brand}>{brand}</Text>
        <Text style={styles.title}>{titleLines.join('\n')}</Text>
        <Text style={styles.subtitle}>{subtitleLines.join('\n')}</Text>

        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <Feather name="arrow-right" size={16} color={moneyRecapColors.primary} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  decorTop: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorBottom: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  content: { alignItems: 'center', maxWidth: 320, width: '100%' },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: { fontSize: 32 },
  brand: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: moneyRecapColors.white,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 40,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 300,
    minHeight: 44,
    backgroundColor: moneyRecapColors.white,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: moneyRecapColors.primary, fontSize: 15, fontWeight: '700' },
});
