import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import {
  createAcademicSchedule,
  fetchEventBuffer,
  fetchSemesterReport,
  fetchSpendingProfile,
} from '../../features/work/spendingApi';
import {
  fetchCalendarSchedules,
  fetchUniversities,
  syncCalendar,
} from '../../features/work/calendarApi';
import {
  BUFFER_NOTICE,
  PROFILE_NOTICE,
  SPENDING_TAB,
  SYNC_CONFIRM_MESSAGE,
  canRetrySpendingError,
  createSpendingSession,
  describeSpendingError,
  describeSubmitResult,
  describeSyncResult,
} from '../../features/work/spendingScreenLogic';
import WorkOnboardingStatePanel, {
  LoadingPanel,
} from '../../components/onboarding/WorkOnboardingStatePanel';
import EventBufferCard from '../../components/work/spending/EventBufferCard';
import ScheduleListSection from '../../components/work/spending/ScheduleListSection';
import ScheduleForm from '../../components/work/spending/ScheduleForm';
import CalendarSyncSection from '../../components/work/spending/CalendarSyncSection';
import SpendingProfileSection from '../../components/work/spending/SpendingProfileSection';
import SemesterReportSection from '../../components/work/spending/SemesterReportSection';

const TABS = [
  { key: SPENDING_TAB.SCHEDULES, label: '학사 일정' },
  { key: SPENDING_TAB.PROFILE, label: '소비 프로필' },
  { key: SPENDING_TAB.REPORT, label: '학기 리포트' },
];

// 세션이 아직 없을 때(첫 프레임) useSyncExternalStore에 넘기는 모듈 상수. 참조가 바뀌지 않아야 한다.
const EMPTY_SUBSCRIBE = () => () => {};
const EMPTY_SNAPSHOT = () => null;

// 세션 생성과 dispose를 같은 effect에 묶는다. 개발 모드(StrictMode)에서 effect가 cleanup 뒤 다시 실행되면
// 새 세션을 만들고, 이미 폐기된 세션은 다시 쓰지 않는다. 요청은 여기서 보내지 않는다.
const useSpendingSession = () => {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const created = createSpendingSession({
      fetchEventBuffer,
      fetchSpendingProfile,
      createAcademicSchedule,
      fetchCalendarSchedules,
      fetchSemesterReport,
      fetchUniversities,
      syncCalendar,
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

// 학기 소비 분석(API-42~46). 값은 모두 서버가 계산한 것을 표시만 한다.
// 요청: 구간 첫 진입/연도·학기 선택/사용자의 '다시 불러오기'(GET)와 '등록' 버튼 탭(API-44 POST),
// 학교 일정 '불러오기' 확인(API-19 POST)뿐. 학교 목록(API-18)은 패널을 처음 펼칠 때 한 번만 읽는다.
// 재조회·타이머·자동 재시도 없음.
export default function SpendingScreen({ navigation }) {
  const rawUserId = useSelector(state => state.auth.user?.userId);
  const userId = isValidOnboardingUserId(rawUserId) ? rawUserId : null;

  const { session, snapshot } = useSpendingSession();

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
    errorMessage: describeSpendingError(resource.errorType),
    canRetry: resource.status === 'error' && canRetrySpendingError(resource.errorType),
    onRetry: () => session.retry(key),
  });

  // API-19는 같은 기간의 기존 자동 일정을 교체하므로 사용자가 확인한 뒤에만 요청한다.
  const handleSyncPress = () => {
    Alert.alert('학교 일정 불러오기', SYNC_CONFIRM_MESSAGE, [
      { text: '취소', style: 'cancel' },
      { text: '불러오기', onPress: () => session.syncSchedules() },
    ]);
  };

  const renderTab = () => {
    const { buffer, schedules, profile, report } = snapshot;

    if (snapshot.activeTab === SPENDING_TAB.PROFILE) {
      return (
        <SpendingProfileSection
          status={profile.status}
          viewModel={profile.viewModel}
          notice={PROFILE_NOTICE}
          {...errorProps(profile, 'profile')}
        />
      );
    }

    if (snapshot.activeTab === SPENDING_TAB.REPORT) {
      return (
        <SemesterReportSection
          year={snapshot.reportPeriod.year}
          semester={snapshot.reportPeriod.semester}
          onChangePeriod={period => session.setReportPeriod(period)}
          status={report.status}
          viewModel={report.viewModel}
          {...errorProps(report, 'report')}
        />
      );
    }

    return (
      <View style={styles.stack}>
        <EventBufferCard
          status={buffer.status}
          viewModel={buffer.viewModel}
          notice={BUFFER_NOTICE}
          {...errorProps(buffer, 'buffer')}
        />
        <CalendarSyncSection
          open={snapshot.calendar.open}
          onToggle={() => session.toggleCalendarPanel()}
          universities={snapshot.calendar.universities}
          selectedUniversityId={snapshot.calendar.selectedUniversityId}
          onSelectUniversity={universityId => session.selectUniversity(universityId)}
          year={snapshot.calendar.year}
          semester={snapshot.calendar.semester}
          onChangePeriod={period => session.setSyncPeriod(period)}
          canSync={snapshot.calendar.canSync}
          syncing={snapshot.calendar.isSyncing}
          onSync={handleSyncPress}
          resultStatus={snapshot.calendar.sync.status}
          resultMessage={describeSyncResult(snapshot.calendar.sync)}
          onRefresh={() => session.refreshScheduleData()}
          {...errorProps(snapshot.calendar.universities, 'universities')}
        />
        <ScheduleListSection
          year={snapshot.scheduleYear}
          onChangeYear={year => session.setScheduleYear(year)}
          status={schedules.status}
          items={schedules.items}
          hasMore={schedules.hasMore}
          loadingMore={schedules.loadingMore}
          moreErrorMessage={
            schedules.moreErrorType ? describeSpendingError(schedules.moreErrorType) : null
          }
          canLoadMore={snapshot.canLoadMoreSchedules}
          onLoadMore={() => session.loadMoreSchedules()}
          {...errorProps(schedules, 'schedules')}
        />
        <ScheduleForm
          form={snapshot.form}
          formErrors={snapshot.formErrors}
          onChangeField={(key, text) => session.setFormField(key, text)}
          onSubmit={() => session.submitSchedule()}
          canSubmit={snapshot.canSubmit}
          submitting={snapshot.isSubmitting}
          resultStatus={snapshot.submit.status}
          resultMessage={describeSubmitResult(snapshot.submit)}
          onRefresh={() => session.refreshScheduleData()}
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
      return <LoadingPanel message="학기 소비 분석을 준비하는 중이에요" />;
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
        <Text style={styles.screenTitle}>학기 소비 분석</Text>
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
