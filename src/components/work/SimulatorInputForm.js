import { View, Text, TextInput, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';
import { PanelButton } from '../onboarding/WorkOnboardingStatePanel';
import { SIMULATOR_FIELDS, describeFieldError } from '../../features/work/simulatorScreenLogic';

// API-40 입력 폼. props만 받는다. 입력 변경은 요청을 만들지 않으며 요청은 '계산하기' 탭(onSubmit)에서만 나간다.
export default function SimulatorInputForm({
  form,
  fieldErrors,
  onChangeField,
  onSubmit,
  canSubmit,
  loading,
}) {
  return (
    <View style={styles.wrap}>
      {SIMULATOR_FIELDS.map(field => {
        const errorCode = fieldErrors[field.key];
        return (
          <View key={field.key} style={styles.field}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              value={form[field.key]}
              onChangeText={text => onChangeField(field.key, text)}
              keyboardType="number-pad"
              placeholder="입력하지 않으면 기본값"
              placeholderTextColor={redesign.navInactive}
              accessibilityLabel={field.label}
              style={[styles.input, errorCode && styles.inputError]}
            />
            {errorCode ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {describeFieldError(errorCode)}
              </Text>
            ) : (
              <Text style={styles.hint}>{field.hint}</Text>
            )}
          </View>
        );
      })}
      <PanelButton label="계산하기" onPress={onSubmit} disabled={!canSubmit} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
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
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: redesign.textSecondary,
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
    color: '#C0392B',
  },
});
