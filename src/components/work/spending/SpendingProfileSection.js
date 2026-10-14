import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { SPENDING_STATUS } from '../../../features/work/spendingScreenLogic';
import { InlineError, InlineLoading } from './SpendingInlineState';

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

// API-43 AI 소비 프로필. 서버가 분석한 값을 표시만 한다(재계산·보정 없음).
export default function SpendingProfileSection({
  status,
  viewModel,
  notice,
  errorMessage,
  canRetry,
  onRetry,
}) {
  if (status === SPENDING_STATUS.ERROR) {
    return (
      <InlineError
        title="소비 프로필을 불러오지 못했어요"
        message={errorMessage}
        canRetry={canRetry}
        onRetry={onRetry}
      />
    );
  }
  if (status !== SPENDING_STATUS.READY || !viewModel) {
    return <InlineLoading message="소비 프로필을 불러오는 중이에요" />;
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.accentLine} />
        <Text style={styles.title}>AI 소비 프로필</Text>
        <Text style={styles.hero}>{viewModel.avgDailyAmountText}</Text>
        <Text style={styles.heroLabel}>하루 평균 금액</Text>
      </View>
      <View>
        <Row label="소비가 많은 시간대" value={viewModel.peakHourText} />
        <Row label="주요 카테고리" value={viewModel.topCategoryText} />
        <Row label="위험 기준 점수" value={viewModel.riskScoreText} />
        <Row label="마지막 분석" value={viewModel.lastAnalyzedText} />
      </View>
      <Text style={styles.notice}>{notice}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  card: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    gap: 6,
  },
  accentLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: redesign.accent,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.accent,
  },
  hero: {
    fontSize: 32,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  heroLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  rowLabel: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
    textAlign: 'right',
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
});
