// 서버(Work API) 기반 재무 온보딩 결과 화면. 아직 MainNavigator에 등록되어 있지 않다(6단계에서 연결).
//
// 서버가 준 값(API-35 card_title/card_summary, API-33 답변)만 표시한다. 점수·프로필 타입은
// 서버가 제공하지 않으므로 만들지 않는다. Hero 이미지는 기존 Future Profile 이미지 중 검사 완료 시
// 무작위로 고른 뒤 사용자별로 저장해 두는 장식이며, 서버 결과와 무관하다.
//
// 연결용 props (실제 네비게이션은 상위에서 주입, 콜백이 없으면 해당 버튼은 그리지 않는다)
// - onStart():  서버 결과가 없을 때 최초 온보딩 시작
// - onRetake(): 서버에 완료된 결과가 있을 때 재검사
// - onGoHome(): 홈으로 이동
// - userId / repository: 생략하면 state.auth.user.userId / getWorkOnboardingRepository(userId)
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { colors, radius, spacing } from '../../theme';
import { getWorkOnboardingRepository } from '../../features/onboarding/adapters/workOnboardingRepository';
import { FUTURE_PROFILE_IMAGES } from '../../constants/futureProfileAssets';
import {
  RESULT_STATUS,
  createRequestGate,
  describeErrorType,
  getResultActions,
  loadProfileImageKey,
  loadResultData,
} from '../../features/onboarding/workOnboardingScreenLogic';
import FutureProfileBackdrop from '../../components/onboarding/FutureProfileBackdrop';
import FutureProfileHeroCard from '../../components/onboarding/FutureProfileHeroCard';
import WorkOnboardingAnswerSummary from '../../components/onboarding/WorkOnboardingAnswerSummary';
import WorkOnboardingStatePanel, {
  LoadingPanel,
  PanelButton,
} from '../../components/onboarding/WorkOnboardingStatePanel';

const tryGetRepository = userId => {
  try {
    return getWorkOnboardingRepository(userId);
  } catch {
    return null;
  }
};

export default function WorkFinancialOnboardingResultScreen({
  userId: userIdProp,
  repository: repositoryProp,
  onStart,
  onRetake,
  onGoHome,
}) {
  const reduxUserId = useSelector(state => state.auth.user?.userId);
  const userId = userIdProp ?? reduxUserId;
  const repository = useMemo(
    () => repositoryProp ?? tryGetRepository(userId),
    [repositoryProp, userId]
  );

  const [attempt, setAttempt] = useState(0);
  const scope = `${userId}:${attempt}`;
  const [loaded, setLoaded] = useState(null); // { scope, ...loadResultData 결과 }
  const gateRef = useRef(null);
  if (gateRef.current === null) gateRef.current = createRequestGate();
  const gate = gateRef.current;

  // 사용자 변경/재시도/언마운트 시 오래된 응답은 버린다. 이전 사용자의 결과는 현재 화면에 반영되지 않는다.
  useEffect(() => {
    if (!repository) return undefined;
    const token = gate.begin(scope);
    // 장식 이미지는 서버 프로필과 무관하게 사용자별 저장값을 읽는다(완료 결과일 때만, 없으면 1회 저장).
    // 이미지 읽기/쓰기 실패는 결과 표시를 막지 않고 중립 장면으로 대체한다.
    const load = async () => {
      const result = await loadResultData(repository);
      const { imageKey } = await loadProfileImageKey({
        repository,
        status: result.status,
        imageKeys: Object.keys(FUTURE_PROFILE_IMAGES),
      });
      return { ...result, imageKey };
    };
    load().then(result => {
      if (gate.isCurrent(token)) setLoaded({ scope, ...result });
    });
    return () => gate.invalidate();
  }, [gate, repository, scope]);

  const result = loaded?.scope === scope ? loaded : null;
  const retry = () => setAttempt(value => value + 1);

  if (!repository) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone="error"
          title="사용자 정보를 확인할 수 없어요"
          message="로그인 상태를 확인한 뒤 다시 시도해주세요."
        />
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <LoadingPanel message="결과를 불러오고 있어요" />
      </SafeAreaView>
    );
  }

  if (result.status === RESULT_STATUS.ERROR) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone="error"
          title="결과를 불러오지 못했어요"
          message={describeErrorType(result.errorType)}
        >
          <PanelButton label="다시 시도" onPress={retry} />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  // 서버 온보딩 상태는 조회 결과로만 판단한다(추정하지 않음).
  const actions = getResultActions(result.status);
  const buttons = (
    <>
      {actions.showStart && onStart ? (
        <PanelButton label="온보딩 시작하기" onPress={onStart} />
      ) : null}
      {actions.showHome && onGoHome ? (
        <PanelButton
          label="홈으로"
          variant={result.status === RESULT_STATUS.READY ? 'primary' : 'secondary'}
          onPress={onGoHome}
        />
      ) : null}
      {actions.showRetake && onRetake ? (
        <PanelButton label="재검사하기" variant="secondary" onPress={onRetake} />
      ) : null}
    </>
  );

  if (result.status === RESULT_STATUS.EMPTY) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          title="아직 서버에 저장된 결과가 없어요"
          message="재무 온보딩에 답하면 결과가 여기에 표시돼요."
        >
          {buttons}
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  const { view, imageKey } = result;
  const notCompleted = result.status === RESULT_STATUS.NOT_COMPLETED;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FutureProfileBackdrop />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>나의 Future Profile</Text>

        {notCompleted && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              일부 질문만 서버에 저장되어 있어요. (저장된 답변 {view.answeredCount}개)
            </Text>
          </View>
        )}

        {/* 제목/요약은 서버(API-35) 값만 사용한다. 이미지는 분석 결과와 무관한 장식이며 태그는 없다. */}
        <FutureProfileHeroCard
          eyebrow={
            notCompleted
              ? '지금까지 답한 내용으로 그려본 나'
              : `${view.answers.length}개의 답변으로 발견한 나`
          }
          title={view.title ?? '나만의 Future Profile'}
          description={
            view.summaryLines.length > 0
              ? view.summaryLines.join('\n')
              : '답변이 쌓이면 나만의 미래가 더 선명해져요.'
          }
          imageSource={FUTURE_PROFILE_IMAGES[imageKey] ?? null}
          imageKey={imageKey ?? undefined}
        />

        <WorkOnboardingAnswerSummary key={scope} answers={view.answers} />

        <View style={styles.actions}>{buttons}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textDark,
    marginBottom: spacing.xs,
  },
  notice: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderWarn,
    backgroundColor: colors.bgWarn,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textDark,
  },
  actions: {
    gap: spacing.sm,
  },
});
