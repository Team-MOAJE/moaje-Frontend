import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { redesign } from '../../theme/redesign';

// 모든 Money Recap story가 공유하는 flat 레이아웃: 올리브 eyebrow → 큰 타이틀 → 본문.
// 상단 여유(insets.top + 72)는 진행바/닫기 버튼 오버레이 영역이다.
export default function StoryFrame({ eyebrow, titleLines, children }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24 }]}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {(titleLines ?? []).map(line => (
        <Text key={line} style={styles.title}>
          {line}
        </Text>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: redesign.bg,
    paddingHorizontal: redesign.pagePaddingX,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
});
