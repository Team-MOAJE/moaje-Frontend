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
import { ROUTES } from '../../constants/routes';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { verifyAccountForReset } from '../../features/auth/authApi';
import {
  PHONE_NUMBER_ERROR_MESSAGE,
  PHONE_NUMBER_MAX_LENGTH,
  sanitizeName,
  sanitizePhoneNumber,
  validateName,
  validatePhoneNumber,
} from '../../utils/authValidators';

const MISMATCH_MESSAGE = '입력한 회원정보가 일치하지 않습니다.';
const UNAVAILABLE_MESSAGE = '현재 PIN 재설정 기능을 준비 중입니다.';
const FAILURE_MESSAGE = '처리 중 문제가 발생했어요. 다시 시도해 주세요.';

// PIN 재설정 전 회원정보(전화번호 + 이름) 확인 화면. 실제 본인인증이 아니다.
// 확인 API가 연결되기 전에는 다음 단계로 이동하지 않고 '준비 중' 안내만 표시한다.
const PinResetVerifyScreen = ({ navigation, route }) => {
  // pinInputRoute: 진입한 네비게이터에 등록된 PIN 화면 라우트(DEV 미리보기는 DEV_PIN_INPUT).
  const { phoneNumber: initialPhoneNumber, pinInputRoute } = route.params ?? {};

  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber ?? '');
  const [name, setName] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const phoneInvalid = phoneTouched && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);
  const nameInvalid = nameTouched && name.length > 0 && !validateName(name);
  const allValid = validatePhoneNumber(phoneNumber) && validateName(name);
  const ctaActive = allValid && !isSubmitting;

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.LOGIN);
    }
  };

  const handleNext = async () => {
    setPhoneTouched(true);
    setNameTouched(true);
    if (!allValid || isSubmitting) return;

    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const result = await verifyAccountForReset({ phoneNumber, name });
      if (result === 'unavailable') {
        setErrorMsg(UNAVAILABLE_MESSAGE);
        return;
      }
      if (result !== 'matched') {
        setErrorMsg(MISMATCH_MESSAGE);
        return;
      }
      navigation.navigate(pinInputRoute ?? ROUTES.PIN_INPUT, { mode: 'reset', phoneNumber });
    } catch {
      setErrorMsg(FAILURE_MESSAGE);
    } finally {
      setIsSubmitting(false);
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
          <Text style={styles.headline}>{'PIN 재설정을 위해\n회원정보를 확인할게요'}</Text>
          <Text style={styles.desc}>가입할 때 입력한 휴대폰 번호와 이름을 입력해 주세요.</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>휴대폰 번호</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'phone' && styles.inputFocused,
                phoneInvalid && styles.inputError,
              ]}
              value={phoneNumber}
              onChangeText={text => {
                setErrorMsg('');
                setPhoneNumber(sanitizePhoneNumber(text));
              }}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => {
                setFocusedField(null);
                setPhoneTouched(true);
              }}
              placeholder="휴대폰 번호를 입력해 주세요"
              placeholderTextColor={redesign.navInactive}
              keyboardType="number-pad"
              maxLength={PHONE_NUMBER_MAX_LENGTH}
            />
            {phoneInvalid && <Text style={styles.errorText}>{PHONE_NUMBER_ERROR_MESSAGE}</Text>}
          </View>

          <View style={[styles.fieldGroup, styles.fieldGroupSpaced]}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'name' && styles.inputFocused,
                nameInvalid && styles.inputError,
              ]}
              value={name}
              onChangeText={text => {
                setErrorMsg('');
                setName(sanitizeName(text));
              }}
              onFocus={() => setFocusedField('name')}
              onBlur={() => {
                setFocusedField(null);
                setNameTouched(true);
              }}
              placeholder="이름을 입력해 주세요"
              placeholderTextColor={redesign.navInactive}
            />
            {nameInvalid && <Text style={styles.errorText}>이름은 한글만 입력할 수 있어요.</Text>}
          </View>

          {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
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
              {isSubmitting ? '확인 중...' : '다음'}
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
  fieldGroupSpaced: { marginTop: 20 },
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
  errorMsg: {
    marginTop: 16,
    fontSize: 13,
    color: colors.red,
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
    lineHeight: 17,
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

export default PinResetVerifyScreen;
