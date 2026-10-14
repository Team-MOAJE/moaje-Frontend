import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { SPENDING_STATUS, YEAR_RANGE } from '../../../features/work/spendingScreenLogic';
import { PanelButton } from '../../onboarding/WorkOnboardingStatePanel';
import { InlineEmpty, InlineError, InlineLoading } from './SpendingInlineState';
import ScheduleItemRow from './ScheduleItemRow';
import YearStepper from './YearStepper';

// API-20 학사 일정 목록(자동 불러온 일정 + 직접 등록한 일정) + 연도 선택 + 더 보기. props만 받는다(요청은 상위 세션이 담당).
export default function ScheduleListSection({
  year,
  onChangeYear,
  status,
  items,
  hasMore,
  loadingMore,
  moreErrorMessage,
  canLoadMore,
  onLoadMore,
  errorMessage,
  canRetry,
  onRetry,
}) {
  const renderBody = () => {
    if (status === SPENDING_STATUS.ERROR) {
      return (
        <InlineError
          title="일정을 불러오지 못했어요"
          message={errorMessage}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      );
    }
    if (status !== SPENDING_STATUS.READY) {
      return <InlineLoading message="일정을 불러오는 중이에요" />;
    }
    if (items.length === 0) {
      return (
        <InlineEmpty
          title={`${year}년에 등록된 일정이 없어요`}
          message="학교 일정을 불러오거나 아래에서 직접 등록할 수 있어요."
        />
      );
    }
    return (
      <View>
        {items.map(item => (
          <ScheduleItemRow
            key={item.key}
            typeLabel={item.typeLabel}
            name={item.name}
            periodText={item.periodText}
            extraSpendText={item.extraSpendText}
            sourceLabel={item.sourceLabel}
          />
        ))}
        {moreErrorMessage ? <Text style={styles.moreError}>{moreErrorMessage}</Text> : null}
        {hasMore ? (
          <View style={styles.more}>
            <PanelButton
              label="더 보기"
              variant="secondary"
              onPress={onLoadMore}
              disabled={!canLoadMore}
              loading={loadingMore}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>등록된 일정</Text>
        <YearStepper
          year={year}
          min={YEAR_RANGE.min}
          max={YEAR_RANGE.max}
          onChange={onChangeYear}
        />
      </View>
      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  more: {
    marginTop: 12,
  },
  moreError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#C0392B',
  },
});
