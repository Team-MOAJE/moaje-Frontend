import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import CategoryListItem from '../../components/category/CategoryListItem';
import BottomNavBar from '../../components/home/BottomNavBar';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import { WORK_ONBOARDING_ENABLED } from '../../features/onboarding/workOnboardingConfig';
import { resolveFinancialOnboardingEntry } from '../../navigation/workOnboardingRouteLogic';

// 실제 라우트가 아니라 handleItemPress 안에서만 분기하는 sentinel — ROUTES 값과 겹치지 않는다.
const FINANCIAL_ONBOARDING_ACTION = 'financialOnboardingEntry';

const FINANCE_ITEMS = [
  { title: '송금하기', desc: '토큰 기반 안전 송금', routeAction: ROUTES.TRANSFER },
  { title: '거래내역', desc: '수입과 지출 흐름 확인', routeAction: ROUTES.TRANSACTION_HISTORY },
  { title: '생활비 분석', desc: '지출 패턴과 고정비 분석', routeAction: ROUTES.DAILY_LIMIT },
  { title: '머니 리캡', desc: '월별 소비 요약과 인사이트', routeAction: ROUTES.MONEY_RECAP },
  {
    title: '이상거래 알림',
    desc: '의심 거래 알림과 소비 안전도 확인',
    routeAction: ROUTES.WORK_FDS,
  },
];

const MY_INFO_ITEMS = [
  { title: '프로필', desc: '내 정보와 로그인 상태 관리', routeAction: ROUTES.PROFILE },
  { title: '설정', desc: '알림, 보안, 앱 환경 설정', routeAction: ROUTES.SETTINGS },
];

const ONBOARDING_ITEMS = [
  {
    title: '재무 온보딩',
    desc: '검사 결과 확인 및 재검사',
    routeAction: FINANCIAL_ONBOARDING_ACTION,
  },
  {
    title: '사회인 준비도',
    desc: '목표 대비 내 준비 상태 확인',
    routeAction: ROUTES.WORK_READINESS,
  },
  {
    title: '미래 자금 시뮬레이션',
    desc: '목표 자금 달성 시점과 지출 조정 비교',
    routeAction: ROUTES.WORK_SIMULATOR,
  },
  {
    title: '학기 소비 분석',
    desc: '학사 일정, 소비 프로필, 학기 리포트',
    routeAction: ROUTES.WORK_SPENDING,
  },
];

export default function CategoryScreen({ navigation }) {
  const user = useSelector(state => state.auth.user);

  const handleFinancialOnboardingPress = async () => {
    // 서버 온보딩(기능 플래그 on): 서버 상태를 추정하지 않고 결과 화면으로 이동한다(결과 화면이 서버 조회 결과로
    // 시작/재검사/홈 버튼을 결정). 기존 로컬 Draft/결과는 읽지 않는다. 플래그 off는 아래 기존 로직 그대로.
    const entry = resolveFinancialOnboardingEntry({ flagEnabled: WORK_ONBOARDING_ENABLED });
    if (entry.kind === 'server_result') {
      navigation.dispatch(entry.action);
      return;
    }

    const repository = getOnboardingRepository(user?.userId ?? 'guest');
    const [draft, result] = await Promise.all([repository.loadDraft(), repository.loadResult()]);

    if (draft) {
      navigation.navigate(ROUTES.FINANCIAL_ONBOARDING, {
        mode: draft.mode,
        initialAnswers: draft.answers,
        initialIndex: draft.currentIndex,
      });
      return;
    }
    if (result) {
      navigation.navigate(ROUTES.FINANCIAL_ONBOARDING_RESULT);
      return;
    }
    navigation.navigate(ROUTES.FINANCIAL_ONBOARDING, {
      mode: 'initial',
      initialAnswers: {},
      initialIndex: 0,
    });
  };

  const handleItemPress = item => {
    if (item.routeAction === FINANCIAL_ONBOARDING_ACTION) {
      handleFinancialOnboardingPress();
      return;
    }
    if (item.routeAction) {
      navigation.navigate(item.routeAction);
    }
  };

  const renderSection = (title, items) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, i) => (
        <CategoryListItem
          key={item.title}
          title={item.title}
          description={item.desc}
          showDivider={i < items.length - 1}
          onPress={() => handleItemPress(item)}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>카테고리</Text>

          {renderSection('금융', FINANCE_ITEMS)}
          {renderSection('내 정보', MY_INFO_ITEMS)}
          {renderSection('나를 알아보기', ONBOARDING_ITEMS)}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <BottomNavBar
          onHomePress={() => navigation.navigate(ROUTES.HOME)}
          onTransferPress={() => navigation.navigate(ROUTES.TRANSFER)}
          onCategoryPress={() => {}}
          activeKey="category"
        />
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.accent,
    marginBottom: 4,
  },
  bottomSpacer: {
    height: 110,
  },
});
