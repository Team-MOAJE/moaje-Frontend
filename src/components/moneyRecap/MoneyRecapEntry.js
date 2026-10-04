import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { redesign } from '../../theme/redesign';

// vm = { periodLabel, titleLines, headlineLines, subtitleLines, ctaLabel } — 실제 리캡 데이터 연결 시 주입한다.
export default function MoneyRecapEntry({ vm, onStart }) {
  const insets = useSafeAreaInsets();
  if (!vm) return null;
  const { periodLabel, titleLines, headlineLines, subtitleLines, ctaLabel } = vm;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.period}>{periodLabel}</Text>
        <Text style={styles.title}>{titleLines.join('\n')}</Text>
        <Text style={styles.headline}>{headlineLines.join('\n')}</Text>
        <Text style={styles.subtitle}>{subtitleLines.join('\n')}</Text>
      </View>

      <Pressable
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: redesign.bg,
    paddingHorizontal: redesign.pagePaddingX,
  },
  content: { flex: 1, justifyContent: 'center' },
  period: { fontSize: 13, fontWeight: '600', color: redesign.accent, marginBottom: 8 },
  title: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: redesign.textPrimary,
  },
  headline: {
    marginTop: 24,
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  subtitle: { marginTop: 12, fontSize: 14, lineHeight: 22, color: redesign.textSecondary },
  cta: {
    height: 56,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
