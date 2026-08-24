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

const IdLoginScreen = ({ navigation }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ userId: false, password: false });

  const touchField = field => setTouched(t => ({ ...t, [field]: true }));

  const handleUserIdChange = text => setUserId(text);

  const handlePasswordChange = text => setPassword(text);

  const userIdInvalid = touched.userId && userId.trim().length === 0;
  const passwordInvalid = touched.password && password.length === 0;
  const allValid = userId.trim().length > 0 && password.length > 0;

  const handleBack = () => navigation.popToTop();

  const handleSignup = () => navigation.navigate(ROUTES.SIGNUP);

  const handleLogin = () => {
    if (!allValid) {
      setTouched({ userId: true, password: true });
      return;
    }
    // API 연결 전 — 실제 dispatch 없음
    // TODO: 추후 dispatch(loginUser({ userId, password })) 연결
    Alert.alert('준비 중', '아이디 로그인은 현재 준비 중이에요.');
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
            <Text style={styles.headerTitle}>아이디 로그인</Text>
          </View>

          {/* ── 스크롤 본문 ─────────────────────── */}
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.desc}>가입한 아이디와 비밀번호를 입력해 주세요.</Text>

            {/* 폼 카드 */}
            <View style={[styles.card, shadows.md]}>
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
                {userIdInvalid && <Text style={styles.errorText}>아이디를 입력해 주세요.</Text>}
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
                {passwordInvalid && <Text style={styles.errorText}>비밀번호를 입력해 주세요.</Text>}
              </View>
            </View>

            {/* 로그인 버튼 */}
            <TouchableOpacity
              onPress={handleLogin}
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
                로그인
              </Text>
            </TouchableOpacity>

            {/* 회원가입 링크 */}
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

export default IdLoginScreen;
