import React, { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { colors, radius, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import ProfileCard from '../../components/profile/ProfileCard';
import { logoutUser } from '../../features/auth/authApi';

const LOGIN_INFO = [
  ['로그인 방식', '카카오 로그인'],
  ['세션 상태', '로그인 유지 중'],
  ['생체 인증', '사용 가능'],
];

const MENUS = [
  { iconLib: 'Mci', iconName: 'account-edit', label: '내 정보 수정', route: null },
  { iconLib: 'Mci', iconName: 'bank-outline', label: '연결된 계좌 관리', route: null },
  { iconLib: 'Mci', iconName: 'fingerprint', label: '생체 인증 설정', route: null },
  { iconLib: 'Feather', iconName: 'bell', label: '알림 설정', route: null },
  {
    iconLib: 'Feather',
    iconName: 'help-circle',
    label: '고객센터 문의',
    route: ROUTES.SUPPORT_SCREEN,
  },
];

export default function ProfileScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(8)).current;

  const showToast = () => {
    setToastVisible(true);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(8);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(2100),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
  };

  const handleMenuPress = item => {
    if (item.route) {
      navigation.navigate(item.route);
    } else {
      showToast();
    }
  };

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await dispatch(logoutUser());
    // RootNavigator가 isAuthenticated=false를 감지해 AuthNavigator로 자동 전환
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>프로필</Text>
          <Pressable
            onPress={showToast}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="edit-2" size={18} color={colors.textDark} />
          </Pressable>
        </View>

        {/* 스크롤 본문 */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ProfileCard
            name={user?.name ?? '-'}
            email={user?.email ?? '-'}
            school={user?.school ?? '-'}
            joined={user?.joinedAt ? `가입 ${user.joinedAt.slice(0, 7).replace('-', '.')}` : '-'}
            initial={user?.name?.charAt(0) ?? '?'}
          />

          {/* 로그인 정보 카드 */}
          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.sectionLabel}>로그인 정보</Text>
            {LOGIN_INFO.map(([key, val]) => (
              <View key={key} style={styles.infoRow}>
                <Text style={styles.infoKey}>{key}</Text>
                <Text style={styles.infoVal}>{val}</Text>
              </View>
            ))}
          </View>

          {/* 메뉴 카드 */}
          <View style={[styles.card, styles.menuCard, shadows.sm]}>
            {MENUS.map((item, i) => (
              <View key={item.label}>
                <TouchableOpacity
                  onPress={() => handleMenuPress(item)}
                  activeOpacity={0.75}
                  style={styles.menuRow}
                >
                  <View style={styles.menuIcon}>
                    {item.iconLib === 'Mci' ? (
                      <MaterialCommunityIcons
                        name={item.iconName}
                        size={18}
                        color={colors.textMid}
                      />
                    ) : (
                      <Feather name={item.iconName} size={18} color={colors.textMid} />
                    )}
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textLight} />
                </TouchableOpacity>
                {i < MENUS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* 로그아웃 버튼 */}
          <TouchableOpacity
            onPress={() => setLogoutModalVisible(true)}
            activeOpacity={0.75}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* 로그아웃 확인 모달 */}
        <Modal
          visible={logoutModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLogoutModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, shadows.xl]}>
              <View style={styles.modalIconWrap}>
                <Feather name="log-out" size={24} color={colors.red} />
              </View>
              <Text style={styles.modalTitle}>로그아웃할까요?</Text>
              <Text style={styles.modalDesc}>
                {
                  '현재 기기에서만 로그아웃됩니다.\n다시 이용하려면 로그인 화면에서 인증이 필요해요.'
                }
              </Text>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  onPress={() => setLogoutModalVisible(false)}
                  activeOpacity={0.85}
                  style={styles.modalBtnCancel}
                >
                  <Text style={styles.modalBtnCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLogoutConfirm}
                  activeOpacity={0.85}
                  style={styles.modalBtnConfirm}
                >
                  <Text style={styles.modalBtnConfirmText}>로그아웃</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Toast */}
        {toastVisible && (
          <Animated.View
            style={[
              styles.toast,
              { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
            ]}
            pointerEvents="none"
          >
            <View style={styles.toastIconWrap}>
              <MaterialCommunityIcons name="sprout" size={16} color={colors.cream} />
            </View>
            <Text style={styles.toastText}>아직 준비 중인 기능이에요 🌱</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnPressed: {
    backgroundColor: colors.bgOuter,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  menuCard: {
    padding: 0,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.textMid,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoKey: {
    fontSize: 14,
    color: colors.textMid,
  },
  infoVal: {
    fontSize: 14,
    color: colors.textDark,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  logoutBtn: {
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.red,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.red,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 24,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(229,72,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13,
    color: colors.textMid,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    color: colors.textDark,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.red,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.olive,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  toastIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.cream,
    lineHeight: 20,
  },
});
