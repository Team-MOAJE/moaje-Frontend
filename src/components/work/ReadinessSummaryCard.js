import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// 사회인 준비도 요약 카드. 서버가 계산한 percent / level / levelLabel / message를 그대로 보여준다.
// 값을 다시 계산하거나 보정하지 않는다(프레젠테이션 전용, props만 받음).
export default function ReadinessSummaryCard({ percent, level, levelLabel, message }) {
  return (
    <View style={styles.card}>
      <View style={styles.accentLine} />
      <Text style={styles.levelLabel}>
        Lv.{level} · {levelLabel}
      </Text>
      <Text style={styles.percent} accessibilityLabel={`준비도 ${percent}퍼센트`}>
        {percent}
        <Text style={styles.percentUnit}>%</Text>
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    gap: 10,
  },
  accentLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: redesign.accent,
  },
  levelLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.accent,
  },
  percent: {
    fontSize: 44,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  percentUnit: {
    fontSize: 22,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: redesign.divider,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: redesign.accent,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textPrimary,
  },
});
