import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { SPENDING_STATUS } from '../../../features/work/spendingScreenLogic';
import { InlineError, InlineLoading } from './SpendingInlineState';

// API-42 학사 이벤트 예비비. 금액은 서버가 합산한 값을 표시만 한다(프론트 합산·보정 없음).
export default function EventBufferCard({
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
        title="예비비를 불러오지 못했어요"
        message={errorMessage}
        canRetry={canRetry}
        onRetry={onRetry}
      />
    );
  }
  if (status !== SPENDING_STATUS.READY || !viewModel) {
    return <InlineLoading message="예비비를 불러오는 중이에요" />;
  }
  return (
    <View style={styles.card}>
      <View style={styles.accentLine} />
      <Text style={styles.label}>학사 이벤트 예비비</Text>
      <Text style={styles.amount} accessibilityLabel={`예비비 ${viewModel.amountText}`}>
        {viewModel.amountText}
      </Text>
      {viewModel.isEmpty ? (
        <Text style={styles.notice}>
          앞으로 7일 안에 걸치는 일정이 없거나 예상 추가 지출이 0원이에요.
        </Text>
      ) : null}
      <Text style={styles.notice}>{notice}</Text>
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
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.accent,
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
});
