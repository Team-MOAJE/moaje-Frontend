import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, redesign } from '../../theme';

// 상태 의미(safe/warning/exceeded)와 문구는 기존 그대로, 표현만 flat한 한 줄로 정리했다.
const STATUS_CONFIG = {
  safe: {
    label: '안정',
    message: '오늘은 아직 여유 있어요.',
    color: redesign.accent,
  },
  warning: {
    label: '주의',
    message: '오늘 권장 금액에 가까워지고 있어요.',
    color: colors.orange,
  },
  exceeded: {
    label: '초과',
    message: '오늘 가용금액을 초과했어요.',
    color: colors.red,
  },
};

export default function DailyLimitStatusCard({ status = 'safe' }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.safe;

  return (
    <View style={styles.row} accessibilityLabel={`오늘 소비 상태 ${cfg.label}. ${cfg.message}`}>
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>
      <Text style={styles.message}>{cfg.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: redesign.textPrimary,
    marginLeft: 8,
  },
});
