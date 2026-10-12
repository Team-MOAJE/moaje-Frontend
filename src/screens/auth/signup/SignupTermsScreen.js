import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROUTES } from '../../../constants/routes';
import { redesign } from '../../../theme/redesign';

// 실제 사용자가 체크박스로 동의해야 하는 항목만 구조화된 레코드로 관리한다.
// "개인정보 처리방침"은 열람 전용 문서라 여기 포함하지 않는다(억지로 필수 동의화하지 않음).
// 개인정보 보호법 제15조 제1항 제1호에 따른 회원가입 개인정보 수집·이용 동의(이름, 휴대전화번호).
// 서비스 이용약관과 개인정보 수집·이용 동의는 별개 항목으로 각각 동의받는다.
const SERVICE_TERMS_ID = 'signup-service-terms';
const CONSENT_TERM_ID = 'signup-personal-info-consent';
const TERMS_DEFINITIONS = [
  {
    termId: SERVICE_TERMS_ID,
    type: 'service-terms',
    version: 'v1',
    required: true,
  },
  {
    termId: CONSENT_TERM_ID,
    type: 'privacy-consent',
    version: 'v1',
    required: true,
  },
];

// 서비스 이용약관 v1 본문 (출처: docs/MOAJE_서비스_이용약관_v1_초안.md)
const SERVICE_TERMS_V1_ARTICLES = [
  {
    title: '제1조 (목적)',
    body: '이 약관은 대학 졸업작품으로 제작된 MOAJE(모아제) 앱의 이용에 관한 기본 사항을 정합니다.',
  },
  {
    title: '제2조 (서비스 내용)',
    body: 'MOAJE는 모의 계좌·거래, 소비 내역 분석, 학사 일정 연계 지출 관리, 미래 자금 시뮬레이션 등의 시연 기능을 제공합니다. 서비스의 금융 관련 화면과 계산 결과는 학습·시연을 위한 것으로, 실제 금융기관의 계좌 개설이나 자금 이체, 금융상품 가입을 제공하지 않습니다.',
  },
  {
    title: '제3조 (회원가입 및 계정 관리)',
    body: '이용자는 본 약관과 별도의 개인정보 수집·이용 안내를 확인하고 각각 동의한 후 회원가입할 수 있습니다. 이용자는 다른 사람의 정보를 무단으로 사용해서는 안 되며, 자신의 로그인 PIN을 안전하게 관리해야 합니다.',
  },
  {
    title: '제4조 (이용자의 준수사항)',
    body: '이용자는 타인의 권리를 침해하거나, 허위 정보를 이용하거나, 서비스의 정상적인 운영을 방해하는 행위를 해서는 안 됩니다.',
  },
  {
    title: '제5조 (서비스 변경 및 중단)',
    body: 'MOAJE는 개발·시연·점검 과정에서 일부 기능을 변경하거나 일시 중단할 수 있습니다. 이용에 중대한 영향을 주는 변경이나 중단은 가능한 경우 앱 내 안내 등 적절한 방법으로 알립니다.',
  },
  {
    title: '제6조 (안내 및 책임)',
    body: '소비 분석과 재정 시뮬레이션 결과는 참고 정보이며 실제 재정 상태나 미래 결과를 보장하지 않습니다. 서비스 이용과 관련한 책임은 대한민국 관계 법령에 따릅니다.',
  },
  {
    title: '제7조 (준거법)',
    body: '이 약관에서 정하지 않은 사항은 대한민국 관계 법령에 따릅니다.',
  },
];

const setTermConfirmed = (records, termId, confirmed) =>
  records.map(t =>
    t.termId === termId
      ? { ...t, confirmed, confirmedAt: confirmed ? new Date().toISOString() : null }
      : t
  );

const SignupTermsScreen = ({ navigation }) => {
  const { height: windowHeight } = useWindowDimensions();

  const [termsRecords, setTermsRecords] = useState(
    TERMS_DEFINITIONS.map(def => ({ ...def, confirmed: false, confirmedAt: null }))
  );
  const [serviceTermsModalVisible, setServiceTermsModalVisible] = useState(false);
  const [serviceTermsModalChecked, setServiceTermsModalChecked] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [privacyModalChecked, setPrivacyModalChecked] = useState(false);
  const [privacyPolicyModalVisible, setPrivacyPolicyModalVisible] = useState(false);

  const serviceTermsConfirmed =
    termsRecords.find(t => t.termId === SERVICE_TERMS_ID)?.confirmed ?? false;
  const privacyNoticeConfirmed =
    termsRecords.find(t => t.termId === CONSENT_TERM_ID)?.confirmed ?? false;

  const allValid = termsRecords.filter(t => t.required).every(t => t.confirmed);

  const handleBack = () => navigation.popToTop();

  const handleOpenServiceTermsModal = () => {
    setServiceTermsModalChecked(serviceTermsConfirmed);
    setServiceTermsModalVisible(true);
  };
  const handleCloseServiceTermsModal = () => setServiceTermsModalVisible(false);

  const handlePressServiceTermsCheckbox = () => {
    if (serviceTermsConfirmed) {
      setTermsRecords(records => setTermConfirmed(records, SERVICE_TERMS_ID, false));
    } else {
      handleOpenServiceTermsModal();
    }
  };

  const handleConfirmServiceTerms = () => {
    if (!serviceTermsModalChecked) return;
    setTermsRecords(records => setTermConfirmed(records, SERVICE_TERMS_ID, true));
    setServiceTermsModalVisible(false);
  };

  const handleOpenPrivacyModal = () => {
    setPrivacyModalChecked(privacyNoticeConfirmed);
    setPrivacyModalVisible(true);
  };
  const handleClosePrivacyModal = () => setPrivacyModalVisible(false);

  const handlePressPrivacyCheckbox = () => {
    if (privacyNoticeConfirmed) {
      setTermsRecords(records => setTermConfirmed(records, CONSENT_TERM_ID, false));
    } else {
      handleOpenPrivacyModal();
    }
  };

  const handleConfirmPrivacyNotice = () => {
    if (!privacyModalChecked) return;
    setTermsRecords(records => setTermConfirmed(records, CONSENT_TERM_ID, true));
    setPrivacyModalVisible(false);
  };

  const handleOpenPrivacyPolicyModal = () => setPrivacyPolicyModalVisible(true);
  const handleClosePrivacyPolicyModal = () => setPrivacyPolicyModalVisible(false);

  const handleNext = () => {
    if (!allValid) return;
    navigation.navigate(ROUTES.SIGNUP_PHONE, { termsRecords });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
        <Text style={styles.headline}>{'회원가입 전에\n동의해 주세요'}</Text>
        <Text style={styles.desc}>
          회원가입을 진행하기 전에 아래 내용을 확인하고 동의해 주세요.
        </Text>

        <View style={styles.termsSection}>
          <View style={styles.termItemRow}>
            <TouchableOpacity
              onPress={handlePressServiceTermsCheckbox}
              activeOpacity={0.7}
              style={styles.termCheckRow}
            >
              <View style={[styles.checkbox, serviceTermsConfirmed && styles.checkboxChecked]}>
                {serviceTermsConfirmed && <Feather name="check" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.termItemText}>서비스 이용약관 동의 (필수)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenServiceTermsModal}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.privacyNoticeButtonText}>자세히 보기</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.termItemRow}>
            <TouchableOpacity
              onPress={handlePressPrivacyCheckbox}
              activeOpacity={0.7}
              style={styles.termCheckRow}
            >
              <View style={[styles.checkbox, privacyNoticeConfirmed && styles.checkboxChecked]}>
                {privacyNoticeConfirmed && <Feather name="check" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.termItemText}>개인정보 수집·이용 동의 (필수)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenPrivacyModal}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.privacyNoticeButtonText}>자세히 보기</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleOpenPrivacyPolicyModal}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.privacyPolicyLinkRow}
        >
          <Text style={styles.termDetailLink}>개인정보 처리방침</Text>
        </TouchableOpacity>
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

      {/* 서비스 이용약관 동의 모달 (필수 동의, v1) */}
      <Modal
        visible={serviceTermsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseServiceTermsModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>서비스 이용약관 동의 (필수)</Text>
              <TouchableOpacity
                onPress={handleCloseServiceTermsModal}
                activeOpacity={0.7}
                style={styles.modalCloseIconBtn}
              >
                <Feather name="x" size={20} color={redesign.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[styles.modalBody, { maxHeight: windowHeight * 0.5 }]}
              contentContainerStyle={styles.modalBodyContent}
            >
              {SERVICE_TERMS_V1_ARTICLES.map((article, index) => (
                <React.Fragment key={article.title}>
                  <Text style={[styles.modalSectionTitle, index === 0 && styles.modalFirstTitle]}>
                    {article.title}
                  </Text>
                  <Text style={styles.modalParagraph}>{article.body}</Text>
                </React.Fragment>
              ))}

              <View style={styles.modalCheckRow}>
                <TouchableOpacity
                  onPress={() => setServiceTermsModalChecked(c => !c)}
                  activeOpacity={0.85}
                  style={styles.termCheckRow}
                >
                  <View
                    style={[styles.checkbox, serviceTermsModalChecked && styles.checkboxChecked]}
                  >
                    {serviceTermsModalChecked && <Feather name="check" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.modalCheckText}>위 서비스 이용약관에 동의합니다.</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={handleConfirmServiceTerms}
              disabled={!serviceTermsModalChecked}
              activeOpacity={serviceTermsModalChecked ? 0.85 : 1}
              style={[
                styles.modalConfirmBtn,
                serviceTermsModalChecked
                  ? styles.modalConfirmBtnActive
                  : styles.modalConfirmBtnDisabled,
              ]}
            >
              <Text
                style={[
                  styles.modalConfirmBtnText,
                  serviceTermsModalChecked
                    ? styles.modalConfirmTextActive
                    : styles.modalConfirmTextDisabled,
                ]}
              >
                동의하기
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 개인정보 수집·이용 동의 모달 (개인정보 보호법 제15조 제1항 제1호, 필수 동의) */}
      <Modal
        visible={privacyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClosePrivacyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>개인정보 수집·이용 동의 (필수)</Text>
              <TouchableOpacity
                onPress={handleClosePrivacyModal}
                activeOpacity={0.7}
                style={styles.modalCloseIconBtn}
              >
                <Feather name="x" size={20} color={redesign.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[styles.modalBody, { maxHeight: windowHeight * 0.5 }]}
              contentContainerStyle={styles.modalBodyContent}
            >
              <Text style={styles.modalParagraph}>
                모아제(MOAJE)는 회원가입 및 서비스 제공을 위해 「개인정보 보호법」 제15조 제1항
                제1호에 따라 다음과 같이 개인정보를 수집·이용합니다.
              </Text>

              <Text style={styles.modalSectionTitle}>1. 개인정보 수집·이용 목적</Text>
              <Text style={styles.modalParagraph}>- 회원가입 및 계정 생성</Text>
              <Text style={styles.modalParagraph}>- 회원 식별 및 로그인 관리</Text>
              <Text style={styles.modalParagraph}>- 동일 휴대전화번호를 이용한 중복 가입 방지</Text>
              <Text style={styles.modalParagraph}>- 회원 계정 관리 및 서비스 제공</Text>

              <Text style={styles.modalSectionTitle}>2. 수집하는 개인정보 항목</Text>
              <Text style={styles.modalParagraph}>- 이름</Text>
              <Text style={styles.modalParagraph}>- 휴대전화번호</Text>

              <Text style={styles.modalSectionTitle}>3. 개인정보 보유 및 이용 기간</Text>
              <Text style={styles.modalParagraph}>회원 탈퇴 시까지 보유·이용합니다.</Text>
              <Text style={styles.modalParagraph}>
                단, 관계 법령에 따라 개인정보를 보존해야 하는 경우에는 해당 법령에서 정한 기간 동안
                보관하며, 보존 기간 종료 후 지체 없이 파기합니다.
              </Text>

              <Text style={styles.modalSectionTitle}>4. 동의 거부권 및 불이익</Text>
              <Text style={styles.modalParagraph}>
                이용자는 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다.
              </Text>
              <Text style={styles.modalParagraph}>
                다만, 위 개인정보는 회원가입 및 계정 관리에 필요한 필수 항목이므로 동의를 거부하면
                회원가입을 진행할 수 없습니다.
              </Text>

              <Text style={styles.modalSectionTitle}>5. 휴대전화번호 처리 안내</Text>
              <Text style={styles.modalParagraph}>
                모아제는 회원가입 과정에서 입력된 휴대전화번호의 형식만 확인합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                SMS 인증 및 휴대전화번호 소유 여부에 대한 본인확인 절차는 진행하지 않습니다.
              </Text>

              <View style={styles.modalCheckRow}>
                <TouchableOpacity
                  onPress={() => setPrivacyModalChecked(c => !c)}
                  activeOpacity={0.85}
                  style={styles.termCheckRow}
                >
                  <View style={[styles.checkbox, privacyModalChecked && styles.checkboxChecked]}>
                    {privacyModalChecked && <Feather name="check" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.modalCheckText}>위 개인정보 수집·이용에 동의합니다.</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={handleConfirmPrivacyNotice}
              disabled={!privacyModalChecked}
              activeOpacity={privacyModalChecked ? 0.85 : 1}
              style={[
                styles.modalConfirmBtn,
                privacyModalChecked ? styles.modalConfirmBtnActive : styles.modalConfirmBtnDisabled,
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
                동의하기
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 개인정보 처리방침 열람 모달 (열람 전용, 동의 기능 없음) */}
      <Modal
        visible={privacyPolicyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClosePrivacyPolicyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>개인정보 처리방침</Text>
              <TouchableOpacity
                onPress={handleClosePrivacyPolicyModal}
                activeOpacity={0.7}
                style={styles.modalCloseIconBtn}
              >
                <Feather name="x" size={20} color={redesign.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalScopeNote}>
              회원가입 시 처리하는 개인정보에 관한 내용입니다.
            </Text>

            <ScrollView
              style={[styles.modalBody, { maxHeight: windowHeight * 0.5 }]}
              contentContainerStyle={styles.modalBodyContent}
            >
              <Text style={[styles.modalMainSectionTitle, styles.modalMainSectionTitleFirst]}>
                제1조. 개인정보의 처리 목적
              </Text>
              <Text style={styles.modalParagraph}>
                모아제는 회원가입 및 계정 관리를 위해 개인정보를 처리합니다.
              </Text>
              <Text style={styles.modalParagraph}>- 회원가입 및 회원 계정 생성</Text>
              <Text style={styles.modalParagraph}>- 회원 식별 및 로그인 관리</Text>
              <Text style={styles.modalParagraph}>
                - 동일 휴대전화번호를 이용한 중복 회원가입 방지
              </Text>
              <Text style={styles.modalParagraph}>- 회원 계정 관리 및 서비스 제공</Text>
              <Text style={styles.modalParagraph}>
                수집된 개인정보는 안내된 목적 범위에서 이용하며, 처리 목적이 변경되는 경우 관련
                법령에 따른 필요한 조치를 이행합니다.
              </Text>

              <Text style={styles.modalMainSectionTitle}>제2조. 개인정보의 처리 항목</Text>
              <Text style={styles.modalSectionTitle}>필수 수집 항목</Text>
              <Text style={styles.modalParagraph}>- 이름</Text>
              <Text style={styles.modalParagraph}>- 휴대전화번호</Text>
              <Text style={styles.modalSectionTitle}>수집 방법</Text>
              <Text style={styles.modalParagraph}>- 이용자가 회원가입 화면에서 직접 입력</Text>
              <Text style={styles.modalSectionTitle}>법적 근거</Text>
              <Text style={styles.modalParagraph}>- 「개인정보 보호법」 제15조 제1항 제1호</Text>
              <Text style={styles.modalParagraph}>
                모아제는 회원가입 과정에서 SMS 인증이나 휴대전화번호 소유 확인을 실시하지 않습니다.
              </Text>
              <Text style={styles.modalParagraph}>
                입력된 휴대전화번호는 형식의 적합성만 검사하며, 이를 통해 실제 이용자의 신원이나
                전화번호 소유 여부가 확인되는 것은 아닙니다.
              </Text>

              <Text style={styles.modalMainSectionTitle}>제3조. 개인정보의 보유 및 이용 기간</Text>
              <Text style={styles.modalParagraph}>
                모아제는 회원가입 과정에서 수집한 이름과 휴대전화번호를 회원 탈퇴 시까지 보유하고
                이용합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                회원 탈퇴 또는 개인정보 처리 목적 달성 등으로 개인정보가 불필요하게 된 경우에는 지체
                없이 파기합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                다만, 관계 법령에 따라 개인정보를 보존해야 하는 경우에는 해당 법령에서 정한 기간
                동안 보관할 수 있습니다.
              </Text>

              {/* TODO: 실제 개인정보 제3자 제공 여부가 확인되면 구체적인 제공 현황(제공받는 자, 목적, 항목, 보유기간)으로 교체한다. 확인 전까지 '제공하지 않는다'고 단정하지 않는다. */}
              <Text style={styles.modalMainSectionTitle}>제4조. 개인정보의 제3자 제공</Text>
              <Text style={styles.modalParagraph}>
                모아제는 「개인정보 보호법」 제17조 등 관계 법령에 따른 적법한 근거가 있는 경우에만
                개인정보를 제3자에게 제공합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                동의가 필요한 경우에는 제공받는 자, 제공 목적, 제공 항목, 보유·이용 기간 및 동의
                거부권을 별도로 안내한 후 동의를 받습니다.
              </Text>

              {/* TODO: 서버 호스팅 등 SMS 외 개인정보 처리업무 위탁이 확인되면 수탁자·위탁업무를 이 조항에 추가한다. */}
              <Text style={styles.modalMainSectionTitle}>제5조. 개인정보 처리업무의 위탁</Text>
              <Text style={styles.modalParagraph}>
                모아제는 회원가입 과정에서 SMS 인증 및 문자 발송 서비스를 이용하지 않습니다.
              </Text>

              <Text style={styles.modalMainSectionTitle}>제6조. 개인정보의 파기 절차 및 방법</Text>
              <Text style={styles.modalParagraph}>
                모아제는 개인정보 보유기간이 종료되거나 처리 목적이 달성되어 해당 개인정보가
                불필요해진 경우 관련 법령에 따라 지체 없이 파기합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                전자적 파일 형태의 개인정보는 복구 또는 재생되지 않도록 안전한 방법으로 삭제합니다.
              </Text>

              {/* TODO: 권리 행사 방법(접수 채널·처리 절차)이 확정되면 이 조항에 추가한다. */}
              <Text style={styles.modalMainSectionTitle}>제7조. 정보주체의 권리 및 행사 방법</Text>
              <Text style={styles.modalParagraph}>
                이용자는 관련 법령에 따라 다음과 같은 권리를 행사할 수 있습니다.
              </Text>
              <Text style={styles.modalParagraph}>- 개인정보 열람 요구</Text>
              <Text style={styles.modalParagraph}>- 개인정보 정정 및 삭제 요구</Text>
              <Text style={styles.modalParagraph}>- 개인정보 처리정지 요구</Text>
              <Text style={styles.modalParagraph}>- 개인정보 수집·이용 동의 철회</Text>

              <Text style={styles.modalMainSectionTitle}>제8조. 개인정보의 안전성 확보 조치</Text>
              <Text style={styles.modalParagraph}>
                모아제는 「개인정보 보호법」에 따라 개인정보의 안전성 확보에 필요한 조치를
                시행합니다.
              </Text>

              {/* TODO: 개인정보 보호책임자 성명·연락처(전화/이메일)는 확정되지 않았다. 확정 전까지 가상 정보를 노출하지 않으며, 「개인정보 보호법」 제30조 필수 기재사항 충족을 위해 최종 법적 검토가 필요하다. */}
              <Text style={styles.modalMainSectionTitle}>제9조. 개인정보 보호 담당자 및 문의</Text>
              <Text style={styles.modalParagraph}>개인정보 보호 담당: 팀 유니핏</Text>

              {/* TODO: 개인정보 처리방침 시행일은 실제 적용일 확정 후 추가한다. */}
              <Text style={styles.modalMainSectionTitle}>제10조. 개인정보 처리방침의 변경</Text>
              <Text style={styles.modalParagraph}>
                본 개인정보 처리방침은 관련 법령 또는 서비스의 개인정보 처리 내용이 변경되는 경우
                수정될 수 있습니다.
              </Text>
              <Text style={styles.modalParagraph}>
                변경 사항은 이용자가 확인할 수 있도록 서비스 내에서 안내합니다.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    marginBottom: 32,
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
  },

  termsSection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: redesign.divider,
    paddingVertical: 18,
    gap: 18,
  },
  termItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  termCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  termItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  privacyNoticeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  privacyPolicyLinkRow: {
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  termDetailLink: {
    fontSize: 13,
    color: redesign.textSecondary,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: redesign.navInactive,
    backgroundColor: redesign.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: redesign.accent,
    borderColor: redesign.accent,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '80%',
    flexDirection: 'column',
    backgroundColor: redesign.bg,
    borderRadius: 16,
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
    color: redesign.textPrimary,
  },
  modalCloseIconBtn: {
    padding: 4,
  },
  modalScopeNote: {
    marginTop: -8,
    marginBottom: 16,
    fontSize: 12,
    color: redesign.textSecondary,
  },
  modalBody: {
    borderRadius: 10,
    backgroundColor: redesign.bg,
    borderWidth: 1,
    borderColor: redesign.divider,
  },
  modalBodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modalSectionTitle: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  modalFirstTitle: {
    marginTop: 0,
  },
  modalMainSectionTitle: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  modalMainSectionTitleFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  modalParagraph: {
    fontSize: 13,
    color: redesign.textSecondary,
    lineHeight: 20,
  },
  modalCheckRow: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  modalCheckText: {
    flexShrink: 1,
    fontSize: 13,
    color: redesign.textPrimary,
  },
  modalConfirmBtn: {
    marginTop: 20,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnActive: {
    backgroundColor: redesign.accent,
  },
  modalConfirmBtnDisabled: {
    backgroundColor: redesign.divider,
  },
  modalConfirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalConfirmTextActive: { color: '#FFFFFF' },
  modalConfirmTextDisabled: { color: redesign.navInactive },
});

export default SignupTermsScreen;
