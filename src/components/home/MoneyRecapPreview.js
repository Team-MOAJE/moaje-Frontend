import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// Home용 머니 리캡 요약. 전체 Money Recap 화면을 복제하지 않고 핵심 값만 props로 받아 보여준다.
// recap = { periodLabel, summary, rows: [{ key, label, value }] } | null
export default function MoneyRecapPreview({ recap, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="이번 학기 나의 머니 리캡 전체 보기"
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Text style={styles.headerTitle}>이번 학기 나의 머니 리캡</Text>

      <View style={styles.card}>
        {recap ? (
          <>
            <Text style={styles.period}>{recap.periodLabel}</Text>
            <Text style={styles.summary}>{recap.summary}</Text>
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
          <Text style={styles.empty}>머니 리캡을 준비하고 있어요</Text>
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
