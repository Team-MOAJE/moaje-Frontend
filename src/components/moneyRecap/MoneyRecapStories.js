import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { redesign } from '../../theme/redesign';
import { buildMoneyRecapStories } from '../../features/moneyRecap/buildMoneyRecapStories';
import MoneyRecapStoryProgress from './MoneyRecapStoryProgress';
import MoneyRecapStoryHeader from './MoneyRecapStoryHeader';

const LEFT_ZONE_RATIO = 0.35;
const CROSS_FADE_MS = 130;
const TRANSITION_LOCK_MS = 60;
const LONG_PRESS_MS = 300;

// 보여줄 story 목록(개수/duration/tone/props)은 전부 buildMoneyRecapStories가 만든 descriptor 배열에서 온다.
export default function MoneyRecapStories({ onClose, data }) {
  const insets = useSafeAreaInsets();
  const stories = useMemo(() => buildMoneyRecapStories(data), [data]);
  const storyCount = stories.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const storiesRef = useRef(stories);
  const currentIndexRef = useRef(0);
  const pausedValueRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const isLongPressRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const runningAnimRef = useRef(null);

  storiesRef.current = stories;

  // 현재 index의 duration. story가 없거나 범위를 벗어나면 Infinity(자동 진행 없음)로 취급한다.
  const getDuration = useCallback(index => storiesRef.current[index]?.duration ?? Infinity, []);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // stories 개수가 줄어 현재 index가 범위를 벗어나면 마지막 story로 보정한다.
  useEffect(() => {
    if (storyCount > 0 && currentIndex > storyCount - 1) {
      setCurrentIndex(storyCount - 1);
    }
  }, [storyCount, currentIndex]);

  const navigate = useCallback(
    newIndex => {
      if (isTransitioningRef.current) return;
      if (newIndex < 0 || newIndex >= storiesRef.current.length) return;
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
        if (finished && currentIndexRef.current < storiesRef.current.length - 1) {
          navigate(currentIndexRef.current + 1);
        }
      });
    },
    [progressAnim, navigate]
  );

  // 스토리 전환 시 진행바를 처음부터 재생(일시정지 중이면 시작하지 않음)
  useEffect(() => {
    if (isPaused) return;
    const duration = getDuration(currentIndex);
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
        const duration = getDuration(currentIndexRef.current);
        if (duration === Infinity) return;
        const remaining = (duration * (100 - pausedValueRef.current)) / 100;
        startSegment(pausedValueRef.current, remaining);
      }
    });
    return () => sub.remove();
  }, [isPaused, progressAnim, startSegment, getDuration]);

  const handlePauseStart = useCallback(() => {
    progressAnim.stopAnimation(value => {
      pausedValueRef.current = value;
    });
    setIsPaused(true);
  }, [progressAnim]);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    const duration = getDuration(currentIndexRef.current);
    if (duration === Infinity) return;
    const remaining = (duration * (100 - pausedValueRef.current)) / 100;
    startSegment(pausedValueRef.current, remaining);
  }, [startSegment, getDuration]);

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

  // 보여줄 story가 하나도 없으면(데이터 자체가 없을 때) 빈 화면 대신 간단한 안내 + 닫기만 보여준다.
  if (storyCount === 0) {
    return (
      <View style={[styles.root, styles.emptyRoot]}>
        <Text style={styles.emptyText}>머니 리캡을 준비하고 있어요</Text>
        <View style={[styles.closeButtonWrap, { top: insets.top + 40 }]}>
          <MoneyRecapStoryHeader onClose={onClose} />
        </View>
      </View>
    );
  }

  const safeIndex = Math.min(currentIndex, storyCount - 1);
  const currentStory = stories[safeIndex];
  const CurrentStory = currentStory.component;
  const isDark = currentStory.tone === 'dark';
  const storyProps =
    currentStory.key === 'closing' ? { ...currentStory.props, onClose } : currentStory.props;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.touchLayer}
        onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.storyLayer, { opacity: fadeAnim }]}>
          <CurrentStory {...storyProps} />
        </Animated.View>
      </Pressable>

      <View style={[styles.progressOverlay, { top: insets.top + 12 }]} pointerEvents="none">
        <MoneyRecapStoryProgress
          storyCount={storyCount}
          currentIndex={safeIndex}
          progressAnim={progressAnim}
          isDark={isDark}
        />
      </View>

      <View style={[styles.closeButtonWrap, { top: insets.top + 40 }]}>
        <MoneyRecapStoryHeader isDark={isDark} onClose={onClose} />
      </View>

      {isPaused ? (
        <View style={[styles.pauseWrap, { bottom: insets.bottom + 56 }]} pointerEvents="none">
          <Text style={styles.pauseText}>일시정지</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: redesign.bg },
  emptyRoot: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: redesign.textSecondary },
  touchLayer: { flex: 1 },
  storyLayer: { flex: 1 },
  progressOverlay: { position: 'absolute', left: 0, right: 0, zIndex: 50 },
  closeButtonWrap: { position: 'absolute', left: redesign.pagePaddingX - 8, zIndex: 51 },
  pauseWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pauseText: { fontSize: 12, fontWeight: '600', color: redesign.textSecondary },
});
