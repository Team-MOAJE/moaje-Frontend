import React from 'react';
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// 홈 생활비 분석 탭. 월 지출 합계와 카테고리별 금액은 서버 값(homeTabLogic.buildHomeExpenseView 결과)이다.
// 서버는 비율(%)을 주지 않으므로 퍼센트를 표시하지 않는다. 막대 길이(barRatio)는 금액 기반 시각 표현일 뿐이다.
// state: 'loading' | 'error' | 'empty' | 'ready'
export default function HomeExpenseAnalysisTab({
  state = 'ready',
  monthLabel,
  totalText,
  topCategoryName,
  rows,
  onRetry,
  onDetailPress,
}) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>{monthLabel ? `${monthLabel} 생활비` : '생활비'}</Text>
        {state === 'ready' || state === 'empty' ? (
          <Text style={styles.total}>{totalText}</Text>
        ) : null}
      </View>

      {state === 'loading' ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={redesign.accent} />
          <Text style={styles.stateText}>생활비를 불러오는 중이에요</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>생활비를 불러오지 못했어요</Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'empty' ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>이 달에는 집계된 거래가 없어요.</Text>
        </View>
      ) : null}

      {state === 'ready' ? (
        <View>
          {topCategoryName ? (
            <Text style={styles.sub}>{`${topCategoryName}에 가장 많이 썼어요`}</Text>
          ) : null}
          {rows.map(row => (
            <View key={row.key} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{row.name}</Text>
                <Text style={styles.itemAmount}>{row.amountText}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(row.barRatio * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {state !== 'loading' ? (
        <Pressable
          onPress={onDetailPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="월별 분석 보기"
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
        >
          <Text style={styles.viewAllText}>월별 분석 보기</Text>
          <Text style={styles.viewAllChevron}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  total: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  sub: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 6,
  },
  stateBox: {
    marginTop: 20,
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  stateText: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 8,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  item: {
    marginTop: 22,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: redesign.divider,
    overflow: 'hidden',
    marginTop: 10,
  },
  fill: {
    height: 4,
    backgroundColor: redesign.textPrimary,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 28,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  viewAllChevron: {
    fontSize: 16,
    color: redesign.textSecondary,
    marginLeft: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
