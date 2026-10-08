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
import { ROUTES } from '../../../constants/routes';
import { colors } from '../../../theme';
import { redesign } from '../../../theme/redesign';
import {
  PHONE_NUMBER_ERROR_MESSAGE,
  PHONE_NUMBER_MAX_LENGTH,
  sanitizePhoneNumber,
  validatePhoneNumber,
} from '../../../utils/authValidators';

const SignupPhoneScreen = ({ navigation, route }) => {
  const { phoneNumber: initialPhoneNumber, termsRecords } = route.params ?? {};

  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber ?? '');
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);

  const handlePhoneNumberChange = text => setPhoneNumber(sanitizePhoneNumber(text));
  const phoneNumberInvalid = touched && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);
  const allValid = validatePhoneNumber(phoneNumber);

  const handleBack = () => navigation.popToTop();

  const handleNext = () => {
    setTouched(true);
    if (!allValid) return;
    navigation.navigate(ROUTES.SIGNUP_NAME, { phoneNumber, termsRecords });
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
          <Text style={styles.headline}>{'휴대폰 번호를\n입력해 주세요'}</Text>
          <Text style={styles.desc}>회원가입에 사용할 휴대폰 번호를 입력해 주세요.</Text>

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
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!allValid}
            activeOpacity={allValid ? 0.85 : 1}
            style={[styles.submitBtn, allValid ? styles.submitBtnActive : styles.submitBtnDisabled]}
          >
            <Text
              style={[
                styles.submitBtnText,
                allValid ? styles.submitTextActive : styles.submitTextDisabled,
              ]}
            >
              다음
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
