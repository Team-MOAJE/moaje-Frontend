import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { logoutUser } from '../../features/auth/authApi';

const MENU_SECTIONS = [
  {
    title: '계정',
    items: [{ label: '연결된 계좌 관리', route: ROUTES.ACCOUNT_DETAIL }],
  },
  { title: '앱', items: [{ label: '알림 설정', route: ROUTES.SETTINGS }] },
];

export default function ProfileScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(state => state.auth.user);
  const joined = user?.joinedAt ? `가입 ${user.joinedAt.slice(0, 7).replace('-', '.')}` : null;
  const school = user?.school ?? null;
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="arrow-left" size={22} color={redesign.textPrimary} />
          </Pressable>
        </View>

        {/* 스크롤 본문 */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>프로필</Text>

          {/* 사용자 정보 */}
          <View style={styles.identity}>
            <View style={styles.accentLine} />
            <Text style={styles.name}>{user?.name ?? '-'}</Text>
            <Text style={styles.userId}>{user?.userId ?? '-'}</Text>
            {(school || joined) && (
              <Text style={styles.meta}>
                {school}
                {school && joined ? ' · ' : ''}
                {joined}
              </Text>
            )}
          </View>

          {/* 메뉴 */}
          {MENU_SECTIONS.map(section => (
            <View key={section.title}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              <View style={styles.menuList}>
                {section.items.map(item => (
                  <Pressable
                    key={item.label}
                    onPress={() => handleMenuPress(item)}
                    style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Feather name="chevron-right" size={18} color={redesign.navInactive} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {/* 로그아웃 */}
          <Pressable
            onPress={() => setLogoutModalVisible(true)}
            style={({ pressed }) => [styles.logoutRow, pressed && styles.menuRowPressed]}
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </ScrollView>

        {/* 로그아웃 확인 모달 */}
        <Modal
          visible={logoutModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLogoutModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pressedDim: {
    opacity: 0.6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 16,
    paddingBottom: 48,
  },
  screenTitle: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  identity: {
    marginTop: 12,
  },
  accentLine: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: redesign.accent,
    marginBottom: 16,
  },
  name: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: redesign.textPrimary,
  },
  userId: {
    marginTop: 4,
    fontSize: 14,
    color: redesign.textSecondary,
  },
  meta: {
    marginTop: 16,
    fontSize: 13,
    color: redesign.textSecondary,
  },
  sectionLabel: {
    marginTop: 44,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  menuList: {
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  menuRowPressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: redesign.textPrimary,
  },
  logoutRow: {
    marginTop: 48,
    minHeight: 56,
    justifyContent: 'center',
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
    backgroundColor: redesign.bg,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: redesign.textSecondary,
    lineHeight: 21,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  modalBtnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: redesign.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  modalBtnConfirm: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
