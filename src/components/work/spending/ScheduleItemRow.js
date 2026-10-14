import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';

// API-20 일정 한 줄. 서버가 준 값을 포맷만 해서 보여준다. sourceLabel(자동/직접)은 서버가 출처를 준 경우에만 표시한다.
export default function ScheduleItemRow({
  typeLabel,
  name,
  periodText,
  extraSpendText,
  sourceLabel,
}) {
  return (
    <View style={styles.row}>
      <View style={styles.tag}>
        <Text style={styles.tagText}>{typeLabel}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.period}>
          {sourceLabel ? `${periodText} · ${sourceLabel}` : periodText}
        </Text>
      </View>
      <Text style={styles.amount}>{extraSpendText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
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
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  period: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
});
