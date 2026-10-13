import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { redesign } from '../../theme/redesign';

// vm = { periodLabel, titleLines, headlineLines, subtitleLines, ctaLabel }
// monthSelector: 월 선택 슬롯(ReactNode), notice: { title, message } 안내, ctaLoading/ctaDisabled: 시작 버튼 상태.
// 이 컴포넌트는 API·세션을 판단하지 않고 onStart만 호출한다.
export default function MoneyRecapEntry({
  vm,
  onStart,
  monthSelector,
  notice,
  ctaLoading,
  ctaDisabled,
}) {
  const insets = useSafeAreaInsets();
  if (!vm) return null;
  const { periodLabel, ctaLabel } = vm;
  const titleLines = vm.titleLines ?? [];
  const headlineLines = vm.headlineLines ?? [];
  const subtitleLines = vm.subtitleLines ?? [];
  const blocked = !!(ctaLoading || ctaDisabled);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.period}>{periodLabel}</Text>
        <Text style={styles.title}>{titleLines.join('\n')}</Text>
        <Text style={styles.headline}>{headlineLines.join('\n')}</Text>
        <Text style={styles.subtitle}>{subtitleLines.join('\n')}</Text>
      </View>

      {monthSelector}

      {notice ? (
        <View style={styles.notice}>
          {notice.title ? <Text style={styles.noticeTitle}>{notice.title}</Text> : null}
          {notice.message ? <Text style={styles.noticeMessage}>{notice.message}</Text> : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          if (!blocked) onStart?.();
        }}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        accessibilityState={{ disabled: blocked, busy: !!ctaLoading }}
        style={({ pressed }) => [
          styles.cta,
          ctaDisabled && !ctaLoading && styles.ctaDisabled,
          pressed && styles.ctaPressed,
        ]}
      >
        {ctaLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        )}
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
  notice: { marginBottom: 16 },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: redesign.textPrimary },
  noticeMessage: { marginTop: 4, fontSize: 14, lineHeight: 22, color: redesign.textSecondary },
  cta: {
    height: 56,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaPressed: { opacity: 0.85 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
