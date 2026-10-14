import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';

// API-46 종합 점수·등급 카드. 점수·등급·총평은 서버 값 그대로 표시한다(재계산·등급 환산 없음).
// "N/A"(미평가)는 오류가 아니라 Daily Limit 기록이 없어 채점할 수 없다는 뜻이다.
export default function ReportScoreCard({
  title,
  periodLabel,
  periodText,
  gradeText,
  isNotEvaluated,
  scoreText,
  summaryMessage,
  breakdownTitle,
  breakdown,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.accentLine} />
      <Text style={styles.period}>
        {periodLabel} · {periodText}
      </Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.gradeRow}>
        <Text style={styles.grade} accessibilityLabel={`등급 ${gradeText}`}>
          {gradeText}
        </Text>
        {isNotEvaluated ? null : <Text style={styles.score}>{scoreText}</Text>}
      </View>
      {isNotEvaluated ? (
        <Text style={styles.notEvaluated}>
          Daily Limit 기록이 아직 없어 등급을 매길 수 없어요. 계산된 점수 {scoreText}은
          참고용이에요.
        </Text>
      ) : null}
      {summaryMessage ? <Text style={styles.summary}>{summaryMessage}</Text> : null}

      <Text style={styles.breakdownTitle}>{breakdownTitle}</Text>
      {breakdown.map(item => (
        <View key={item.key} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{item.label}</Text>
          <Text style={styles.breakdownScore}>{item.scoreText}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    gap: 8,
  },
  accentLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: redesign.accent,
  },
  period: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.accent,
  },
  title: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  grade: {
    fontSize: 44,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  score: {
    paddingBottom: 8,
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  notEvaluated: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
  summary: {
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textPrimary,
  },
  breakdownTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  breakdownScore: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
});
