import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// 서버 온보딩(기능 플래그 on)에서 Home '머니 타입' 탭에 보여주는 중립 안내.
// 기존 로컬 머니 타입 계산 결과(프로필/태그/점수)는 받지도 표시하지도 않는다 — 서버 Future Profile은
// 결과 화면에서 서버 조회 결과로만 보여준다. 문구와 동작은 호출부(resolveHomeMoneyTypeView)가 전달한다.
export default function HomeFutureProfileGuide({ title, message, ctaLabel, onPress }) {
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <Text style={styles.ctaChevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
    marginTop: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  ctaChevron: {
    fontSize: 18,
    color: redesign.textSecondary,
    marginLeft: 4,
  },
});
