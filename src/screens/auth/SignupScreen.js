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
  useWindowDimensions,
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
  v.length > 0 &&
  /^[A-Za-z0-9!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]+$/.test(v) &&
  /[A-Z]/.test(v) &&
  /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(v);
// 휴대폰 번호: 빈값 아님 + 숫자만 + 9~11자리 (통신사별 세부 규칙/인증번호 자릿수는 확정되지 않았으므로 검증하지 않음)
const validatePhoneNumber = v => /^[0-9]{9,11}$/.test(v);

const SignupScreen = ({ navigation }) => {
  const { height: windowHeight } = useWindowDimensions();

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

  // 개인정보 처리 안내 확인
  const [privacyNoticeConfirmed, setPrivacyNoticeConfirmed] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [privacyModalChecked, setPrivacyModalChecked] = useState(false); // Modal 내부 임시 체크 (확정 state와 분리)

  // 개인정보 처리방침 (열람 전용, 위 확인 안내와 별개)
  const [privacyPolicyModalVisible, setPrivacyPolicyModalVisible] = useState(false);

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
    privacyNoticeConfirmed;

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

  const handleOpenPrivacyModal = () => {
    setPrivacyModalChecked(privacyNoticeConfirmed); // 이미 확인한 경우 재오픈 시 체크 유지
    setPrivacyModalVisible(true);
  };
  const handleClosePrivacyModal = () => setPrivacyModalVisible(false); // 확정 state는 건드리지 않음

  const handlePressPrivacyCheckbox = () => {
    if (privacyNoticeConfirmed) {
      setPrivacyNoticeConfirmed(false); // 체크된 상태에서는 바로 체크 해제 (재확인은 Modal을 다시 열어서)
    } else {
      handleOpenPrivacyModal(); // 미확인 상태에서는 Modal을 열어야만 확인 가능 (우회 방지)
    }
  };

  const handleConfirmPrivacyNotice = () => {
    setPrivacyNoticeConfirmed(true);
    setPrivacyModalVisible(false);
  };

  const handleOpenPrivacyPolicyModal = () => setPrivacyPolicyModalVisible(true);
  const handleClosePrivacyPolicyModal = () => setPrivacyPolicyModalVisible(false);

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
                    비밀번호에는 영문 대문자와 특수문자가 각각 1개 이상 포함되어야 해요.
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

            {/* 개인정보 확인 카드 */}
            <View style={[styles.card, styles.termsCard, shadows.md]}>
              <Text style={styles.privacyTitle}>개인정보 확인</Text>

              <View style={styles.termItemRow}>
                <View style={styles.termCheckRow}>
                  <TouchableOpacity onPress={handlePressPrivacyCheckbox} activeOpacity={0.85}>
                    <View
                      style={[
                        styles.checkboxSm,
                        privacyNoticeConfirmed && styles.checkboxSmChecked,
                      ]}
                    >
                      {privacyNoticeConfirmed && (
                        <Feather name="check" size={12} color={colors.white} />
                      )}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.termItemText}>개인정보 처리 안내</Text>
                </View>
                <TouchableOpacity
                  onPress={handleOpenPrivacyModal}
                  activeOpacity={0.7}
                  style={styles.privacyNoticeButton}
                >
                  <Text style={styles.privacyNoticeButtonText}>안내 확인</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleOpenPrivacyPolicyModal}
                activeOpacity={0.6}
                style={styles.privacyPolicyLinkRow}
              >
                <Text style={styles.termDetailLink}>개인정보 처리방침</Text>
              </TouchableOpacity>
            </View>

            {/* 회원가입 완료 버튼 */}
            <TouchableOpacity
              onPress={handleSubmit}
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

        {/* 휴대전화번호 인증을 위한 개인정보 처리 안내 모달 */}
        <Modal
          visible={privacyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleClosePrivacyModal}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, shadows.xl]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>휴대전화번호 인증을 위한 개인정보 처리 안내</Text>
                <TouchableOpacity
                  onPress={handleClosePrivacyModal}
                  activeOpacity={0.7}
                  style={styles.modalCloseIconBtn}
                >
                  <Feather name="x" size={20} color={colors.textDark} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={[styles.modalBody, { maxHeight: windowHeight * 0.5 }]}
                contentContainerStyle={styles.modalBodyContent}
              >
                <Text style={styles.modalParagraph}>
                  모아제는 회원가입 과정에서 휴대전화번호 소유 여부를 확인하고 안전한 계정을
                  생성하기 위해 다음과 같이 개인정보를 처리합니다.
                </Text>

                <Text style={styles.modalSectionTitle}>처리 목적</Text>
                <Text style={styles.modalParagraph}>
                  회원가입 의사 확인, 휴대전화번호 소유 확인, 동일 휴대전화번호를 이용한 중복·부정
                  가입 방지 및 계정 보호
                </Text>

                <Text style={styles.modalSectionTitle}>처리 항목</Text>
                <Text style={styles.modalParagraph}>
                  휴대전화번호, 인증번호, 인증 요청 일시, 인증 결과 및 인증 실패 횟수
                </Text>

                <Text style={styles.modalSectionTitle}>법적 근거</Text>
                <Text style={styles.modalParagraph}>개인정보 보호법 제15조 제1항 제4호</Text>

                <Text style={styles.modalSectionTitle}>보유기간</Text>
                <Text style={styles.modalParagraph}>
                  - 가입이 완료된 휴대전화번호: 회원 탈퇴 시까지
                </Text>
                <Text style={styles.modalParagraph}>
                  - 인증번호: 인증 완료 또는 발급 후 5분까지
                </Text>
                <Text style={styles.modalParagraph}>- 인증 시도 정보: 생성 후 최대 24시간</Text>

                <Text style={styles.modalSectionTitle}>처리업무 위탁</Text>
                <Text style={styles.modalParagraph}>
                  인증번호 문자 발송을 위해 네이버클라우드 주식회사의 Simple & Easy Notification
                  Service를 이용합니다.
                </Text>

                <Text style={styles.modalParagraph}>
                  휴대전화번호 인증에 필요한 정보가 처리되지 않으면 회원가입을 진행할 수 없습니다.
                </Text>

                <View style={styles.modalCheckRow}>
                  <TouchableOpacity
                    onPress={() => setPrivacyModalChecked(c => !c)}
                    activeOpacity={0.85}
                    style={styles.termCheckRow}
                  >
                    <View
                      style={[styles.checkboxSm, privacyModalChecked && styles.checkboxSmChecked]}
                    >
                      {privacyModalChecked && (
                        <Feather name="check" size={12} color={colors.white} />
                      )}
                    </View>
                    <Text style={styles.modalCheckText}>위 개인정보 처리 안내를 확인했습니다.</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <TouchableOpacity
                onPress={handleConfirmPrivacyNotice}
                disabled={!privacyModalChecked}
                activeOpacity={privacyModalChecked ? 0.85 : 1}
                style={[
                  styles.modalConfirmBtn,
                  privacyModalChecked
                    ? styles.modalConfirmBtnActive
                    : styles.modalConfirmBtnDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.modalConfirmBtnText,
                    privacyModalChecked
                      ? styles.modalConfirmTextActive
                      : styles.modalConfirmTextDisabled,
                  ]}
                >
                  확인
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 개인정보 처리방침 열람 모달 (휴대전화번호 인증 관련, 동의 기능 없음) */}
        <Modal
          visible={privacyPolicyModalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleClosePrivacyPolicyModal}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, shadows.xl]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>개인정보 처리방침</Text>
                <TouchableOpacity
                  onPress={handleClosePrivacyPolicyModal}
                  activeOpacity={0.7}
                  style={styles.modalCloseIconBtn}
                >
                  <Feather name="x" size={20} color={colors.textDark} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalScopeNote}>
                휴대전화번호 인증과 관련된 개인정보 처리 내용입니다.
              </Text>

              <ScrollView
                style={[styles.modalBody, { maxHeight: windowHeight * 0.5 }]}
                contentContainerStyle={styles.modalBodyContent}
              >
                <Text style={[styles.modalMainSectionTitle, styles.modalMainSectionTitleFirst]}>
                  개인정보의 처리 목적, 항목, 법적 근거 및 보유기간
                </Text>

                <Text style={styles.modalSectionTitle}>처리 업무</Text>
                <Text style={styles.modalParagraph}>회원가입 및 휴대전화번호 인증</Text>

                <Text style={styles.modalSectionTitle}>처리 목적</Text>
                <Text style={styles.modalParagraph}>
                  회원가입 의사 확인, 휴대전화번호 소유 확인, 동일 휴대전화번호를 이용한 중복·부정
                  가입 방지 및 계정 보호
                </Text>

                <Text style={styles.modalSectionTitle}>처리 항목</Text>
                <Text style={styles.modalParagraph}>
                  휴대전화번호, 인증번호, 인증 요청 일시, 인증 결과, 인증 실패 횟수
                </Text>

                <Text style={styles.modalSectionTitle}>법적 근거</Text>
                <Text style={styles.modalParagraph}>「개인정보 보호법」 제15조 제1항 제4호</Text>

                <Text style={styles.modalSectionTitle}>보유기간</Text>
                <Text style={styles.modalParagraph}>
                  - 가입이 완료된 휴대전화번호: 회원 탈퇴 시까지
                </Text>
                <Text style={styles.modalParagraph}>
                  - 인증번호: 인증 완료 또는 발급 후 5분까지
                </Text>
                <Text style={styles.modalParagraph}>- 인증 시도 정보: 생성 후 최대 24시간</Text>

                <Text style={styles.modalParagraph}>
                  모아제는 처리 목적이 달성되거나 보유기간이 종료된 개인정보를 지체 없이 파기합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  관계 법령에 따라 보존할 필요가 있는 경우에는 해당 법령에서 정한 기간 동안 분리하여
                  보관합니다.
                </Text>

                <Text style={styles.modalMainSectionTitle}>개인정보 처리업무의 위탁</Text>

                <Text style={styles.modalParagraph}>
                  모아제는 휴대전화 인증번호 발송을 위하여 개인정보 처리업무를 다음과 같이
                  위탁합니다.
                </Text>

                <Text style={styles.modalSectionTitle}>수탁자</Text>
                <Text style={styles.modalParagraph}>네이버클라우드 주식회사</Text>

                <Text style={styles.modalSectionTitle}>위탁업무</Text>
                <Text style={styles.modalParagraph}>
                  Simple & Easy Notification Service를 통한 SMS 인증번호 발송, 발송 결과 확인 및
                  발송 이력 관리
                </Text>

                <Text style={styles.modalSectionTitle}>위탁 처리 항목</Text>
                <Text style={styles.modalParagraph}>
                  수신 휴대전화번호, 문자 내용에 포함된 인증번호, 발송 요청·완료 일시, 발송 및 수신
                  상태
                </Text>

                <Text style={styles.modalSectionTitle}>재수탁자</Text>
                <Text style={styles.modalParagraph}>
                  - 인포뱅크 주식회사: 문자서비스 전송 시스템 운영
                </Text>
                <Text style={styles.modalParagraph}>
                  - 씨제이올리브네트웍스 주식회사: 문자서비스 전송 시스템 운영
                </Text>

                <Text style={styles.modalParagraph}>
                  모아제는 위탁계약을 체결할 때 개인정보의 목적 외 처리 금지, 안전성 확보조치,
                  재위탁 제한, 수탁자 관리·감독 및 손해배상 등에 관한 사항을 계약 또는 서비스 약관을
                  통해 확인하고 수탁자가 개인정보를 안전하게 처리하도록 관리합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  위탁업무의 내용이나 수탁자가 변경되는 경우 개인정보 처리방침을 통해 지체 없이
                  공개합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  NAVER Cloud SENS 공식 문서상 SMS 발송 이력은 API와 콘솔에서 최근 90일까지 조회할
                  수 있습니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  모아제는 해당 발송 이력을 별도로 내려받아 장기 보관하지 않으며, 인증번호는
                  일회용으로 발급하고 5분의 유효기간을 적용합니다.
                </Text>

                <Text style={styles.modalMainSectionTitle}>개인정보의 제3자 제공</Text>

                <Text style={styles.modalParagraph}>
                  모아제는 정보주체의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  NAVER Cloud SENS를 이용한 인증번호 발송은 모아제의 회원가입 업무를 수행하기 위한
                  개인정보 처리업무 위탁으로 관리하며, 이를 제3자 제공으로 처리하지 않습니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  향후 모아제가 개인정보를 제3자에게 제공할 필요가 발생하는 경우에는 「개인정보
                  보호법」 제17조 등 관계 법령에 따른 적법한 근거를 확보합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  동의가 필요한 경우에는 제공받는 자, 제공 목적, 제공 항목, 보유·이용 기간 및 동의
                  거부권을 별도로 안내한 후 동의를 받습니다.
                </Text>

                <Text style={styles.modalMainSectionTitle}>개인정보의 파기</Text>

                <Text style={styles.modalParagraph}>
                  1. 인증번호는 인증 성공 시 즉시 사용할 수 없도록 처리하고, 인증번호 발급 후 5분이
                  지나면 자동 삭제합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  2. 인증이 완료되지 않은 휴대전화번호 및 인증 시도 정보는 생성 후 최대 24시간
                  이내에 삭제합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  3. 가입이 완료된 이용자의 휴대전화번호는 회원 탈퇴 시 지체 없이 파기합니다. 다만
                  관계 법령에 따라 보존해야 하는 정보가 있는 경우 해당 법령에서 정한 기간 동안 다른
                  개인정보와 분리하여 보관합니다.
                </Text>
                <Text style={styles.modalParagraph}>
                  4. 전자적 파일 형태의 개인정보는 복구 또는 재생되지 않도록 안전한 방법으로
                  삭제합니다.
                </Text>

                <Text style={styles.modalMainSectionTitle}>개인정보 보호책임자 및 권리 행사</Text>

                <Text style={styles.modalParagraph}>
                  이용자는 자신의 개인정보에 관하여 열람, 정정·삭제, 처리정지 및 그 밖에 관계 법령이
                  보장하는 권리를 행사할 수 있습니다.
                </Text>
                {/* TODO: 개인정보 보호책임자(성명)·문의 이메일·실제 운영 주체가 확정되면 이 Modal에 추가한다. 확정 전까지 placeholder 노출 금지 */}
              </ScrollView>
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

  // 개인정보 확인 카드
  termsCard: {
    marginTop: 16,
    gap: 12,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
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
  privacyNoticeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.olive,
  },
  privacyNoticeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  privacyPolicyLinkRow: {
    alignSelf: 'flex-start',
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

  // 개인정보 처리 안내 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '80%',
    flexDirection: 'column',
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    flexShrink: 1,
    marginRight: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  modalCloseIconBtn: {
    padding: 4,
  },
  modalScopeNote: {
    marginTop: -8,
    marginBottom: 16,
    fontSize: 12,
    color: colors.textMid,
  },
  // flexShrink/flex:1 등으로 "나머지 공간을 채우게" 하는 방식은 modalSheet가 height 없이
  // maxHeight(auto 기반 크기)만 갖고 있어 Yoga가 남는 공간을 제대로 계산하지 못해 실기기에서
  // 스크롤이 안 되거나(잘림) 아예 0으로 찌그러지는 문제가 실제로 있었다. 그래서 flex 계산에
  // 기대지 않고, ScrollView 자신에게 useWindowDimensions로 구한 화면 높이 기준의 고정 px
  // maxHeight를 직접 준다(JSX에서 인라인으로 적용). 본문이 짧으면 그 높이 안에서 콘텐츠만큼만
  // 차지하고, 넘치면 그 높이를 넘지 않고 내부 스크롤된다 — 부모의 flex 레이아웃과 무관하게
  // 항상 동일하게 동작한다.
  modalBody: {
    borderRadius: radius.md,
    backgroundColor: colors.bgLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modalSectionTitle: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  modalMainSectionTitle: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  modalMainSectionTitleFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  modalParagraph: {
    fontSize: 13,
    color: colors.textMid,
    lineHeight: 20,
  },
  modalCheckRow: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCheckText: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textDark,
  },
  modalConfirmBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalConfirmBtnActive: {
    backgroundColor: colors.olive,
  },
  modalConfirmBtnDisabled: {
    backgroundColor: colors.border,
  },
  modalConfirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmTextActive: { color: colors.white },
  modalConfirmTextDisabled: { color: 'rgba(111,127,63,0.5)' },

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
