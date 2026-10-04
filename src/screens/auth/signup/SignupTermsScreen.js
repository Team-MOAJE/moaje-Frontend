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

// 실제 사용자가 체크박스로 확인해야 하는 항목만 구조화된 레코드로 관리한다.
// "개인정보 처리방침"은 열람 전용 문서라 여기 포함하지 않는다(억지로 필수 동의화하지 않음).
const TERMS_DEFINITIONS = [
  {
    termId: 'phone-verification-privacy-notice',
    type: 'privacy-notice',
    version: 'v1', // TODO: 법무/백엔드 확정 버전으로 교체
    required: true,
  },
];

const SignupTermsScreen = ({ navigation }) => {
  const { height: windowHeight } = useWindowDimensions();

  const [termsRecords, setTermsRecords] = useState(
    TERMS_DEFINITIONS.map(def => ({ ...def, confirmed: false, confirmedAt: null }))
  );
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [privacyModalChecked, setPrivacyModalChecked] = useState(false);
  const [privacyPolicyModalVisible, setPrivacyPolicyModalVisible] = useState(false);

  const privacyNoticeConfirmed =
    termsRecords.find(t => t.termId === 'phone-verification-privacy-notice')?.confirmed ?? false;

  const allValid = termsRecords.filter(t => t.required).every(t => t.confirmed);

  const handleBack = () => navigation.popToTop();

  const handleOpenPrivacyModal = () => {
    setPrivacyModalChecked(privacyNoticeConfirmed);
    setPrivacyModalVisible(true);
  };
  const handleClosePrivacyModal = () => setPrivacyModalVisible(false);

  const handlePressPrivacyCheckbox = () => {
    if (privacyNoticeConfirmed) {
      setTermsRecords(records =>
        records.map(t =>
          t.termId === 'phone-verification-privacy-notice'
            ? { ...t, confirmed: false, confirmedAt: null }
            : t
        )
      );
    } else {
      handleOpenPrivacyModal();
    }
  };

  const handleConfirmPrivacyNotice = () => {
    setTermsRecords(records =>
      records.map(t =>
        t.termId === 'phone-verification-privacy-notice'
          ? { ...t, confirmed: true, confirmedAt: new Date().toISOString() }
          : t
      )
    );
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
        <Text style={styles.headline}>{'회원가입 전에\n확인해 주세요'}</Text>
        <Text style={styles.desc}>회원가입을 진행하기 전에 아래 내용을 확인해 주세요.</Text>

        <View style={styles.termsSection}>
          <View style={styles.termItemRow}>
            <TouchableOpacity
              onPress={handlePressPrivacyCheckbox}
              activeOpacity={0.7}
              style={styles.termCheckRow}
            >
              <View style={[styles.checkbox, privacyNoticeConfirmed && styles.checkboxChecked]}>
                {privacyNoticeConfirmed && <Feather name="check" size={14} color="#FFFFFF" />}
              </View>
              <Text style={styles.termItemText}>개인정보 처리 안내</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenPrivacyModal}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.privacyNoticeButtonText}>안내 확인</Text>
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

      {/* 휴대전화번호 인증을 위한 개인정보 처리 안내 모달 */}
      <Modal
        visible={privacyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClosePrivacyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>휴대전화번호 인증을 위한 개인정보 처리 안내</Text>
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
                모아제는 회원가입 과정에서 휴대전화번호 소유 여부를 확인하고 안전한 계정을 생성하기
                위해 다음과 같이 개인정보를 처리합니다.
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
              <Text style={styles.modalParagraph}>- 인증번호: 인증 완료 또는 발급 후 5분까지</Text>
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
                  <View style={[styles.checkbox, privacyModalChecked && styles.checkboxChecked]}>
                    {privacyModalChecked && <Feather name="check" size={14} color="#FFFFFF" />}
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
                확인
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
              <Text style={styles.modalParagraph}>- 인증번호: 인증 완료 또는 발급 후 5분까지</Text>
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
                모아제는 휴대전화 인증번호 발송을 위하여 개인정보 처리업무를 다음과 같이 위탁합니다.
              </Text>

              <Text style={styles.modalSectionTitle}>수탁자</Text>
              <Text style={styles.modalParagraph}>네이버클라우드 주식회사</Text>

              <Text style={styles.modalSectionTitle}>위탁업무</Text>
              <Text style={styles.modalParagraph}>
                Simple & Easy Notification Service를 통한 SMS 인증번호 발송, 발송 결과 확인 및 발송
                이력 관리
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
                모아제는 위탁계약을 체결할 때 개인정보의 목적 외 처리 금지, 안전성 확보조치, 재위탁
                제한, 수탁자 관리·감독 및 손해배상 등에 관한 사항을 계약 또는 서비스 약관을 통해
                확인하고 수탁자가 개인정보를 안전하게 처리하도록 관리합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                위탁업무의 내용이나 수탁자가 변경되는 경우 개인정보 처리방침을 통해 지체 없이
                공개합니다.
              </Text>
              <Text style={styles.modalParagraph}>
                NAVER Cloud SENS 공식 문서상 SMS 발송 이력은 API와 콘솔에서 최근 90일까지 조회할 수
                있습니다.
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
                2. 인증이 완료되지 않은 휴대전화번호 및 인증 시도 정보는 생성 후 최대 24시간 이내에
                삭제합니다.
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
