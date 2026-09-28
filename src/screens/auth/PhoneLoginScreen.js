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
import { ROUTES } from '../../constants/routes';
import { colors, radius, shadows } from '../../theme';

const BG_GRAD = ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'];

const validatePhoneNumber = v => /^[0-9]{9,11}$/.test(v);

const PhoneLoginScreen = ({ navigation }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [touched, setTouched] = useState(false);

  const handlePhoneNumberChange = text => setPhoneNumber(text.replace(/[^0-9]/g, '').slice(0, 11));
  const phoneNumberInvalid = touched && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);
  const allValid = validatePhoneNumber(phoneNumber);

  const handleBack = () => navigation.popToTop();

  const handleSignup = () => navigation.navigate(ROUTES.SIGNUP);

  const handleNext = () => {
    setTouched(true);
    if (!allValid) return;
    navigation.navigate(ROUTES.PIN_INPUT, { mode: 'login', phoneNumber });
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
            <Text style={styles.headerTitle}>로그인</Text>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>가입한 휴대폰 번호를 입력해 주세요.</Text>

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

            <TouchableOpacity
              onPress={handleNext}
              disabled={!allValid}
              activeOpacity={allValid ? 0.85 : 1}
              style={[
                styles.submitBtn,
                allValid ? styles.submitBtnActive : styles.submitBtnDisabled,
              ]}
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

            <View style={styles.linkRow}>
              <Text style={styles.linkLabel}>아직 계정이 없으신가요? </Text>
              <TouchableOpacity onPress={handleSignup} activeOpacity={0.5}>
                <Text style={styles.linkText}>회원가입</Text>
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
  inputError: {
    borderColor: colors.red,
    backgroundColor: '#FFF4F4',
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
    lineHeight: 17,
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
    alignItems: 'center',
    marginTop: 16,
  },
  linkLabel: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.7)',
  },
  linkText: {
    fontSize: 12,
    color: colors.textMid,
    textDecorationLine: 'underline',
  },
});

export default PhoneLoginScreen;
