import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import {
  confirmFdsAlert,
  fetchFdsAlerts,
  fetchFdsLogs,
  fetchSafetyScore,
} from '../../features/work/fdsApi';
import {
  FDS_TAB,
  canRetryFdsError,
  createFdsSession,
  describeFdsError,
} from '../../features/work/fdsScreenLogic';
import WorkOnboardingStatePanel, {
  LoadingPanel,
} from '../../components/onboarding/WorkOnboardingStatePanel';
import SafetyScoreCard from '../../components/work/fds/SafetyScoreCard';
import FdsAlertsSection from '../../components/work/fds/FdsAlertsSection';
import FdsLogsSection from '../../components/work/fds/FdsLogsSection';

const TABS = [
  { key: FDS_TAB.ALERTS, label: '알림' },
  { key: FDS_TAB.LOGS, label: '점검 기록' },
];

// 세션이 아직 없을 때(첫 프레임) useSyncExternalStore에 넘기는 모듈 상수. 참조가 바뀌지 않아야 한다.
const EMPTY_SUBSCRIBE = () => () => {};
const EMPTY_SNAPSHOT = () => null;

// 세션 생성과 dispose를 같은 effect에 묶는다. 개발 모드(StrictMode)에서 effect가 cleanup 뒤 다시 실행되면
// 새 세션을 만들고, 이미 폐기된 세션은 다시 쓰지 않는다. 요청은 여기서 보내지 않는다.
const useFdsSession = () => {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const created = createFdsSession({
      fetchSafetyScore,
      fetchFdsAlerts,
      fetchFdsLogs,
      confirmFdsAlert,
    });
    setSession(created);
    return () => created.dispose();
  }, []);

  const snapshot = useSyncExternalStore(
    session ? session.subscribe : EMPTY_SUBSCRIBE,
    session ? session.getSnapshot : EMPTY_SNAPSHOT
  );
  return { session, snapshot };
};

// 이상거래 알림(API-25~28). 탐지·알림 생성은 서버가 송금 이벤트로 자동 수행하며 이 화면은 결과를 조회·확인만 한다.
// 요청: 구간 첫 진입/미확인 필터 전환/새로고침·'다시 불러오기'(GET)와 알림 '확인' 버튼 탭(API-27 PATCH)뿐.
// 재조회·타이머·자동 재시도 없음.
export default function FdsAlertsScreen({ navigation }) {
  const rawUserId = useSelector(state => state.auth.user?.userId);
  const userId = isValidOnboardingUserId(rawUserId) ? rawUserId : null;

  const { session, snapshot } = useFdsSession();

  // 사용자 설정(첫 구간의 GET 시작). 사용자가 바뀌면 세션이 이전 데이터와 진행 중 요청을 버린다.
  useEffect(() => {
    if (!session) return;
    session.setUser(userId);
  }, [session, userId]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
  };

  const errorProps = (resource, key) => ({
    errorMessage: describeFdsError(resource.errorType),
    canRetry: resource.status === 'error' && canRetryFdsError(resource.errorType),
    onRetry: () => session.retry(key),
  });

  const renderTab = () => {
    const { score, alerts, logs } = snapshot;

    if (snapshot.activeTab === FDS_TAB.LOGS) {
      return (
        <FdsLogsSection
          status={logs.status}
          items={logs.items}
          isTruncated={logs.isTruncated}
          {...errorProps(logs, 'logs')}
        />
      );
    }

    return (
      <View style={styles.stack}>
        <SafetyScoreCard
          status={score.status}
          viewModel={score.viewModel}
          {...errorProps(score, 'score')}
        />
        <FdsAlertsSection
          status={alerts.status}
          items={alerts.items}
          unread={alerts.unread}
          total={alerts.total}
          unreadOnly={snapshot.unreadOnly}
          isTruncated={alerts.isTruncated}
          onChangeUnreadOnly={value => session.setUnreadOnly(value)}
          onConfirm={alertId => session.confirmAlert(alertId)}
          onRefresh={() => session.refreshAlerts()}
          {...errorProps(alerts, 'alerts')}
        />
      </View>
    );
  };

  const renderBody = () => {
    if (!userId) {
      return (
        <WorkOnboardingStatePanel
          title="사용자 정보를 확인할 수 없어요"
          message="다시 로그인한 뒤 확인해주세요."
        />
      );
    }
    // 세션이 없거나 다른 사용자의 스냅샷인 프레임에는 이전 데이터를 보여주지 않는다.
    if (!session || !snapshot || snapshot.userId !== userId) {
      return <LoadingPanel message="이상거래 알림을 준비하는 중이에요" />;
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tabs}>
          {TABS.map(tab => {
            const selected = snapshot.activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => session.selectTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.tabSelected,
                  pressed && styles.pressedDim,
                ]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {renderTab()}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
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
        <Text style={styles.screenTitle}>이상거래 알림</Text>
        <View style={styles.body}>{renderBody()}</View>
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
    paddingHorizontal: redesign.pagePaddingX,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  screenTitle: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingBottom: 12,
    fontSize: 24,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingBottom: 40,
    gap: 20,
  },
  stack: {
    gap: 24,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: redesign.surfaceSoft,
  },
  tabSelected: {
    backgroundColor: redesign.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  tabTextSelected: {
    color: '#FFFFFF',
  },
  pressedDim: {
    opacity: 0.6,
  },
});
