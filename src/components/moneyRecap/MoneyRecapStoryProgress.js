import React from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { moneyRecapColors } from '../../constants/moneyRecapTheme';

export default function MoneyRecapStoryProgress({
  storyCount,
  currentIndex,
  progressAnim,
  isDark,
}) {
  const trackColor = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(74,94,42,0.15)';
  const fillColor = isDark ? moneyRecapColors.white : moneyRecapColors.primary;

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
  row: { flexDirection: 'row', gap: 4, paddingHorizontal: 16 },
  track: { flex: 1, height: 2.5, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
});
