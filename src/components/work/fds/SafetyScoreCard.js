import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { FDS_LABELS, FDS_STATUS } from '../../../features/work/fdsScreenLogic';
import { InlineError, InlineLoading } from '../spending/SpendingInlineState';

// API-28 소비 안전도. 점수·등급·메시지는 서버 값을 그대로 보여준다.
// 분석된 거래가 없으면(서버가 100점/A를 줄 수 있음) 값은 그대로 두고 참고용 안내만 덧붙인다.
export default function SafetyScoreCard({ status, viewModel, errorMessage, canRetry, onRetry }) {
  if (status === FDS_STATUS.ERROR) {
    return (
      <InlineError
        title="소비 안전도를 불러오지 못했어요"
        message={errorMessage}
        canRetry={canRetry}
        onRetry={onRetry}
      />
    );
  }
  if (status !== FDS_STATUS.READY || !viewModel) {
    return <InlineLoading message="소비 안전도를 불러오는 중이에요" />;
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={styles.title}>{FDS_LABELS.scoreTitle}</Text>
          <Text style={styles.caption}>{viewModel.periodText}</Text>
        </View>
        <View style={styles.gradeBox} accessibilityLabel={`안전도 등급 ${viewModel.grade}`}>
          <Text style={styles.gradeText}>
            {viewModel.emoji ? `${viewModel.emoji} ` : ''}
            {viewModel.grade}
          </Text>
        </View>
      </View>
      <Text style={styles.score}>{viewModel.scoreText}</Text>
      {viewModel.message ? <Text style={styles.message}>{viewModel.message}</Text> : null}
      {viewModel.referenceNotice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{viewModel.referenceNotice}</Text>
        </View>
      ) : null}
      <View style={styles.rows}>
        {viewModel.rows.map(row => (
          <View key={row.key} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    gap: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  caption: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  gradeBox: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: redesign.accent,
  },
  gradeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  score: {
    fontSize: 34,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textPrimary,
  },
  notice: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: redesign.bg,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
  rows: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: redesign.divider,
  },
  rowLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
});
