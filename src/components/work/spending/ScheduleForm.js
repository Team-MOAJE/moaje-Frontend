import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import {
  EVENT_TYPE_OPTIONS,
  SUBMIT_STATUS,
  describeScheduleFieldError,
} from '../../../features/work/spendingScreenLogic';
import { PanelButton } from '../../onboarding/WorkOnboardingStatePanel';

// API-44 학사 일정 등록 폼. 입력 변경은 요청을 만들지 않으며 요청은 '등록' 버튼 탭(onSubmit)에서만 나간다.
export default function ScheduleForm({
  form,
  formErrors,
  onChangeField,
  onSubmit,
  canSubmit,
  submitting,
  resultStatus,
  resultMessage,
  onRefresh,
}) {
  const renderField = ({ key, label, placeholder, keyboardType, maxLength }) => {
    const errorCode = formErrors[key];
    return (
      <View key={key} style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={form[key]}
          onChangeText={text => onChangeField(key, text)}
          keyboardType={keyboardType}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={redesign.navInactive}
          accessibilityLabel={label}
          style={[styles.input, errorCode && styles.inputError]}
        />
        {errorCode ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {describeScheduleFieldError(errorCode)}
          </Text>
        ) : null}
      </View>
    );
  };

  const isProblem =
    resultStatus === SUBMIT_STATUS.REJECTED || resultStatus === SUBMIT_STATUS.UNCONFIRMED;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>학사 일정 등록</Text>

      <View style={styles.field}>
        <Text style={styles.label}>일정 유형</Text>
        <View style={styles.chips}>
          {EVENT_TYPE_OPTIONS.map(option => {
            const selected = form.eventType === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChangeField('eventType', option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {formErrors.eventType ? (
          <Text style={styles.error}>{describeScheduleFieldError(formErrors.eventType)}</Text>
        ) : null}
      </View>

      {renderField({
        key: 'eventName',
        label: '일정 이름',
        placeholder: '예: 학과 MT',
        maxLength: 120,
      })}
      {renderField({
        key: 'startDate',
        label: '시작일',
        placeholder: 'YYYY-MM-DD',
        keyboardType: 'number-pad',
        maxLength: 10,
      })}
      {renderField({
        key: 'endDate',
        label: '종료일',
        placeholder: 'YYYY-MM-DD',
        keyboardType: 'number-pad',
        maxLength: 10,
      })}
      {renderField({
        key: 'expectedExtraSpend',
        label: '예상 추가 지출 (원, 선택)',
        placeholder: '비워두면 0원으로 등록돼요',
        keyboardType: 'number-pad',
      })}

      <PanelButton label="등록" onPress={onSubmit} disabled={!canSubmit} loading={submitting} />

      {resultMessage ? (
        <View style={[styles.result, isProblem && styles.resultProblem]}>
          <Text style={[styles.resultText, isProblem && styles.resultTextProblem]}>
            {resultMessage}
          </Text>
          {resultStatus === SUBMIT_STATUS.UNCONFIRMED ? (
            <PanelButton label="목록 새로고침" variant="secondary" onPress={onRefresh} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: redesign.divider,
    backgroundColor: redesign.surfaceSoft,
    paddingHorizontal: 14,
    fontSize: 15,
    color: redesign.textPrimary,
  },
  inputError: {
    borderColor: '#C0392B',
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
    color: '#C0392B',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: redesign.surfaceSoft,
    borderWidth: 1,
    borderColor: redesign.divider,
  },
  chipSelected: {
    backgroundColor: redesign.accent,
    borderColor: redesign.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
  result: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: redesign.surfaceSoft,
    gap: 10,
  },
  resultProblem: {
    borderWidth: 1,
    borderColor: '#E7B9B3',
  },
  resultText: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textPrimary,
  },
  resultTextProblem: {
    color: '#8C2F23',
  },
});
