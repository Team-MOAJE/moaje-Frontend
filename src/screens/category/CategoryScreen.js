import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';
import { colors, radius, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import CategoryListItem from '../../components/category/CategoryListItem';
import BottomNavBar from '../../components/home/BottomNavBar';

const MENU_ITEMS = [
  {
    iconName: 'user',
    title: '프로필',
    desc: '내 정보와 로그인 상태 관리',
    variant: 'active',
    routeAction: ROUTES.PROFILE,
  },
  {
    iconName: 'send',
    title: '송금하기',
    desc: '토큰 기반 안전 송금',
    variant: 'active',
    routeAction: ROUTES.TRANSFER,
  },
  {
    iconName: 'file-text',
    title: '거래내역',
    desc: '수입과 지출 흐름 확인',
    variant: 'active',
    routeAction: ROUTES.TRANSACTION_HISTORY,
  },
  {
    iconName: 'pie-chart',
    title: '생활비 분석',
    desc: '지출 패턴과 고정비 분석',
    variant: 'active',
    routeAction: ROUTES.DAILY_LIMIT,
  },
  {
    iconName: 'moon',
    title: '낭만 달빛',
    desc: '대학생 감성 활동 추천',
    variant: 'comingSoon',
    routeAction: null,
  },
  {
    iconName: 'repeat',
    title: '구독 관리',
    desc: '반복 지출 한눈에 보기',
    variant: 'comingSoon',
    routeAction: null,
  },
  {
    iconName: 'target',
    title: '목표 관리',
    desc: '저축 목표 설정 및 추적',
    variant: 'comingSoon',
    routeAction: null,
  },
  {
    iconName: 'settings',
    title: '설정',
    desc: '알림, 보안, 앱 환경 설정',
    variant: 'active',
    routeAction: ROUTES.SETTINGS,
  },
];

export default function CategoryScreen({ navigation }) {
  const user = useSelector(state => state.auth.user);
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

  const handleItemPress = item => {
    if (item.variant === 'comingSoon') {
      showToast();
      return;
    }
    if (item.routeAction) {
      navigation.navigate(item.routeAction);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[colors.oliveDark, colors.oliveLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBanner}
          >
            <ProfileCardHeader user={user} />
          </LinearGradient>

          <View style={styles.menuWrap}>
            <View style={[styles.menuCard, shadows.md]}>
              {MENU_ITEMS.map((item, i) => (
                <View key={item.title}>
                  <CategoryListItem
                    iconName={item.iconName}
                    title={item.title}
                    description={item.desc}
                    variant={item.variant}
                    onPress={() => handleItemPress(item)}
                  />
                  {i < MENU_ITEMS.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <BottomNavBar
          onHomePress={() => navigation.navigate(ROUTES.HOME)}
          onTransferPress={() => navigation.navigate(ROUTES.TRANSFER)}
          onChartPress={() => navigation.navigate(ROUTES.DAILY_LIMIT)}
          onGridPress={() => {}}
          activeKey="grid"
        />

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

function ProfileCardHeader({ user }) {
  const initial = user?.name?.charAt(0) ?? '?';
  const name = user?.name ?? '-';
  const email = user?.email ?? '-';
  const joinedLabel = user?.joinedAt
    ? `가입일 ${user.joinedAt.slice(0, 7).replace('-', '.')} · MVP 베타`
    : 'MVP 베타';

  return (
    <View style={headerStyles.row}>
      <View style={headerStyles.avatar}>
        <Text style={headerStyles.avatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={headerStyles.name}>{name}</Text>
        <Text style={headerStyles.sub}>대학생 · {email}</Text>
        <Text style={headerStyles.meta}>{joinedLabel}</Text>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  sub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  headerBanner: {
    borderBottomLeftRadius: radius.xxxl,
    borderBottomRightRadius: radius.xxxl,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  menuWrap: {
    paddingHorizontal: 20,
    marginTop: -24,
  },
  menuCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
  bottomSpacer: {
    height: 110,
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
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
