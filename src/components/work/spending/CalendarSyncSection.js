import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import {
  SEMESTERS,
  SPENDING_STATUS,
  SYNC_STATUS,
  YEAR_RANGE,
} from '../../../features/work/spendingScreenLogic';
import { PanelButton } from '../../onboarding/WorkOnboardingStatePanel';
import { InlineEmpty, InlineError, InlineLoading } from './SpendingInlineState';
import YearStepper from './YearStepper';

// API-18/19 학교 학사 일정 자동 불러오기. props만 받는다(요청은 상위 세션이 담당).
// 학교 목록은 패널을 펼칠 때만 한 번 요청하고, 동기화(POST)는 '일정 불러오기' 버튼(onSync)에서만 나간다.
export default function CalendarSyncSection({
  open,
  onToggle,
  universities,
  selectedUniversityId,
  onSelectUniversity,
  year,
  semester,
  onChangePeriod,
  canSync,
  syncing,
  onSync,
  resultStatus,
  resultMessage,
  onRefresh,
  errorMessage,
  canRetry,
  onRetry,
}) {
  const renderUniversities = () => {
    if (universities.status === SPENDING_STATUS.ERROR) {
      return (
        <InlineError
          title="학교 목록을 불러오지 못했어요"
          message={errorMessage}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      );
    }
    if (universities.status !== SPENDING_STATUS.READY) {
      return <InlineLoading message="학교 목록을 불러오는 중이에요" />;
    }
    if (universities.viewModel.length === 0) {
      return <InlineEmpty title="선택할 수 있는 학교가 없어요" />;
    }
    return (
      <View style={styles.list}>
        {universities.viewModel.map(item => {
          const selected = item.universityId === selectedUniversityId;
          return (
            <Pressable
              key={item.universityId}
              onPress={() => onSelectUniversity(item.universityId)}
              disabled={syncing}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: syncing }}
              style={({ pressed }) => [
                styles.school,
                selected && styles.schoolSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.schoolName, selected && styles.schoolNameSelected]}>
                {item.name}
              </Text>
              {item.detail ? (
                <Text style={[styles.schoolDetail, selected && styles.schoolDetailSelected]}>
                  {item.detail}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const isProblem =
    resultStatus === SYNC_STATUS.REJECTED || resultStatus === SYNC_STATUS.UNCONFIRMED;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>학교 일정 불러오기</Text>
          <Text style={styles.subtitle}>학교와 학기를 고르면 학사 일정을 한 번에 가져와요.</Text>
        </View>
        <Text style={styles.toggle}>{open ? '접기' : '열기'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.label}>학교</Text>
          {renderUniversities()}

          <Text style={styles.label}>학기</Text>
          <View style={styles.period}>
            <YearStepper
              year={year}
              min={YEAR_RANGE.min}
              max={YEAR_RANGE.max}
              onChange={nextYear => onChangePeriod({ year: nextYear, semester })}
              label="학년도"
            />
            <View style={styles.chips}>
              {SEMESTERS.map(value => {
                const selected = value === semester;
                return (
                  <Pressable
                    key={value}
                    onPress={() => onChangePeriod({ year, semester: value })}
                    disabled={syncing}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && styles.chipSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {value}학기
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PanelButton
            label="일정 불러오기"
            onPress={onSync}
            disabled={!canSync}
            loading={syncing}
          />

          {resultMessage ? (
            <View style={[styles.result, isProblem && styles.resultProblem]}>
              <Text style={[styles.resultText, isProblem && styles.resultTextProblem]}>
                {resultMessage}
              </Text>
              {resultStatus === SYNC_STATUS.UNCONFIRMED ? (
                <PanelButton label="목록 새로고침" variant="secondary" onPress={onRefresh} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    backgroundColor: redesign.surfaceSoft,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
  toggle: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.accent,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  list: {
    gap: 8,
  },
  school: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: redesign.bg,
    gap: 2,
  },
  schoolSelected: {
    backgroundColor: redesign.accent,
  },
  schoolName: {
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  schoolNameSelected: {
    color: '#FFFFFF',
  },
  schoolDetail: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  schoolDetailSelected: {
    color: '#FFFFFF',
  },
  period: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: redesign.bg,
  },
  chipSelected: {
    backgroundColor: redesign.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  result: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: redesign.bg,
    gap: 10,
  },
  resultProblem: {
    backgroundColor: '#FDECEA',
  },
  resultText: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textPrimary,
  },
  resultTextProblem: {
    color: '#C0392B',
  },
  pressed: {
    opacity: 0.6,
  },
});
