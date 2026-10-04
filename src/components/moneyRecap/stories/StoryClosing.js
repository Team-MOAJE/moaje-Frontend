import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { redesign } from '../../../theme/redesign';

// 목표 생성/계획 기능 없이 리캡을 마무리하는 단순 페이지. CTA는 onClose만 호출한다.
export default function StoryClosing({ vm = {}, onClose }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.body}>
        {vm.title ? <Text style={styles.title}>{vm.title}</Text> : null}
        {vm.message ? <Text style={styles.message}>{vm.message}</Text> : null}
      </View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={vm.ctaLabel}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaText}>{vm.ctaLabel}</Text>
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
  body: { flex: 1, justifyContent: 'center' },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  message: { marginTop: 12, fontSize: 16, lineHeight: 25, color: redesign.textSecondary },
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
