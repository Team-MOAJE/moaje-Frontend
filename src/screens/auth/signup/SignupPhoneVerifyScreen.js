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
import { verifyPhoneVerification } from '../../../features/auth/authApi';
import {
  setVerificationProof,
  clearVerificationProof,
} from '../../../features/auth/signupFlowMemory';

const BG_GRAD = ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'];

const SignupPhoneVerifyScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { phoneNumber, termsRecords } = route.params ?? {};

  const [verificationCode, setVerificationCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const allValid = verificationCode.length > 0;

  const handleVerificationCodeChange = text => setVerificationCode(text.replace(/[^0-9]/g, ''));

  const handleVerify = async () => {
    if (!allValid || isSubmitting) return;
    setErrorMsg('');

    setIsSubmitting(true);
    try {
      const data = await dispatch(
        verifyPhoneVerification({ phoneNumber, verificationCode })
      ).unwrap();
      // 성공 응답을 받았을 때만 증빙을 세팅한다.
      setVerificationProof('signup', phoneNumber, data);
      navigation.navigate(ROUTES.SIGNUP_NAME, { phoneNumber, termsRecords });
    } catch {
      setErrorMsg('인증번호가 올바르지 않아요. 다시 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = () => {
    // 재전송은 사실상 새 SMS 인증 flow의 시작이므로 이전 증빙을 무효화한다.
    clearVerificationProof();
    navigation.goBack();
  };

  return (
    <LinearGradient colors={BG_GRAD} locations={[0, 0.5, 1]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={handleResend} activeOpacity={0.7} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>인증번호 확인</Text>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>문자로 받은 인증번호를 입력해 주세요.</Text>

            <View style={[styles.card, shadows.md]}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>인증번호</Text>
                <TextInput
                  style={styles.input}
                  value={verificationCode}
                  onChangeText={handleVerificationCodeChange}
                  placeholder="인증번호를 입력해 주세요"
                  placeholderTextColor="rgba(111,127,63,0.4)"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}

            <TouchableOpacity
              onPress={handleVerify}
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
                {isSubmitting ? '확인 중...' : '인증하기'}
              </Text>
            </TouchableOpacity>

            <View style={styles.linkRow}>
              <TouchableOpacity onPress={handleResend} activeOpacity={0.5}>
                <Text style={styles.linkText}>재전송</Text>
              </TouchableOpacity>
            </View>
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

  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  linkText: {
    fontSize: 12,
    color: colors.textMid,
    textDecorationLine: 'underline',
  },
});

export default SignupPhoneVerifyScreen;
