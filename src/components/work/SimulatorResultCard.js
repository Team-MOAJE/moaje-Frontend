import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// API-40 결과 표시. viewModel(buildSimulationViewModel 결과)의 문자열을 그대로 보여주며 계산하지 않는다.
const Row = ({ label, text, negative }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, negative && styles.negative]}>{text}</Text>
  </View>
);

export default function SimulatorResultCard({ viewModel, stale }) {
  return (
    <View style={styles.wrap}>
      {stale ? <Text style={styles.stale}>입력이 바뀌었어요. 다시 계산해 주세요.</Text> : null}

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>목표 달성까지</Text>
        <Text style={styles.summaryValue}>{viewModel.months.text}</Text>
        <Text style={styles.summarySub}>진행률 {viewModel.progressText}</Text>
      </View>

      <Text style={styles.sectionTitle}>목표 금액 구성</Text>
      <View style={styles.group}>
        {viewModel.targetRows.map(row => (
          <Row key={row.key} label={row.label} text={row.text} negative={row.isNegative} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>월 현금흐름</Text>
      <View style={styles.group}>
        {viewModel.cashflowRows.map(row => (
          <Row key={row.key} label={row.label} text={row.text} negative={row.isNegative} />
        ))}
      </View>

      <View style={styles.group}>
        <Row label="현재 자산" text={viewModel.currentAssetText} />
        <Row label="목표까지 남은 금액" text={viewModel.gapText} />
      </View>

      {viewModel.assetNotice ? <Text style={styles.notice}>{viewModel.assetNotice}</Text> : null}

      {viewModel.assumedItems.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>가정값으로 계산된 항목</Text>
          {viewModel.assumedItems.map(item => (
            <Text key={item.key} style={styles.bullet}>
              · {item.label}
            </Text>
          ))}
        </View>
      ) : null}

      {viewModel.advice.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>조언</Text>
          {viewModel.advice.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.bullet}>
              · {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  stale: {
    fontSize: 13,
    lineHeight: 19,
    color: '#C0392B',
  },
  summary: {
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    padding: 18,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  summarySub: {
    fontSize: 13,
    color: redesign.accent,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: redesign.divider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: redesign.textSecondary,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  negative: {
    color: '#C0392B',
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
  block: {
    gap: 6,
  },
  bullet: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textPrimary,
  },
});
