import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import { fetchReadiness } from '../../features/work/readinessApi';
import {
  READINESS_SCREEN_STATE,
  buildReadinessViewModel,
  canRefresh,
  createRequestGate,
  describeReadinessError,
  loadReadiness,
} from '../../features/work/readinessScreenLogic';
import WorkOnboardingStatePanel, {
  LoadingPanel,
  PanelButton,
} from '../../components/onboarding/WorkOnboardingStatePanel';
import ReadinessSummaryCard from '../../components/work/ReadinessSummaryCard';
import ReadinessItemRow from '../../components/work/ReadinessItemRow';

// 화면 로컬 상태: 로그아웃 등으로 요청이 취소됐거나 사용자 정보가 없을 때의 중립 상태(오류 아님).
const IDLE = 'idle';

// 사회인 준비도(API-36). 준비도는 서버가 계산한 값만 표시한다.
// 서버는 조회할 때마다 지표를 기록하므로: 진입 시 1회 + 사용자의 '다시 불러오기'만 조회한다.
// (포커스 재조회·자동 재시도·폴링 없음)
export default function ReadinessScreen({ navigation }) {
  const userId = useSelector(state => state.auth.user?.userId);

  const gateRef = useRef(createRequestGate());
  // 동기 중복 방지용. React 상태는 비동기 반영이라 연타 가드로 쓰지 않는다.
  const inFlightRef = useRef(null); // { userId, token } | null
  const mountedRef = useRef(false);
  const viewRef = useRef(null);

  const [view, setView] = useState(() => {
    const initial = { state: READINESS_SCREEN_STATE.LOADING, ownerUserId: userId ?? null };
    viewRef.current = initial;
    return initial;
  });

  const commit = useCallback(next => {
    viewRef.current = next;
    setView(next);
  }, []);

  // 최초 조회·userId 변경 조회는 canRefresh를 거치지 않는다(초기 상태가 loading이어도 실행되어야 함).
  const startLoad = useCallback(
    async targetUserId => {
      const gate = gateRef.current;
      const token = gate.begin(targetUserId); // 이전 요청 응답은 이 시점부터 폐기된다.
      inFlightRef.current = { userId: targetUserId, token };
      commit({ state: READINESS_SCREEN_STATE.LOADING, ownerUserId: targetUserId });

      const result = await loadReadiness(targetUserId, { fetcher: fetchReadiness });

      // 더 새로운 요청이 시작됐으면 그 요청이 상태를 소유한다(여기서는 아무것도 바꾸지 않는다).
      if (!gate.isCurrent(token)) return;
      inFlightRef.current = null;
      if (!mountedRef.current) return;

      if (result.ok) {
        commit({
          state: READINESS_SCREEN_STATE.READY,
          ownerUserId: targetUserId,
          readiness: result.readiness,
        });
      } else if (result.canceled) {
        // 취소는 오류 화면으로 보이지 않게 한다. loading에 머물지 않도록 중립 상태로 전환.
        commit({ state: IDLE, ownerUserId: targetUserId, reason: 'canceled' });
      } else {
        commit({
          state: READINESS_SCREEN_STATE.ERROR,
          ownerUserId: targetUserId,
          errorType: result.errorType,
        });
      }
    },
    [commit]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!isValidOnboardingUserId(userId)) {
      gateRef.current.invalidate();
      inFlightRef.current = null;
      commit({ state: IDLE, ownerUserId: userId ?? null, reason: 'noUser' });
    } else if (inFlightRef.current?.userId !== userId) {
      // 개발 모드(StrictMode)의 effect 재실행처럼 같은 사용자의 요청이 이미 진행 중이면 이어받는다.
      startLoad(userId);
    }
    return () => {
      // gate를 무효화하지 않는다: 무효화하면 effect 재실행 때 POST가 중복된다.
      // 언마운트 후 도착한 응답은 mountedRef로 폐기한다.
      mountedRef.current = false;
    };
  }, [userId, startLoad, commit]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
  };

  const handleRefresh = () => {
    if (inFlightRef.current) return;
    if (!canRefresh(viewRef.current.state)) return;
    if (!isValidOnboardingUserId(userId)) return;
    startLoad(userId);
  };

  // 다른 사용자의 결과는 effect가 갱신하기 전 프레임에도 보여주지 않는다.
  const isOwnView = view.ownerUserId === (userId ?? null);
  const currentState = isOwnView ? view.state : READINESS_SCREEN_STATE.LOADING;
  const refreshDisabled = !canRefresh(currentState);

  const renderBody = () => {
    if (currentState === READINESS_SCREEN_STATE.LOADING) {
      return <LoadingPanel message="준비도를 불러오는 중이에요" />;
    }

    if (currentState === READINESS_SCREEN_STATE.ERROR) {
      return (
        <WorkOnboardingStatePanel
          tone="error"
          title="준비도를 불러오지 못했어요"
          message={describeReadinessError(view.errorType)}
        >
          <PanelButton label="다시 불러오기" onPress={handleRefresh} disabled={refreshDisabled} />
        </WorkOnboardingStatePanel>
      );
    }

    if (currentState === IDLE) {
      const noUser = view.reason === 'noUser';
      return (
        <WorkOnboardingStatePanel
          title={noUser ? '사용자 정보를 확인할 수 없어요' : '조회가 중단되었어요'}
          message={
            noUser
              ? '다시 로그인한 뒤 확인해주세요.'
              : '준비도 조회가 중단되었어요. 필요하면 다시 불러올 수 있어요.'
          }
        >
          {noUser ? null : <PanelButton label="다시 불러오기" onPress={handleRefresh} />}
        </WorkOnboardingStatePanel>
      );
    }

    const model = buildReadinessViewModel(view.readiness);
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ReadinessSummaryCard
          percent={model.percent}
          level={model.level}
          levelLabel={model.levelLabel}
          message={model.message}
        />

        {model.assetNotice ? <Text style={styles.assetNotice}>{model.assetNotice}</Text> : null}

        <View style={styles.items}>
          {model.items.map(item => (
            <ReadinessItemRow
              key={item.key}
              label={item.label}
              detail={item.detail}
              scoreText={item.scoreText}
              isExcluded={item.isExcluded}
            />
          ))}
        </View>

        <Text style={styles.disclaimer}>{model.disclaimer}</Text>

        <PanelButton
          label="다시 불러오기"
          variant="secondary"
          onPress={handleRefresh}
          disabled={refreshDisabled}
        />
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
        <Text style={styles.screenTitle}>사회인 준비도</Text>
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
    paddingBottom: 32,
    gap: 16,
  },
  assetNotice: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
  items: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: redesign.divider,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
  pressedDim: {
    opacity: 0.6,
  },
});
