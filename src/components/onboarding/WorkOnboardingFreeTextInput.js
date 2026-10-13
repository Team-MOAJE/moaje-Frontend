import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';
import {
  FREE_TEXT_STATUS,
  getFreeTextInputState,
} from '../../features/onboarding/workOnboardingScreenLogic';
import { MAX_FREE_TEXT_LENGTH } from '../../features/onboarding/useWorkOnboardingFlow';

// Q9 서술형 입력(제어 컴포넌트). 입력창 값(value)은 상위 화면이 들고 있으며 컨트롤러 답변(answer)과 어긋나면
// 오류를 표시한다(진행 차단은 상위 화면이 getNavigationGuard로 처리).
// maxLength를 쓰지 않는다: RN maxLength는 UTF-16 단위라 Flow의 글자 수 규칙(코드포인트)과 달라진다.
export default function WorkOnboardingFreeTextInput({
  value,
  answer,
  onChangeText,
  onSkip,
  disabled,
  placeholder,
}) {
  const localText = value;
  const inputState = getFreeTextInputState({ localText, answer });
  const hasError =
    inputState.status === FREE_TEXT_STATUS.BLANK ||
    inputState.status === FREE_TEXT_STATUS.TOO_LONG ||
    inputState.status === FREE_TEXT_STATUS.UNSYNCED;
  const skipped = inputState.status === FREE_TEXT_STATUS.SKIPPED;

  return (
    <View style={styles.wrap}>
      <TextInput
        value={localText}
        onChangeText={onChangeText}
        editable={!disabled}
        multiline
        textAlignVertical="top"
        returnKeyType="done"
        blurOnSubmit
        placeholder={placeholder ?? '자유롭게 적어주세요'}
        placeholderTextColor={colors.textLight}
        accessibilityLabel="서술형 답변 입력"
        style={[styles.input, hasError && styles.inputError, skipped && styles.inputSkipped]}
      />

      <View style={styles.metaRow}>
        <Text
          style={[styles.error, !hasError && styles.errorHidden]}
          accessibilityLiveRegion="polite"
        >
          {hasError ? inputState.message : ' '}
        </Text>
        <Text
          style={[
            styles.counter,
            inputState.status === FREE_TEXT_STATUS.TOO_LONG && styles.counterError,
          ]}
        >
          {inputState.count}/{MAX_FREE_TEXT_LENGTH}
        </Text>
      </View>

      <Pressable
        onPress={disabled ? undefined : onSkip}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected: skipped }}
        style={({ pressed }) => [
          styles.skipBtn,
          skipped && styles.skipBtnSelected,
          pressed && styles.skipBtnPressed,
        ]}
      >
        {skipped && <Feather name="check-circle" size={18} color={colors.olive} />}
        <Text style={[styles.skipText, skipped && styles.skipTextSelected]}>아직 모르겠어요</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  input: {
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textDark,
  },
  inputError: {
    borderColor: colors.red,
  },
  inputSkipped: {
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  error: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.red,
  },
  errorHidden: {
    opacity: 0,
  },
  counter: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMid,
  },
  counterError: {
    color: colors.red,
  },
  skipBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  skipBtnSelected: {
    borderColor: colors.olive,
    backgroundColor: colors.bgOuter,
  },
  skipBtnPressed: {
    opacity: 0.85,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMid,
  },
  skipTextSelected: {
    color: colors.oliveDark,
  },
});
