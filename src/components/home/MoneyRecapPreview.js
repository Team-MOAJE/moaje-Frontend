import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// Home 머니 타입 탭의 소비 요약 카드(feat/preview 머니 리캡 카드 디자인). 값은 모두 props로만 받는다.
// recap = { state: 'loading' | 'error' | 'empty' | 'ready', periodLabel, summary, rows: [{ key, label, value }] } | null
// 서버(API-16/17)가 주지 않는 학기·시험기간 분석은 다루지 않는다. 카드를 누르면 월별 분석 화면으로 이동한다.
const STATE_MESSAGES = {
  loading: '소비 요약을 불러오는 중이에요',
  error: '소비 요약을 불러오지 못했어요',
  empty: '이 달에는 집계된 거래가 없어요.',
};

export default function MoneyRecapPreview({ recap, onPress }) {
  const message = recap ? STATE_MESSAGES[recap.state] : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="이번 달 소비 요약 전체 보기"
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Text style={styles.headerTitle}>이번 달 소비 요약</Text>

      <View style={styles.card}>
        {recap && recap.state === 'ready' ? (
          <>
            {recap.periodLabel ? <Text style={styles.period}>{recap.periodLabel}</Text> : null}
            {recap.summary ? <Text style={styles.summary}>{recap.summary}</Text> : null}
            <View style={styles.rows}>
              {recap.rows.map(row => (
                <View key={row.key} style={styles.row}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.empty}>{message ?? STATE_MESSAGES.loading}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 36,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  card: {
    marginTop: 12,
    padding: 20,
    borderRadius: 14,
    backgroundColor: redesign.surfaceSoft,
  },
  period: {
    fontSize: 12,
    fontWeight: '600',
    color: redesign.accent,
  },
  summary: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    color: redesign.textPrimary,
    marginTop: 8,
  },
  rows: {
    marginTop: 18,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginLeft: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  empty: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});
