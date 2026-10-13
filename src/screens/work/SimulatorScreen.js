import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import {
  fetchSimulatorBaselines,
  runAdjustment,
  runSimulation,
} from '../../features/work/simulatorApi';
import {
  SIMULATOR_STATUS,
  createSimulatorSession,
  describeSimulatorError,
} from '../../features/work/simulatorScreenLogic';
import WorkOnboardingStatePanel, {
  LoadingPanel,
  PanelButton,
} from '../../components/onboarding/WorkOnboardingStatePanel';
import SimulatorBaselineList from '../../components/work/SimulatorBaselineList';
import SimulatorInputForm from '../../components/work/SimulatorInputForm';
import SimulatorResultCard from '../../components/work/SimulatorResultCard';
import SimulatorAdjustCard from '../../components/work/SimulatorAdjustCard';

const S = SIMULATOR_STATUS;

// 세션이 아직 없을 때(첫 프레임) useSyncExternalStore에 넘기는 모듈 상수. 참조가 바뀌지 않아야 한다.
const EMPTY_SUBSCRIBE = () => () => {};
const EMPTY_SNAPSHOT = () => null;

// 세션 생성과 dispose를 같은 effect에 묶는다. 개발 모드(StrictMode)에서 effect가 cleanup 뒤 다시 실행되면
// 새 세션을 만들고, 이미 폐기된 세션은 다시 쓰지 않는다. 요청은 여기서 보내지 않는다.
const useSimulatorSession = () => {
  const [session, setSession] = useState(null);

  useEffect(() => {
    const created = createSimulatorSession({
      fetchBaselines: fetchSimulatorBaselines,
      runSimulation,
      runAdjustment,
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

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

// 미래 자금 시뮬레이션(API-39/40/41). 값은 모두 서버가 계산한 것을 표시만 한다.
// 요청: 진입 시 기준값(API-39, GET) 1회 + 사용자의 버튼 탭(API-40/41, POST)뿐. 포커스 재조회·타이머·자동 재시도 없음.
export default function SimulatorScreen({ navigation }) {
  const rawUserId = useSelector(state => state.auth.user?.userId);
  const userId = isValidOnboardingUserId(rawUserId) ? rawUserId : null;

  const { session, snapshot } = useSimulatorSession();

  // 사용자 설정과 API-39. API-40/41은 여기서 호출하지 않는다.
  useEffect(() => {
    if (!session) return;
    session.setUser(userId);
    if (userId) session.loadBaselines();
  }, [session, userId]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
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
      return <LoadingPanel message="시뮬레이션을 준비하는 중이에요" />;
    }

    const { baselines, simulation, adjustment } = snapshot;
    const simulationLoading = simulation.status === S.LOADING;
    const adjustmentLoading = adjustment.status === S.LOADING;

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="기준값">
          <SimulatorBaselineList
            status={baselines.status}
            items={baselines.viewModel}
            errorMessage={describeSimulatorError(baselines.errorType)}
            canRetry={snapshot.canRetryBaselines}
            onRetry={() => session.loadBaselines()}
          />
        </Section>

        <Section title="내 조건으로 계산">
          <SimulatorInputForm
            form={snapshot.form}
            fieldErrors={snapshot.fieldErrors}
            onChangeField={(key, text) => session.setField(key, text)}
            onSubmit={() => session.submitSimulation()}
            canSubmit={snapshot.canSubmitSimulation}
            loading={simulationLoading}
          />
        </Section>

        {simulation.status === S.ERROR ? (
          <Section title="계산 결과">
            <Text style={styles.errorText}>{describeSimulatorError(simulation.errorType)}</Text>
            {simulation.retryable ? (
              <PanelButton
                label="다시 계산하기"
                variant="secondary"
                onPress={() => session.submitSimulation()}
                disabled={!snapshot.canSubmitSimulation}
              />
            ) : null}
          </Section>
        ) : null}

        {simulation.status === S.READY && simulation.viewModel ? (
          <>
            <Section title="계산 결과">
              <SimulatorResultCard
                viewModel={simulation.viewModel}
                stale={snapshot.simulationStale}
              />
            </Section>

            <Section title="지출 줄이기·늘리기 비교">
              <SimulatorAdjustCard
                adjustForm={snapshot.adjustForm}
                adjustFormError={snapshot.adjustFormError}
                adjustment={{
                  status: adjustment.status,
                  viewModel: adjustment.viewModel,
                  errorMessage: describeSimulatorError(adjustment.errorType),
                }}
                onChangeDirection={direction => session.setAdjustDirection(direction)}
                onChangeAmount={text => session.setAdjustAmount(text)}
                onSubmit={() => session.submitAdjustment()}
                canSubmit={snapshot.canSubmitAdjustment}
                loading={adjustmentLoading}
              />
            </Section>
          </>
        ) : null}
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
        <Text style={styles.screenTitle}>미래 자금 시뮬레이션</Text>
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
    paddingBottom: 48,
    gap: 28,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: redesign.textPrimary,
  },
  pressedDim: {
    opacity: 0.6,
  },
});
