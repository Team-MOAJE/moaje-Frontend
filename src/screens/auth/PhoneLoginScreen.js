import React, { useRef, useState } from 'react';
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
import { ROUTES } from '../../constants/routes';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { checkPhoneRegistered, PHONE_CHECK_STATUS } from '../../features/auth/authApi';
import {
  PHONE_NUMBER_ERROR_MESSAGE,
  PHONE_NUMBER_MAX_LENGTH,
  sanitizePhoneNumber,
  validatePhoneNumber,
} from '../../utils/authValidators';

// 미가입 / 확인 API 미연결 / 네트워크·서버 오류 모두 같은 문구로 안내한다(형식 오류 문구와는 별개).
const NOT_REGISTERED_MESSAGE = '가입되지 않은 전화번호예요.';

const PhoneLoginScreen = ({ navigation }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkErrorMsg, setCheckErrorMsg] = useState('');
  const isCheckingRef = useRef(false);

  const handlePhoneNumberChange = text => {
    setCheckErrorMsg('');
    setPhoneNumber(sanitizePhoneNumber(text));
  };
  const phoneNumberInvalid = touched && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);
  const allValid = validatePhoneNumber(phoneNumber);
  const ctaActive = allValid && !isChecking;

  const handleBack = () => navigation.popToTop();

  const handleSignup = () => navigation.navigate(ROUTES.SIGNUP);

  // 형식 검사 통과 후 서버 가입 여부 확인 → registered일 때만 PIN 화면으로 이동한다.
  const handleNext = async () => {
    setTouched(true);
    if (!allValid || isCheckingRef.current) return;

    isCheckingRef.current = true;
    setIsChecking(true);
    setCheckErrorMsg('');
    try {
      const status = await checkPhoneRegistered({ phoneNumber });
      if (status === PHONE_CHECK_STATUS.REGISTERED) {
        navigation.navigate(ROUTES.PIN_INPUT, { mode: 'login', phoneNumber });
      } else if (status === PHONE_CHECK_STATUS.UNREGISTERED) {
        setCheckErrorMsg(NOT_REGISTERED_MESSAGE);
      } else {
        setCheckErrorMsg(NOT_REGISTERED_MESSAGE);
      }
    } catch {
      setCheckErrorMsg(NOT_REGISTERED_MESSAGE);
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  };

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
          <Text
            style={styles.headline}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1}
          >
            휴대폰 번호를 입력해 주세요
          </Text>
          <Text style={styles.desc}>가입할 때 사용한 휴대폰 번호를 입력해 주세요.</Text>

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
              keyboardType="number-pad"
              maxLength={PHONE_NUMBER_MAX_LENGTH}
            />
            {phoneNumberInvalid && (
              <Text style={styles.errorText}>{PHONE_NUMBER_ERROR_MESSAGE}</Text>
            )}
            {checkErrorMsg ? <Text style={styles.errorText}>{checkErrorMsg}</Text> : null}
          </View>

          <View style={styles.linkRow}>
            <Text style={styles.linkLabel}>아직 계정이 없으신가요? </Text>
            <TouchableOpacity onPress={handleSignup} activeOpacity={0.5}>
              <Text style={styles.linkText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!ctaActive}
            activeOpacity={ctaActive ? 0.85 : 1}
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
              {isChecking ? '확인 중...' : '다음'}
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

  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  linkLabel: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  linkText: {
    fontSize: 12,
    color: redesign.textSecondary,
    textDecorationLine: 'underline',
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

export default PhoneLoginScreen;
