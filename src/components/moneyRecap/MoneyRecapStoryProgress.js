import React from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// 진행바 segment 수는 호출자가 넘기는 storyCount(= stories.length)로만 결정된다.
export default function MoneyRecapStoryProgress({
  storyCount,
  currentIndex,
  progressAnim,
  isDark,
}) {
  const trackColor = isDark ? 'rgba(255,255,255,0.28)' : redesign.divider;
  const fillColor = isDark ? '#FFFFFF' : redesign.accent;

  return (
    <View style={styles.row}>
      {Array.from({ length: storyCount }).map((_, i) => (
        <View key={i} style={[styles.track, { backgroundColor: trackColor }]}>
          {i < currentIndex ? (
            <View style={[styles.fill, { width: '100%', backgroundColor: fillColor }]} />
          ) : i === currentIndex ? (
            <Animated.View
              style={[
                styles.fill,
                {
                  backgroundColor: fillColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, paddingHorizontal: redesign.pagePaddingX },
  track: { flex: 1, height: 3, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
});
