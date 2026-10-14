import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';

// API-46 학사 이벤트별 Daily Limit 기록 한 줄. 값은 Daily Limit 계산 기록 기준이며 서버 값을 포맷만 한다.
export default function ReportEventRow({
  typeLabel,
  name,
  periodText,
  avgLimitText,
  totalLimitText,
  ratioText,
  labels,
}) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{typeLabel}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
      </View>
      <Text style={styles.period}>{periodText}</Text>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>{labels.avg}</Text>
        <Text style={styles.lineValue}>{avgLimitText}</Text>
      </View>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>{labels.total}</Text>
        <Text style={styles.lineValue}>{totalLimitText}</Text>
      </View>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>{labels.ratio}</Text>
        <Text style={styles.lineValue}>{ratioText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: redesign.surfaceSoft,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: redesign.accent,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  period: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  lineValue: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
});
