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
  Modal,
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
// 휴대폰 번호: 빈값 아님 + 숫자만 + 9~11자리 (통신사별 세부 규칙/인증번호 자릿수는 확정되지 않았으므로 검증하지 않음)
const validatePhoneNumber = v => /^[0-9]{9,11}$/.test(v);

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
    phoneNumber: false,
  });

  // 휴대폰 인증
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false); // 실제 API 성공 응답 시에만 true로 세팅 예정 (현재는 세팅되는 경로 없음)

  // 약관 동의
  const [agreements, setAgreements] = useState({
    privacyProcessing: false, // [필수] 개인정보 처리동의
    privacyProvision: false, // [필수] 개인정보 제공동의
  });
  const [detailModal, setDetailModal] = useState({ visible: false, type: null }); // type: null | 'privacyProcessing' | 'privacyProvision'

  const agreeAll = agreements.privacyProcessing && agreements.privacyProvision;

  const touchField = field => setTouched(t => ({ ...t, [field]: true }));

  const handleNameChange = text => setName(text.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, ''));
  const handleUserIdChange = text => setUserId(text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12));
  const handlePasswordChange = text => setPassword(text.replace(/[\s가-힣]/g, ''));
  const handlePhoneNumberChange = text => setPhoneNumber(text.replace(/[^0-9]/g, '').slice(0, 11));
  const handleVerificationCodeChange = text => setVerificationCode(text.replace(/[^0-9]/g, ''));

  const nameInvalid = touched.name && name.length > 0 && !validateName(name);
  const userIdInvalid = touched.userId && userId.length > 0 && !validateUserId(userId);
  const passwordInvalid = touched.password && password.length > 0 && !validatePassword(password);
  const phoneNumberInvalid =
    touched.phoneNumber && phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber);

  const allValid =
    validateName(name) &&
    gender !== null &&
    validateUserId(userId) &&
    validatePassword(password) &&
    validatePhoneNumber(phoneNumber) &&
    isPhoneVerified &&
    agreements.privacyProcessing &&
    agreements.privacyProvision;

  const handleBack = () => navigation.popToTop();

  const handleGoToLogin = () => navigation.navigate(ROUTES.ID_LOGIN);

  const handleRequestPhoneVerification = () => {
    touchField('phoneNumber');

    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert('알림', '휴대폰 번호를 올바르게 입력해 주세요.');
      return;
    }

    // TODO: 백엔드 API 확정 후 dispatch(requestPhoneVerification({ phoneNumber })) 연결 예정
    //       실제 연동 시 요청 중 로딩 state(예: isRequestingVerification)를 이때 추가한다.
    // 주의: 여기서 isPhoneVerified를 세팅하지 않는다. SMS 발송 성공 여부는 실제 API 응답으로만 알 수 있다.
    Alert.alert('준비 중', '휴대폰 인증 기능은 현재 준비 중이에요.');
  };

  const handleVerifyPhone = () => {
    if (verificationCode.length === 0) {
      Alert.alert('알림', '인증번호를 입력해 주세요.');
      return;
    }

    // TODO: 백엔드 API 확정 후 dispatch(verifyPhoneVerification({ phoneNumber, verificationCode })) 연결 예정
    //       실제 연동 시 확인 중 로딩 state(예: isVerifyingPhone)를 이때 추가한다.
    // 성공 응답을 받았을 때만 setIsPhoneVerified(true)를 호출해야 한다 — 이 함수는 그 호출을 하지 않는다.
    Alert.alert('준비 중', '휴대폰 인증 기능은 현재 준비 중이에요.');
  };

  const handleToggleAgreeAll = () => {
    const next = !agreeAll;
    setAgreements({ privacyProcessing: next, privacyProvision: next });
  };

  const handleToggleAgreement = key => setAgreements(prev => ({ ...prev, [key]: !prev[key] }));

  const handleOpenDetailModal = type => setDetailModal({ visible: true, type });
  const handleCloseDetailModal = () => setDetailModal({ visible: false, type: null });

  // 실제 registerUser API 연동 후 성공 콜백에서 호출될 예정. 현재는 registerUser를 dispatch하지 않으므로 호출되는 경로가 없다.
  const handleSignupSuccess = () => {
    navigation.replace(ROUTES.ID_LOGIN);
  };

  const handleSubmit = () => {
    if (!allValid) {
      setTouched({ name: true, userId: true, password: true, phoneNumber: true });
      return;
    }
    // API 연결 전 — 실제 dispatch 없음
    // TODO: 추후 dispatch(registerUser({ name, gender, userId, password, phoneNumber })) 연결 예정
    //       성공 시 handleSignupSuccess() 호출 예정
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

              {/* 휴대폰 번호 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>휴대폰 번호</Text>
                <View style={styles.inlineRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputFlex,
                      phoneNumberInvalid && styles.inputError,
                    ]}
                    value={phoneNumber}
                    onChangeText={handlePhoneNumberChange}
                    onBlur={() => touchField('phoneNumber')}
                    placeholder="휴대폰 번호를 입력해 주세요"
                    placeholderTextColor="rgba(111,127,63,0.4)"
                    keyboardType="phone-pad"
                    editable={!isPhoneVerified}
                  />
                  <TouchableOpacity
                    onPress={handleRequestPhoneVerification}
                    activeOpacity={0.85}
                    disabled={isPhoneVerified}
                    style={[styles.inlineBtn, isPhoneVerified && styles.inlineBtnDisabled]}
                  >
                    <Text
                      style={[
                        styles.inlineBtnText,
                        isPhoneVerified && styles.inlineBtnTextDisabled,
                      ]}
                    >
                      인증번호 받기
                    </Text>
                  </TouchableOpacity>
                </View>
                {phoneNumberInvalid && (
                  <Text style={styles.errorText}>휴대폰 번호를 올바르게 입력해 주세요.</Text>
                )}
              </View>

              {/* 인증번호 */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>인증번호</Text>
                <View style={styles.inlineRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={verificationCode}
                    onChangeText={handleVerificationCodeChange}
                    placeholder="인증번호를 입력해 주세요"
                    placeholderTextColor="rgba(111,127,63,0.4)"
                    keyboardType="number-pad"
                    editable={!isPhoneVerified}
                  />
                  <TouchableOpacity
                    onPress={handleVerifyPhone}
                    activeOpacity={0.85}
                    disabled={isPhoneVerified}
                    style={[styles.inlineBtn, isPhoneVerified && styles.inlineBtnDisabled]}
                  >
                    <Text
                      style={[
                        styles.inlineBtnText,
                        isPhoneVerified && styles.inlineBtnTextDisabled,
                      ]}
                    >
                      인증하기
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 약관 동의 카드 */}
            <View style={[styles.card, styles.termsCard, shadows.md]}>
              <TouchableOpacity
                onPress={handleToggleAgreeAll}
                activeOpacity={0.85}
                style={styles.agreeAllRow}
              >
                <View style={[styles.checkbox, agreeAll && styles.checkboxChecked]}>
                  {agreeAll && <Feather name="check" size={14} color={colors.white} />}
                </View>
                <Text style={styles.agreeAllText}>전체 동의</Text>
              </TouchableOpacity>

              <View style={styles.termsDivider} />

              <View style={styles.termItemRow}>
                <TouchableOpacity
                  onPress={() => handleToggleAgreement('privacyProcessing')}
                  activeOpacity={0.85}
                  style={styles.termCheckRow}
                >
                  <View
                    style={[
                      styles.checkboxSm,
                      agreements.privacyProcessing && styles.checkboxSmChecked,
                    ]}
                  >
                    {agreements.privacyProcessing && (
                      <Feather name="check" size={12} color={colors.white} />
                    )}
                  </View>
                  <Text style={styles.termItemText}>[필수] 개인정보 처리동의</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleOpenDetailModal('privacyProcessing')}
                  activeOpacity={0.6}
                >
                  <Text style={styles.termDetailLink}>자세히 보기</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.termItemRow}>
                <TouchableOpacity
                  onPress={() => handleToggleAgreement('privacyProvision')}
                  activeOpacity={0.85}
                  style={styles.termCheckRow}
                >
                  <View
                    style={[
                      styles.checkboxSm,
                      agreements.privacyProvision && styles.checkboxSmChecked,
                    ]}
                  >
                    {agreements.privacyProvision && (
                      <Feather name="check" size={12} color={colors.white} />
                    )}
                  </View>
                  <Text style={styles.termItemText}>[필수] 개인정보 제공동의</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleOpenDetailModal('privacyProvision')}
                  activeOpacity={0.6}
                >
                  <Text style={styles.termDetailLink}>자세히 보기</Text>
                </TouchableOpacity>
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

        {/* 약관 상세보기 모달 (본문은 추후 확정된 내용으로 채워질 빈 영역) */}
        <Modal
          visible={detailModal.visible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseDetailModal}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, shadows.xl]}>
              <Text style={styles.modalTitle}>
                {detailModal.type === 'privacyProcessing' && '개인정보 처리동의'}
                {detailModal.type === 'privacyProvision' && '개인정보 제공동의'}
              </Text>
              {/* TODO: 실제 약관 본문 확정 후 채울 예정 — 현재는 의도적으로 빈 영역 */}
              <View style={styles.modalBody} />
              <TouchableOpacity
                onPress={handleCloseDetailModal}
                activeOpacity={0.85}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseBtnText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
    paddingBottom: 64,
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

  // 인라인 입력 + 버튼 (휴대폰/인증번호)
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputFlex: { flex: 1 },
  inlineBtn: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.olive,
  },
  inlineBtnDisabled: {
    backgroundColor: colors.border,
  },
  inlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  inlineBtnTextDisabled: {
    color: 'rgba(111,127,63,0.5)',
  },

  // 약관 동의 카드
  termsCard: {
    marginTop: 16,
    gap: 12,
  },
  agreeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  agreeAllText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  termsDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  termItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  termCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  termItemText: {
    fontSize: 13,
    color: colors.textMid,
  },
  termDetailLink: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.6)',
    textDecorationLine: 'underline',
  },

  // 체크박스 (전체 동의용, 큰 사이즈)
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.olive,
    borderColor: colors.olive,
  },

  // 체크박스 (개별 항목용, 작은 사이즈)
  checkboxSm: {
    width: 18,
    height: 18,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSmChecked: {
    backgroundColor: colors.olive,
    borderColor: colors.olive,
  },

  // 약관 상세보기 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 16,
  },
  modalBody: {
    minHeight: 160,
    borderRadius: radius.md,
    backgroundColor: colors.bgLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.olive,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },

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
