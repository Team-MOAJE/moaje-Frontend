import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  moneyRecapColors,
  moneyRecapGradients,
  moneyRecapRadius,
  gradientDirection,
} from '../../../constants/moneyRecapTheme';
import { STORY7_VM } from '../../../constants/moneyRecapMockData';

export default function Story7Goals({ onClose }) {
  const insets = useSafeAreaInsets();
  const vm = STORY7_VM;

  return (
    <LinearGradient
      colors={moneyRecapGradients.goals.colors}
      locations={moneyRecapGradients.goals.locations}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.decorTop} />
      <View style={styles.decorBottom} />

      <Text style={styles.emoji}>{vm.emoji}</Text>
      <Text style={styles.eyebrow}>{vm.eyebrow}</Text>
      {vm.titleLines.map(line => (
        <Text key={line} style={styles.title}>
          {line}
        </Text>
      ))}

      <View style={styles.goals}>
        {vm.goals.map(goal => (
          <View key={goal.title} style={styles.goalCard}>
            <Text style={styles.goalEmoji}>{goal.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <Text style={styles.goalDesc}>{goal.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={vm.ctaLabel}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaText}>{vm.ctaLabel}</Text>
        <Feather name="arrow-right" size={16} color={moneyRecapColors.primary} />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, overflow: 'hidden' },
  decorTop: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorBottom: {
    position: 'absolute',
    bottom: 50,
    left: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emoji: { fontSize: 40, marginBottom: 10 },
  eyebrow: { color: moneyRecapColors.accentSoft, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  title: { color: moneyRecapColors.white, fontSize: 26, fontWeight: '800', lineHeight: 33 },
  goals: { flex: 1, justifyContent: 'center', gap: 9, marginTop: 20 },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: moneyRecapRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 13,
  },
  goalEmoji: { fontSize: 20 },
  goalTitle: { color: moneyRecapColors.white, fontSize: 13, fontWeight: '600' },
  goalDesc: { color: 'rgba(255,255,255,0.58)', fontSize: 11, marginTop: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: moneyRecapColors.white,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 24,
    marginTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 5,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: moneyRecapColors.primary, fontSize: 14, fontWeight: '700' },
});
