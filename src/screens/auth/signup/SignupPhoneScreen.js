import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { ROUTES } from '../../../constants/routes';
import { colors } from '../../../theme';
import { redesign } from '../../../theme/redesign';
import { requestPhoneVerification } from '../../../features/auth/authApi';
import { clearVerificationProof } from '../../../features/auth/signupFlowMemory';

// 휴대폰 번호: 빈값 아님 + 숫자만 + 9~11자리 (통신사별 세부 규칙/인증번호 자릿수는 확정되지 않았으므로 검증하지 않음)
const validatePhoneNumber = v => /^[0-9]{9,11}$/.test(v);

const SignupPhoneScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { termsRecords } = route.params ?? {};

  const [phoneNumber, setPhoneNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handlePhoneNumberChange = text => setPhoneNumber(text.replace(/[^0-9]/g, '').slice(0, 11));
  const phoneNumberInvalid = touched && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);
  const allValid = validatePhoneNumber(phoneNumber);

  const handleBack = () => navigation.popToTop();

  const handleRequestVerification = async () => {
    setTouched(true);
    if (!allValid || isSubmitting) return;

    // 새 SMS 인증 flow 시작(전화번호가 바뀌었을 수 있음) — 이전 증빙은 무조건 무효화한다.
    clearVerificationProof();
    setErrorMsg('');

    setIsSubmitting(true);
    try {
      await dispatch(requestPhoneVerification({ phoneNumber })).unwrap();
      navigation.navigate(ROUTES.SIGNUP_PHONE_VERIFY, { phoneNumber, termsRecords });
    } catch {
      setErrorMsg('휴대폰 인증 기능은 아직 준비 중이에요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const ctaActive = allValid && !isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="arrow-left" size={22} color={redesign.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headline}>{'휴대폰 번호를\n입력해 주세요'}</Text>
          <Text style={styles.desc}>회원가입을 위해 휴대폰 번호로 인증번호를 받아요.</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>휴대폰 번호</Text>
            <TextInput
              style={[
                styles.input,
                focused && styles.inputFocused,
                phoneNumberInvalid && styles.inputError,
              ]}
              value={phoneNumber}
              onChangeText={handlePhoneNumberChange}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                setTouched(true);
              }}
              placeholder="휴대폰 번호를 입력해 주세요"
              placeholderTextColor={redesign.navInactive}
              keyboardType="phone-pad"
            />
            {phoneNumberInvalid && (
              <Text style={styles.errorText}>휴대폰 번호를 올바르게 입력해 주세요.</Text>
            )}
          </View>

          {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleRequestVerification}
            disabled={!allValid || isSubmitting}
            activeOpacity={allValid ? 0.85 : 1}
            style={[
              styles.submitBtn,
              ctaActive ? styles.submitBtnActive : styles.submitBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.submitBtnText,
                ctaActive ? styles.submitTextActive : styles.submitTextDisabled,
              ]}
            >
              {isSubmitting ? '요청 중...' : '인증번호 받기'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: redesign.bg },
  flex: { flex: 1 },

  header: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },

  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headline: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  desc: {
    marginTop: 12,
    marginBottom: 36,
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
  },

  fieldGroup: { gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: redesign.textSecondary,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: redesign.divider,
    backgroundColor: redesign.bg,
    fontSize: 16,
    color: redesign.textPrimary,
  },
  inputFocused: {
    borderColor: redesign.accent,
  },
  inputError: {
    borderColor: colors.red,
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
    lineHeight: 17,
  },
  errorMsg: {
    marginTop: 16,
    fontSize: 13,
    color: colors.red,
  },

  footer: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 8,
    paddingBottom: 24,
  },
  submitBtn: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnActive: { backgroundColor: redesign.accent },
  submitBtnDisabled: { backgroundColor: redesign.divider },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  submitTextActive: { color: '#FFFFFF' },
  submitTextDisabled: { color: redesign.navInactive },
});

export default SignupPhoneScreen;
