import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// 준비도 항목 한 줄. 점수는 buildReadinessViewModel이 만든 scoreText('score / weight')를 그대로 쓴다.
// score가 null인 항목(isExcluded)은 '평가 제외'로 표시해 실제 0점('0 / 15')과 구분한다.
export default function ReadinessItemRow({ label, detail, scoreText, isExcluded }) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.score, isExcluded && styles.scoreExcluded]}>
          {isExcluded ? '평가 제외' : scoreText}
        </Text>
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
    gap: 6,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  score: {
    fontSize: 15,
    fontWeight: '800',
    color: redesign.accent,
  },
  scoreExcluded: {
    fontWeight: '600',
    color: redesign.textSecondary,
  },
  detail: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
});
