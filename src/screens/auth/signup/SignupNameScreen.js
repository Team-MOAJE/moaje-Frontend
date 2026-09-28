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
import { ROUTES } from '../../../constants/routes';
import { colors, radius, shadows } from '../../../theme';

const BG_GRAD = ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'];

const validateName = v => /^[가-힣]+$/.test(v);

const SignupNameScreen = ({ navigation, route }) => {
  const { phoneNumber, termsRecords } = route.params ?? {};

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const handleNameChange = text => setName(text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''));
  const nameInvalid = touched && name.length > 0 && !validateName(name);
  const allValid = validateName(name);

  const handleBack = () => navigation.popToTop();

  const handleNext = () => {
    setTouched(true);
    if (!allValid) return;
    navigation.navigate(ROUTES.PIN_INPUT, { mode: 'signup', phoneNumber, name, termsRecords });
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
            <Text style={styles.headerTitle}>이름 입력</Text>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>모아제에서 사용할 이름을 입력해 주세요.</Text>

            <View style={[styles.card, shadows.md]}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>이름</Text>
                <TextInput
                  style={[styles.input, nameInvalid && styles.inputError]}
                  value={name}
                  onChangeText={handleNameChange}
                  onBlur={() => setTouched(true)}
                  placeholder="이름을 입력해 주세요"
                  placeholderTextColor="rgba(111,127,63,0.4)"
                />
                {nameInvalid && (
                  <Text style={styles.errorText}>이름은 한글만 입력할 수 있어요.</Text>
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
});

export default SignupNameScreen;
