import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import {
  REPORT_EVENT_NOTICE,
  REPORT_LABELS,
  REPORT_NOTICE,
  SEMESTERS,
  SPENDING_STATUS,
  YEAR_RANGE,
} from '../../../features/work/spendingScreenLogic';
import { InlineEmpty, InlineError, InlineLoading } from './SpendingInlineState';
import ReportEventRow from './ReportEventRow';
import ReportScoreCard from './ReportScoreCard';
import YearStepper from './YearStepper';

const EVENT_ROW_LABELS = Object.freeze({
  avg: REPORT_LABELS.eventAvgLimit,
  total: REPORT_LABELS.eventTotalLimit,
  ratio: REPORT_LABELS.eventRatio,
});

const InfoRows = ({ rows }) => (
  <View>
    {rows.map(row => (
      <View key={row.key} style={styles.infoRow}>
        <Text style={styles.infoLabel}>{row.label}</Text>
        <Text style={styles.infoValue}>{row.value}</Text>
      </View>
    ))}
  </View>
);

// API-46 학기 리포트. 점수·등급은 서버 값 그대로 표시한다.
// 금액은 Daily Limit 계산 기록 기준이므로 항상 안내 문구(REPORT_NOTICE)를 함께 보여준다.
export default function SemesterReportSection({
  year,
  semester,
  onChangePeriod,
  status,
  viewModel,
  errorMessage,
  canRetry,
  onRetry,
}) {
  const renderBody = () => {
    if (status === SPENDING_STATUS.ERROR) {
      return (
        <InlineError
          title="리포트를 불러오지 못했어요"
          message={errorMessage}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      );
    }
    if (status !== SPENDING_STATUS.READY || !viewModel) {
      return <InlineLoading message="리포트를 불러오는 중이에요" />;
    }

    return (
      <View style={styles.body}>
        <ReportScoreCard
          title={REPORT_LABELS.scoreTitle}
          periodLabel={viewModel.periodLabel}
          periodText={viewModel.periodText}
          gradeText={viewModel.gradeText}
          isNotEvaluated={viewModel.isNotEvaluated}
          scoreText={viewModel.scoreText}
          summaryMessage={viewModel.summaryMessage}
          breakdownTitle={REPORT_LABELS.breakdownTitle}
          breakdown={viewModel.breakdown}
        />

        <Text style={styles.notice}>{REPORT_NOTICE}</Text>

        <Text style={styles.sectionTitle}>{REPORT_LABELS.limitTitle}</Text>
        <InfoRows rows={viewModel.limitRows} />

        <Text style={styles.sectionTitle}>{REPORT_LABELS.fdsTitle}</Text>
        <InfoRows rows={viewModel.fdsRows} />

        <Text style={styles.sectionTitle}>{REPORT_LABELS.eventsTitle}</Text>
        {viewModel.events.length === 0 ? (
          <InlineEmpty title="이 학기에 분석할 이벤트가 없어요" message={REPORT_EVENT_NOTICE} />
        ) : (
          <View>
            {viewModel.events.map(event => (
              <ReportEventRow
                key={event.key}
                typeLabel={event.typeLabel}
                name={event.name}
                periodText={event.periodText}
                avgLimitText={event.avgLimitText}
                totalLimitText={event.totalLimitText}
                ratioText={event.ratioText}
                labels={EVENT_ROW_LABELS}
              />
            ))}
            <Text style={styles.notice}>{REPORT_EVENT_NOTICE}</Text>
          </View>
        )}

        {viewModel.badges.length > 0 ? (
          <View style={styles.badges}>
            <Text style={styles.sectionTitle}>{REPORT_LABELS.badgesTitle}</Text>
            {viewModel.badges.map((badge, index) => (
              <Text key={`${badge}|${index}`} style={styles.badge}>
                {badge}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <YearStepper
          year={year}
          min={YEAR_RANGE.min}
          max={YEAR_RANGE.max}
          onChange={nextYear => onChangePeriod({ year: nextYear, semester })}
        />
        <View style={styles.semesters}>
          {SEMESTERS.map(value => {
            const selected = value === semester;
            return (
              <Pressable
                key={value}
                onPress={() => onChangePeriod({ year, semester: value })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.semester,
                  selected && styles.semesterSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.semesterText, selected && styles.semesterTextSelected]}>
                  {value}학기
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  semesters: {
    flexDirection: 'row',
    gap: 8,
  },
  semester: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: redesign.surfaceSoft,
    borderWidth: 1,
    borderColor: redesign.divider,
  },
  semesterSelected: {
    backgroundColor: redesign.accent,
    borderColor: redesign.accent,
  },
  semesterText: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  semesterTextSelected: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    gap: 14,
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
  sectionTitle: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    color: redesign.textSecondary,
  },
  infoValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
    textAlign: 'right',
  },
  badges: {
    gap: 8,
  },
  badge: {
    fontSize: 14,
    lineHeight: 20,
    color: redesign.textPrimary,
  },
});
