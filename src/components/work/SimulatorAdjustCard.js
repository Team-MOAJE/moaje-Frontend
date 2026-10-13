import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';
import { PanelButton } from '../onboarding/WorkOnboardingStatePanel';
import { ADJUST_DIRECTION, describeFieldError } from '../../features/work/simulatorScreenLogic';

// API-41 지출 줄이기/늘리기 비교. props만 받는다. 요청은 '조정 계산' 탭(onSubmit)에서만 나간다.
// adjustment: 세션 스냅샷의 adjustment({ status, viewModel, errorMessage, retryable }).
const DIRECTIONS = [
  { value: ADJUST_DIRECTION.SAVE, label: '줄이기' },
  { value: ADJUST_DIRECTION.INCREASE, label: '늘리기' },
];

const Row = ({ label, text, negative }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, negative && styles.negative]}>{text}</Text>
  </View>
);

export default function SimulatorAdjustCard({
  adjustForm,
  adjustFormError,
  adjustment,
  onChangeDirection,
  onChangeAmount,
  onSubmit,
  canSubmit,
  loading,
}) {
  const model = adjustment.viewModel;

  return (
    <View style={styles.wrap}>
      <View style={styles.toggle}>
        {DIRECTIONS.map(item => {
          const selected = adjustForm.direction === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChangeDirection(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.toggleBtn,
                selected && styles.toggleBtnSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>월 변경 금액</Text>
        <TextInput
          value={adjustForm.amount}
          onChangeText={onChangeAmount}
          keyboardType="number-pad"
          placeholder="예: 100000"
          placeholderTextColor={redesign.navInactive}
          accessibilityLabel="월 변경 금액"
          style={[styles.input, adjustFormError && styles.inputError]}
        />
        {adjustFormError ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {describeFieldError(adjustFormError)}
          </Text>
        ) : null}
      </View>

      <PanelButton label="조정 계산" onPress={onSubmit} disabled={!canSubmit} loading={loading} />

      {adjustment.status === 'error' ? (
        <Text style={styles.error}>{adjustment.errorMessage}</Text>
      ) : null}

      {adjustment.status === 'ready' && model ? (
        <View style={styles.result}>
          <Text style={styles.message}>{model.message}</Text>
          <View style={styles.group}>
            <Row label="월 변경 금액" text={model.monthlyDeltaText} />
            <Row label="기준 월 저축 가능액" text={model.baseSavableText} />
            <Row
              label="조정 후 월 저축 가능액"
              text={model.adjustedSavableText}
              negative={model.adjustedSavableIsNegative}
            />
            <Row label="기준 달성 시점" text={model.baseMonths.text} />
            <Row label="조정 후 달성 시점" text={model.adjustedMonths.text} />
            <Row label="변화" text={model.monthsSaved.text} />
          </View>
          {model.baseNotice ? <Text style={styles.notice}>{model.baseNotice}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  toggle: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: redesign.divider,
    backgroundColor: redesign.bg,
  },
  toggleBtnSelected: {
    borderColor: redesign.accent,
    backgroundColor: redesign.surfaceSoft,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.textSecondary,
  },
  toggleTextSelected: {
    color: redesign.accent,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
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
  result: {
    gap: 10,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
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
});
