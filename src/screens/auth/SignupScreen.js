import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROUTES } from '../../constants/routes';
import { colors, radius, shadows } from '../../theme';

const BG_GRAD = ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'];

const validateName = v => /^[가-힣]+$/.test(v);
const validateUserId = v => /^[a-zA-Z0-9]{1,12}$/.test(v);
const validatePassword = v =>
  v.length > 0 && !/[\s가-힣]/.test(v) && /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(v);

const SignupScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null); // null | 'male' | 'female'
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    userId: false,
    password: false,
  });

  const touchField = field => setTouched(t => ({ ...t, [field]: true }));

  const handleNameChange = text => setName(text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''));
  const handleUserIdChange = text => setUserId(text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12));
  const handlePasswordChange = text => setPassword(text.replace(/[\s가-힣]/g, ''));

  const nameInvalid = touched.name && name.length > 0 && !validateName(name);
  const userIdInvalid = touched.userId && userId.length > 0 && !validateUserId(userId);
  const passwordInvalid = touched.password && password.length > 0 && !validatePassword(password);

  const allValid =
    validateName(name) && gender !== null && validateUserId(userId) && validatePassword(password);

  const handleBack = () => navigation.popToTop();

  const handleGoToLogin = () => navigation.navigate(ROUTES.ID_LOGIN);

  const handleSubmit = () => {
    if (!allValid) {
      setTouched({ name: true, userId: true, password: true });
      return;
    }
    // API 연결 전 — 실제 dispatch 없음
    // TODO: 추후 dispatch(registerUser({ name, gender, userId, password })) 연결
    Alert.alert('준비 중', '회원가입은 현재 준비 중이에요.');
  };

  return (
    <LinearGradient colors={BG_GRAD} locations={[0, 0.5, 1]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          {/* ── 헤더 ─────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>회원가입</Text>
          </View>

          {/* ── 스크롤 본문 ─────────────────────── */}
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>모아제에서 사용할 정보를 입력해 주세요.</Text>

            {/* 폼 카드 */}
            <View style={[styles.card, shadows.md]}>
              {/* 이름 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>이름</Text>
                <TextInput
                  style={[styles.input, nameInvalid && styles.inputError]}
                  value={name}
                  onChangeText={handleNameChange}
                  onBlur={() => touchField('name')}
                  placeholder="이름을 입력해 주세요"
                  placeholderTextColor="rgba(111,127,63,0.4)"
                />
                {nameInvalid && (
                  <Text style={styles.errorText}>이름은 한글만 입력할 수 있어요.</Text>
                )}
              </View>

              {/* 성별 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>성별</Text>
                <View style={styles.genderRow}>
                  {[
                    { val: 'male', label: '남' },
                    { val: 'female', label: '여' },
                  ].map(({ val, label }) => {
                    const selected = gender === val;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setGender(val)}
                        activeOpacity={0.85}
                        style={[styles.genderBtn, selected && styles.genderBtnSelected]}
                      >
                        {selected && (
                          <Feather
                            name="check"
                            size={14}
                            color={colors.textMid}
                            style={styles.checkIcon}
                          />
                        )}
                        <Text style={[styles.genderText, selected && styles.genderTextSelected]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 아이디 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>아이디</Text>
                <TextInput
                  style={[styles.input, userIdInvalid && styles.inputError]}
                  value={userId}
                  onChangeText={handleUserIdChange}
                  onBlur={() => touchField('userId')}
                  placeholder="아이디를 입력해 주세요"
                  placeholderTextColor="rgba(111,127,63,0.4)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {userIdInvalid && (
                  <Text style={styles.errorText}>
                    아이디는 영문과 숫자만 사용할 수 있고 최대 12자까지 가능해요.
                  </Text>
                )}
              </View>

              {/* 비밀번호 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>비밀번호</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, styles.inputPw, passwordInvalid && styles.inputError]}
                    value={password}
                    onChangeText={handlePasswordChange}
                    onBlur={() => touchField('password')}
                    placeholder="비밀번호를 입력해 주세요"
                    placeholderTextColor="rgba(111,127,63,0.4)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(s => !s)}
                    style={styles.eyeBtn}
                    activeOpacity={0.6}
                  >
                    <Feather
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color="rgba(111,127,63,0.5)"
                    />
                  </TouchableOpacity>
                </View>
                {passwordInvalid && (
                  <Text style={styles.errorText}>
                    비밀번호에는 특수문자가 1개 이상 포함되어야 해요.
                  </Text>
                )}
              </View>
            </View>

            {/* 회원가입 완료 버튼 */}
            <TouchableOpacity
              onPress={handleSubmit}
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
                회원가입 완료
              </Text>
            </TouchableOpacity>

            {/* 로그인 링크 */}
            <View style={styles.linkRow}>
              <Text style={styles.linkLabel}>이미 계정이 있으신가요? </Text>
              <TouchableOpacity onPress={handleGoToLogin} activeOpacity={0.5}>
                <Text style={styles.linkText}>로그인</Text>
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

  // 헤더
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

  // 스크롤 본문
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

  // 폼 카드
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

  // 필드 그룹
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

  // 성별 버튼
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderBtnSelected: {
    borderColor: colors.olive,
    backgroundColor: 'rgba(111,127,63,0.1)',
  },
  checkIcon: {
    marginRight: 4,
  },
  genderText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(111,127,63,0.6)',
  },
  genderTextSelected: {
    color: colors.textDark,
  },

  // 비밀번호 래퍼
  passwordWrap: { position: 'relative' },
  inputPw: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  // 제출 버튼
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

  // 하단 링크
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

export default SignupScreen;
