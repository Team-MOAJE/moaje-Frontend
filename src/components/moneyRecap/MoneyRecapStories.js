import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STORY_COUNT,
  STORY_DURATIONS_MS,
  DARK_STORY_INDEXES,
} from '../../constants/moneyRecapMockData';
import MoneyRecapStoryProgress from './MoneyRecapStoryProgress';
import MoneyRecapStoryHeader from './MoneyRecapStoryHeader';
import Story1Cover from './stories/Story1Cover';
import Story2Summary from './stories/Story2Summary';
import Story3HourlyPattern from './stories/Story3HourlyPattern';
import Story4CategoryDay from './stories/Story4CategoryDay';
import Story5AIInsights from './stories/Story5AIInsights';
import Story6Comparison from './stories/Story6Comparison';
import Story7Goals from './stories/Story7Goals';

const LEFT_ZONE_RATIO = 0.35;
const CROSS_FADE_MS = 130;
const TRANSITION_LOCK_MS = 60;
const LONG_PRESS_MS = 300;

const STORY_COMPONENTS = [
  Story1Cover,
  Story2Summary,
  Story3HourlyPattern,
  Story4CategoryDay,
  Story5AIInsights,
  Story6Comparison,
  Story7Goals,
];

export default function MoneyRecapStories({ onClose }) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const currentIndexRef = useRef(0);
  const pausedValueRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const isLongPressRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const runningAnimRef = useRef(null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const navigate = useCallback(
    newIndex => {
      if (isTransitioningRef.current) return;
      if (newIndex < 0 || newIndex >= STORY_COUNT) return;
      isTransitioningRef.current = true;

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: CROSS_FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(newIndex);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: CROSS_FADE_MS,
          useNativeDriver: true,
        }).start();
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, TRANSITION_LOCK_MS);
      });
    },
    [fadeAnim]
  );

  const startSegment = useCallback(
    (fromValue, remainingMs) => {
      progressAnim.setValue(fromValue);
      const anim = Animated.timing(progressAnim, {
        toValue: 100,
        duration: remainingMs,
        easing: Easing.linear,
        useNativeDriver: false,
      });
      runningAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (finished && currentIndexRef.current < STORY_COUNT - 1) {
          navigate(currentIndexRef.current + 1);
        }
      });
    },
    [progressAnim, navigate]
  );

  // 스토리 전환 시 진행바를 처음부터 재생(일시정지 중이면 시작하지 않음)
  useEffect(() => {
    if (isPaused) return;
    const duration = STORY_DURATIONS_MS[currentIndex];
    if (duration === Infinity) {
      progressAnim.setValue(0);
      return undefined;
    }
    startSegment(0, duration);
    return () => runningAnimRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // 앱이 background/inactive로 전환되면 진행을 멈추고, 복귀 시 남은 시간부터 재개
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        progressAnim.stopAnimation(value => {
          pausedValueRef.current = value;
        });
      } else if (!isPaused) {
        const duration = STORY_DURATIONS_MS[currentIndexRef.current];
        if (duration === Infinity) return;
        const remaining = (duration * (100 - pausedValueRef.current)) / 100;
        startSegment(pausedValueRef.current, remaining);
      }
    });
    return () => sub.remove();
  }, [isPaused, progressAnim, startSegment]);

  const handlePauseStart = useCallback(() => {
    progressAnim.stopAnimation(value => {
      pausedValueRef.current = value;
    });
    setIsPaused(true);
  }, [progressAnim]);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    const duration = STORY_DURATIONS_MS[currentIndexRef.current];
    if (duration === Infinity) return;
    const remaining = (duration * (100 - pausedValueRef.current)) / 100;
    startSegment(pausedValueRef.current, remaining);
  }, [startSegment]);

  const handlePressIn = useCallback(() => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      handlePauseStart();
    }, LONG_PRESS_MS);
  }, [handlePauseStart]);

  const handlePressOut = useCallback(
    e => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        handleResume();
        return;
      }
      const x = e.nativeEvent.locationX;
      if (containerWidth > 0 && x < containerWidth * LEFT_ZONE_RATIO) {
        navigate(currentIndexRef.current - 1);
      } else {
        navigate(currentIndexRef.current + 1);
      }
    },
    [containerWidth, handleResume, navigate]
  );

  useEffect(
    () => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      runningAnimRef.current?.stop();
    },
    []
  );

  const isDark = DARK_STORY_INDEXES.includes(currentIndex);
  const isLastStory = currentIndex === STORY_COUNT - 1;
  const CurrentStory = STORY_COMPONENTS[currentIndex];

  return (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.storyLayer, { opacity: fadeAnim }]}>
          {isLastStory ? <CurrentStory onClose={onClose} /> : <CurrentStory />}
        </Animated.View>
      </Pressable>

      <View style={[styles.progressOverlay, { top: insets.top + 12 }]} pointerEvents="none">
        <MoneyRecapStoryProgress
          storyCount={STORY_COUNT}
          currentIndex={currentIndex}
          progressAnim={progressAnim}
          isDark={isDark}
        />
      </View>

      <View style={[styles.closeButtonWrap, { top: insets.top + 40 }]}>
        <MoneyRecapStoryHeader isDark={isDark} onClose={onClose} />
      </View>

      {isPaused ? (
        <View style={[styles.pausePill, { bottom: insets.bottom + 56 }]} pointerEvents="none">
          <Text style={styles.pauseText}>⏸ 일시정지</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  storyLayer: { ...StyleSheet.absoluteFillObject },
  progressOverlay: { position: 'absolute', left: 0, right: 0, zIndex: 50 },
  closeButtonWrap: { position: 'absolute', left: 16, zIndex: 51 },
  pausePill: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pauseText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
