import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow, iconBoxTheme } from '../../constants/statusTheme';

// ── 점 3개 로딩 인디케이터 ──────────────────────────────────────
const DotIndicator = () => {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dots = [dot0, dot1, dot2];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={dotStyles.row}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            dotStyles.dot,
            {
              opacity: dot,
              transform: [
                {
                  scale: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.7, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.oliveDeep,
  },
});

// ── 스켈레톤 플레이스홀더 바 ─────────────────────────────────────
const SkeletonBar = ({ width = '100%', height = 14, style }) => {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius.xs,
          backgroundColor: colors.hairline,
          opacity: anim,
        },
        style,
      ]}
    />
  );
};

// ── Plant Loading (스플래시) ─────────────────────────────────────
const PlantLoading = ({
  title = '모아제',
  description = '오늘의 가용금액을 계산하고 있어요',
  subDescription = '내 계좌와 이체 기록을 안전하게 확인하는 중이에요',
}) => (
  <View style={plantStyles.container}>
    <Text style={plantStyles.brand}>{title}</Text>

    <View style={[plantStyles.iconBox, { backgroundColor: iconBoxTheme.PLANT.bg }]}>
      <Ionicons name="leaf-outline" size={48} color={iconBoxTheme.PLANT.color} />
    </View>

    <View style={plantStyles.textArea}>
      <Text style={plantStyles.description}>{description}</Text>
      <Text style={plantStyles.subDescription}>{subDescription}</Text>
    </View>

    <DotIndicator />
  </View>
);

const plantStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.forest,
    letterSpacing: -1,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  subDescription: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
});

// ── Data Loading ─────────────────────────────────────────────────
const DataLoading = () => (
  <View style={dataStyles.wrapper}>
    {/* 컴팩트 카드: 아이콘 + 텍스트만 */}
    <View style={dataStyles.card}>
      <View style={[dataStyles.iconBox, { backgroundColor: iconBoxTheme.DATA.bg }]}>
        <Ionicons name="sync-outline" size={32} color={iconBoxTheme.DATA.color} />
      </View>
      <Text style={dataStyles.title}>잠시만 기다려줘</Text>
      <Text style={dataStyles.body}>안전하게 데이터를 확인하고 있어요</Text>
    </View>

    {/* 카드 외부 스켈레톤 플레이스홀더 */}
    {[80, 65, 50].map((w, i) => (
      <View key={i} style={dataStyles.skeletonCard}>
        <SkeletonBar width={44} height={44} style={{ borderRadius: radius.md }} />
        <View style={dataStyles.skeletonTextCol}>
          <SkeletonBar width={`${w}%`} height={13} />
          <SkeletonBar width={`${w - 20}%`} height={11} />
        </View>
      </View>
    ))}
  </View>
);

const dataStyles = StyleSheet.create({
  wrapper: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.cardHeavy,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  skeletonTextCol: {
    flex: 1,
    gap: 6,
  },
});

// ── Skeleton Loading (홈 구조 모사) ─────────────────────────────
const SkeletonLoading = () => (
  <View style={skelStyles.container}>
    {/* 상단 히어로 카드 */}
    <View style={[skelStyles.heroCard, { backgroundColor: colors.oliveSoft }]}>
      <SkeletonBar width="40%" height={13} style={{ backgroundColor: colors.oliveLight }} />
      <SkeletonBar
        width="70%"
        height={32}
        style={{ backgroundColor: colors.oliveLight, borderRadius: radius.sm }}
      />
      <SkeletonBar width="50%" height={12} style={{ backgroundColor: colors.oliveLight }} />
    </View>

    {/* 퀵액션 영역 (4개 원형 버튼) */}
    <View style={skelStyles.quickActions}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={skelStyles.quickItem}>
          <SkeletonBar width={52} height={52} style={{ borderRadius: 26 }} />
          <SkeletonBar width={40} height={10} style={{ marginTop: spacing.xs }} />
        </View>
      ))}
    </View>

    {/* 리스트 카드 */}
    <View style={skelStyles.listCard}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={skelStyles.listRow}>
          <SkeletonBar width={44} height={44} style={{ borderRadius: radius.md }} />
          <View style={skelStyles.listTextCol}>
            <SkeletonBar width="70%" height={13} />
            <SkeletonBar width="45%" height={11} />
          </View>
          <SkeletonBar width={50} height={13} />
        </View>
      ))}
    </View>

    {/* 하단 네비게이션 */}
    <View style={skelStyles.navBar}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={skelStyles.navItem}>
          <SkeletonBar width={24} height={24} style={{ borderRadius: radius.xs }} />
          <SkeletonBar width={32} height={10} />
        </View>
      ))}
    </View>
  </View>
);

const skelStyles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  heroCard: {
    borderRadius: radius.xxl,
    padding: spacing.xxl,
    gap: spacing.md,
    minHeight: 160,
    justifyContent: 'flex-end',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  quickItem: {
    alignItems: 'center',
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.card,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  listTextCol: {
    flex: 1,
    gap: 6,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  navItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
});

// ── 메인 export ──────────────────────────────────────────────────
const LoadingStateCard = ({ loadingType = 'plant', title, description, subDescription }) => {
  if (loadingType === 'skeleton') return <SkeletonLoading />;
  if (loadingType === 'data') return <DataLoading />;
  return <PlantLoading title={title} description={description} subDescription={subDescription} />;
};

export default LoadingStateCard;
