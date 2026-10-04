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
import { verifyPhoneVerification } from '../../../features/auth/authApi';
import {
  setVerificationProof,
  clearVerificationProof,
} from '../../../features/auth/signupFlowMemory';

const SignupPhoneVerifyScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { phoneNumber, termsRecords } = route.params ?? {};

  const [verificationCode, setVerificationCode] = useState('');
  const [focused, setFocused] = useState(false);
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

  const ctaActive = allValid && !isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleResend}
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
          <Text style={styles.headline}>{'인증번호를\n입력해 주세요'}</Text>
          <Text style={styles.desc}>문자로 받은 인증번호를 입력해 주세요.</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>인증번호</Text>
            <TextInput
              style={[styles.input, focused && styles.inputFocused]}
              value={verificationCode}
              onChangeText={handleVerificationCodeChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="인증번호를 입력해 주세요"
              placeholderTextColor={redesign.navInactive}
              keyboardType="number-pad"
            />
          </View>

          {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleVerify}
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
              {isSubmitting ? '확인 중...' : '인증하기'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleResend}
            activeOpacity={0.5}
            hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
            style={styles.resendBtn}
          >
            <Text style={styles.resendText}>재전송</Text>
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

  resendBtn: {
    alignSelf: 'center',
    marginTop: 18,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.textSecondary,
  },
});

export default SignupPhoneVerifyScreen;
