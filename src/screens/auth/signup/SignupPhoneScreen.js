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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { ROUTES } from '../../../constants/routes';
import { colors, radius, shadows } from '../../../theme';
import { requestPhoneVerification } from '../../../features/auth/authApi';
import { clearVerificationProof } from '../../../features/auth/signupFlowMemory';

const BG_GRAD = ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'];

// 휴대폰 번호: 빈값 아님 + 숫자만 + 9~11자리 (통신사별 세부 규칙/인증번호 자릿수는 확정되지 않았으므로 검증하지 않음)
const validatePhoneNumber = v => /^[0-9]{9,11}$/.test(v);

const SignupPhoneScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { termsRecords } = route.params ?? {};

  const [phoneNumber, setPhoneNumber] = useState('');
  const [touched, setTouched] = useState(false);
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

  return (
    <LinearGradient colors={BG_GRAD} locations={[0, 0.5, 1]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>휴대폰 번호 입력</Text>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>회원가입을 위해 휴대폰 번호로 인증번호를 받아요.</Text>

            <View style={[styles.card, shadows.md]}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>휴대폰 번호</Text>
                <TextInput
                  style={[styles.input, phoneNumberInvalid && styles.inputError]}
                  value={phoneNumber}
                  onChangeText={handlePhoneNumberChange}
                  onBlur={() => setTouched(true)}
                  placeholder="휴대폰 번호를 입력해 주세요"
                  placeholderTextColor="rgba(111,127,63,0.4)"
                  keyboardType="phone-pad"
                />
                {phoneNumberInvalid && (
                  <Text style={styles.errorText}>휴대폰 번호를 올바르게 입력해 주세요.</Text>
                )}
              </View>
            </View>

            {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}

            <TouchableOpacity
              onPress={handleRequestVerification}
              disabled={!allValid || isSubmitting}
              activeOpacity={allValid ? 0.85 : 1}
              style={[
                styles.submitBtn,
                allValid && !isSubmitting ? styles.submitBtnActive : styles.submitBtnDisabled,
              ]}
            >
              <Text
                style={[
                  styles.submitBtnText,
                  allValid && !isSubmitting ? styles.submitTextActive : styles.submitTextDisabled,
                ]}
              >
                {isSubmitting ? '요청 중...' : '인증번호 받기'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(52,66,37,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    marginLeft: 8,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDark,
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  desc: {
    fontSize: 14,
    color: colors.textMid,
    marginBottom: 20,
    lineHeight: 22,
  },

  card: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 20,
  },

  fieldGroup: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMid,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgLight,
    fontSize: 14,
    color: colors.textDark,
  },
  inputError: {
    borderColor: colors.red,
    backgroundColor: '#FFF4F4',
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
    lineHeight: 17,
  },
  errorMsg: {
    marginTop: 12,
    fontSize: 13,
    color: colors.red,
    textAlign: 'center',
  },

  submitBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  submitBtnActive: {
    backgroundColor: colors.olive,
    shadowColor: colors.olive,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitTextActive: { color: colors.white },
  submitTextDisabled: { color: 'rgba(111,127,63,0.5)' },
});

export default SignupPhoneScreen;
