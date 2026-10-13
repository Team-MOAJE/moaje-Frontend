// 서버(Work API) 기반 재무 온보딩 질문 화면. 아직 MainNavigator에 등록되어 있지 않다(6단계에서 연결).
//
// 연결용 props (실제 네비게이션은 상위에서 주입)
// - mode: 'initial'(최초 온보딩) | 'retake'(기존 서버 결과 재검사)
// - userId: 생략하면 state.auth.user.userId 사용
// - repository: 테스트/주입용. 생략하면 getWorkOnboardingRepository(userId)
// - onComplete({ confirmedBy, draftCleanup }): 서버 저장이 확인된 뒤 정확히 한 번 호출
// - onCancel(): 뒤로가기/취소. 서버 호출 없음, Draft는 삭제하지 않는다.
// - navigation: onCancel이 없을 때 canGoBack() → goBack() 폴백에만 사용
//
// 화면 판단 로직은 workOnboardingScreenLogic.js(순수 모듈)에서 테스트한다. 이 파일은 상태를 그리고 연결만 한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../../theme';
import { FUTURE_PROFILE_IMAGES } from '../../constants/futureProfileAssets';
import { getWorkOnboardingRepository } from '../../features/onboarding/adapters/workOnboardingRepository';
import { useWorkOnboardingFlow } from '../../features/onboarding/useWorkOnboardingFlow';
import {
  RESUME_STATUS,
  RETAKE_START_REASON,
  SCREEN_STATE,
  SUBMIT_STATE,
  buildOptionViewModels,
  buildProgressViewModel,
  createOnceNotifier,
  createRequestGate,
  deriveScreenState,
  describeAnswerReject,
  describeDraftIssues,
  describeErrorType,
  describeMode,
  describeQuestionsError,
  describeSubmitFailure,
  getNavigationGuard,
  getResumeAvailability,
  loadRetakeInitialAnswers,
  loadServerCompletion,
  runSubmission,
} from '../../features/onboarding/workOnboardingScreenLogic';
import WorkOnboardingOptionCard from '../../components/onboarding/WorkOnboardingOptionCard';
import WorkOnboardingFreeTextInput from '../../components/onboarding/WorkOnboardingFreeTextInput';
import WorkOnboardingStatePanel, {
  LoadingPanel,
  PanelButton,
} from '../../components/onboarding/WorkOnboardingStatePanel';

const tryGetRepository = userId => {
  try {
    return getWorkOnboardingRepository(userId);
  } catch {
    return null; // 유효하지 않은 user_id
  }
};

// 둘 이상의 비동기 작업이 겹쳐도 마지막 요청만 반영하도록 컴포넌트당 하나의 gate를 쓴다.
const useRequestGate = () => {
  const ref = useRef(null);
  if (ref.current === null) ref.current = createRequestGate();
  return ref.current;
};

const confirmStartFresh = (message, onConfirm) => {
  Alert.alert('새로 시작할까요?', message, [
    { text: '취소', style: 'cancel' },
    { text: '새로 시작', style: 'destructive', onPress: onConfirm },
  ]);
};

// ── 바깥: 준비 단계 + 마운트 경계 ────────────────────────────

export default function WorkFinancialOnboardingScreen({
  mode = 'initial',
  userId: userIdProp,
  repository: repositoryProp,
  onComplete,
  onCancel,
  navigation,
}) {
  const reduxUserId = useSelector(state => state.auth.user?.userId);
  const userId = userIdProp ?? reduxUserId;
  const resolvedMode = mode === 'retake' ? 'retake' : 'initial';
  const repository = useMemo(
    () => repositoryProp ?? tryGetRepository(userId),
    [repositoryProp, userId]
  );

  const [attempt, setAttempt] = useState(0);
  // 사용자/mode/재시도가 바뀌면 scope가 바뀌어 안쪽 화면이 새로 마운트되고 이전 응답은 무시된다.
  const scope = `${userId}:${resolvedMode}:${attempt}`;
  const [prepared, setPrepared] = useState(null); // { scope, ...결과 }
  const gate = useRequestGate();

  const cancel = useCallback(() => {
    if (onCancel) onCancel();
    else if (navigation?.canGoBack?.()) navigation.goBack();
  }, [onCancel, navigation]);

  useEffect(() => {
    if (resolvedMode !== 'retake' || !repository) return undefined;
    const token = gate.begin(scope);
    loadRetakeInitialAnswers(repository).then(result => {
      if (!gate.isCurrent(token)) return; // 언마운트/사용자 변경/재시도로 오래된 응답
      setPrepared({ scope, ...result });
    });
    return () => gate.invalidate();
  }, [gate, repository, resolvedMode, scope]);

  if (!repository) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone="error"
          title="사용자 정보를 확인할 수 없어요"
          message="로그인 상태를 확인한 뒤 다시 시도해주세요."
        >
          <PanelButton label="닫기" variant="secondary" onPress={cancel} />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  if (resolvedMode === 'retake') {
    const result = prepared?.scope === scope ? prepared : null;

    if (!result) {
      return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <LoadingPanel message="기존 답변을 불러오고 있어요" />
        </SafeAreaView>
      );
    }
    if (!result.ok) {
      const message =
        result.reason === RETAKE_START_REASON.LOAD_FAILED
          ? `기존 답변을 불러오지 못했어요. ${describeErrorType(result.errorType)}`
          : result.reason === RETAKE_START_REASON.NO_SERVER_ANSWERS
            ? '서버에 저장된 온보딩 결과가 없어서 재검사를 시작할 수 없어요.'
            : '서버에 저장된 답변이 모두 채워져 있지 않아 재검사를 시작할 수 없어요.';
      return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <WorkOnboardingStatePanel
            tone="error"
            title="재검사를 시작할 수 없어요"
            message={message}
          >
            {result.reason === RETAKE_START_REASON.LOAD_FAILED && (
              <PanelButton label="다시 시도" onPress={() => setAttempt(value => value + 1)} />
            )}
            <PanelButton label="닫기" variant="secondary" onPress={cancel} />
          </WorkOnboardingStatePanel>
        </SafeAreaView>
      );
    }

    return (
      <FlowView
        key={scope}
        scope={scope}
        userId={userId}
        mode="retake"
        initialAnswers={result.answers}
        repository={repository}
        onComplete={onComplete}
        onCancel={cancel}
      />
    );
  }

  return (
    <FlowView
      key={scope}
      scope={scope}
      userId={userId}
      mode="initial"
      repository={repository}
      onComplete={onComplete}
      onCancel={cancel}
    />
  );
}

// ── 안쪽: Flow Hook + 제출 ───────────────────────────────────

function FlowView({ scope, userId, mode, initialAnswers, repository, onComplete, onCancel }) {
  const flow = useWorkOnboardingFlow({ userId, mode, initialAnswers, repository });
  const { actions } = flow;
  const screenGate = useRequestGate();

  const [submit, setSubmit] = useState({ state: SUBMIT_STATE.IDLE });
  const submitLockRef = useRef(false);
  const [freeText, setFreeText] = useState({ questionNo: null, text: '' });

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 완료 콜백 알림기는 effect setup에서 만들고 cleanup에서 폐기한다. dispose()는 되돌릴 수 없으므로
  // 렌더 중에 한 번만 만들면 StrictMode의 effect 재실행/Fast Refresh 뒤 영구히 비활성화된다.
  // effect가 다시 설정될 때마다 새 인스턴스가 만들어지고, 인스턴스 단위로 "1회 호출"이 보장된다.
  // 언마운트/사용자 변경: 진행 중 응답 무시 + 완료 콜백 차단
  const notifierRef = useRef(null);
  useEffect(() => {
    const notifier = createOnceNotifier(payload => onCompleteRef.current?.(payload));
    notifierRef.current = notifier;
    return () => {
      notifier.dispose();
      screenGate.invalidate();
      if (notifierRef.current === notifier) notifierRef.current = null;
    };
  }, [screenGate]);

  // 완료 처리(onComplete)는 항상 이 함수로만 호출한다. 알림기가 없거나 이미 호출되었으면 무시된다.
  const notifyCompletion = payload => {
    notifierRef.current?.notify(payload);
  };

  const screenState = deriveScreenState(flow, submit.state);
  const question = flow.currentQuestion;
  const localFreeText =
    question?.freeText && freeText.questionNo === question.questionNo
      ? freeText.text
      : (flow.currentAnswer?.answerText ?? '');
  const guard = getNavigationGuard({ snapshot: flow, localText: localFreeText });
  const isBusy = submit.state === SUBMIT_STATE.SUBMITTING;

  const resetFreeText = () => setFreeText({ questionNo: null, text: '' });

  const handleBack = useCallback(() => {
    if (isBusy) return true;
    // 서버 저장이 끝난 completed 상태의 뒤로가기는 취소가 아니라 "계속"과 같은 완료 처리다.
    if (screenState === SCREEN_STATE.COMPLETED) {
      notifierRef.current?.notify(submit);
      return true;
    }
    if (screenState === SCREEN_STATE.READY && flow.currentIndex > 0) {
      resetFreeText();
      actions.goPrev();
      return true;
    }
    onCancel();
    return true;
  }, [actions, flow.currentIndex, isBusy, onCancel, screenState, submit]);

  const handleBackRef = useRef(handleBack);
  useEffect(() => {
    handleBackRef.current = handleBack;
  }, [handleBack]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleBackRef.current()
    );
    return () => subscription.remove();
  }, []);

  const handleSubmit = async () => {
    if (submitLockRef.current || !guard.canSubmit) return; // 중복 탭 방지
    submitLockRef.current = true;
    const token = screenGate.begin(scope);
    setSubmit({ state: SUBMIT_STATE.SUBMITTING });

    let result;
    try {
      result = await runSubmission({
        actions,
        repository,
        imageKeys: Object.keys(FUTURE_PROFILE_IMAGES),
      });
    } finally {
      submitLockRef.current = false;
    }
    if (!screenGate.isCurrent(token)) return; // 언마운트/사용자 변경: 화면 반영·완료 콜백 없음

    if (result.state === 'in_progress') {
      setSubmit({ state: SUBMIT_STATE.SUBMIT_ERROR, reason: 'IN_PROGRESS' });
      return;
    }
    setSubmit(result);
    if (result.state === SUBMIT_STATE.COMPLETED && result.draftCleanup === 'cleared') {
      notifyCompletion(result);
    }
  };

  const handleStartFresh = (message = '저장된 작성 내용이 삭제되고 처음부터 시작해요.') => {
    confirmStartFresh(message, async () => {
      const token = screenGate.begin(scope);
      const result = await actions.startFresh();
      if (!screenGate.isCurrent(token)) return;
      if (!result.ok) Alert.alert('새로 시작하지 못했어요', describeAnswerReject(result.reason));
    });
  };

  // ── 상태별 화면 ────────────────────────────────────────────

  if (screenState === SCREEN_STATE.LOADING) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <LoadingPanel message="질문을 불러오고 있어요" />
      </SafeAreaView>
    );
  }

  if (
    screenState === SCREEN_STATE.QUESTIONS_ERROR ||
    screenState === SCREEN_STATE.QUESTIONS_INVALID ||
    screenState === SCREEN_STATE.DRAFT_ERROR
  ) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone="error"
          title={
            screenState === SCREEN_STATE.DRAFT_ERROR
              ? '저장된 내용을 읽지 못했어요'
              : '질문을 불러오지 못했어요'
          }
          message={describeQuestionsError(flow)}
        >
          <PanelButton label="다시 시도" onPress={() => actions.init()} />
          <PanelButton label="닫기" variant="secondary" onPress={onCancel} />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  if (screenState === SCREEN_STATE.DRAFT_INCOMPATIBLE) {
    const lines = describeDraftIssues(flow.issues);
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone="warn"
          title="질문이 바뀌어 저장된 내용을 이어갈 수 없어요"
          message={
            flow.incompatibleDraft?.fromDraft === false
              ? '불러온 답변이 현재 질문과 맞지 않아요.'
              : '이전에 저장한 작성 내용이 현재 질문과 맞지 않아요. 저장된 내용은 아직 삭제되지 않았어요.'
          }
          lines={lines}
        >
          <PanelButton label="새로 시작하기" onPress={() => handleStartFresh()} />
          <PanelButton label="닫기" variant="secondary" onPress={onCancel} />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  if (screenState === SCREEN_STATE.DRAFT_MODE_MISMATCH) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ModeMismatchPanel
          scope={scope}
          snapshot={flow}
          actions={actions}
          repository={repository}
          onStartFresh={handleStartFresh}
          onCancel={onCancel}
        />
      </SafeAreaView>
    );
  }

  if (screenState === SCREEN_STATE.SUBMIT_ERROR || screenState === SCREEN_STATE.SAVE_UNCONFIRMED) {
    const unconfirmed = screenState === SCREEN_STATE.SAVE_UNCONFIRMED;
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          tone={unconfirmed ? 'warn' : 'error'}
          title={unconfirmed ? '저장 여부를 확인하지 못했어요' : '저장하지 못했어요'}
          message={
            submit.reason === 'IN_PROGRESS'
              ? '이전 제출을 처리하고 있어요. 잠시 후 다시 시도해주세요.'
              : describeSubmitFailure(submit)
          }
        >
          <PanelButton
            label={unconfirmed ? '다시 확인하며 저장' : '다시 시도'}
            onPress={handleSubmit}
          />
          <PanelButton
            label="답변으로 돌아가기"
            variant="secondary"
            onPress={() => setSubmit({ state: SUBMIT_STATE.IDLE })}
          />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  if (screenState === SCREEN_STATE.COMPLETED) {
    // Draft 정리까지 끝났다면 onComplete가 이미 호출되었다. 여기까지 온 경우는 정리 실패 안내다.
    const cleanupFailed = submit.draftCleanup === 'failed';
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <WorkOnboardingStatePanel
          title="서버에 저장했어요"
          message={
            cleanupFailed
              ? '서버 저장은 완료됐어요. 이 기기의 임시 저장본만 정리하지 못했어요. 다음에 온보딩을 다시 열면 안내가 나올 수 있어요.'
              : '온보딩 답변이 서버에 저장됐어요.'
          }
        >
          <PanelButton label="계속" onPress={() => notifyCompletion(submit)} />
        </WorkOnboardingStatePanel>
      </SafeAreaView>
    );
  }

  // ready / submitting
  const progress = buildProgressViewModel(flow);
  const options = buildOptionViewModels(question, flow.currentAnswer);
  const primaryLabel = isBusy ? '저장 중...' : flow.isLast ? '제출' : '다음';
  const primaryEnabled = !isBusy && (flow.isLast ? guard.canSubmit : guard.canGoNext);

  const handlePrimary = () => {
    if (!primaryEnabled) return;
    if (flow.isLast) {
      handleSubmit();
      return;
    }
    if (actions.goNext().ok) resetFreeText();
  };

  const handlePrev = () => {
    if (isBusy) return;
    resetFreeText();
    actions.goPrev();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로"
          >
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerCounter}>
            {progress.current} / {progress.total}
          </Text>
          {mode === 'retake' ? (
            <Pressable
              onPress={isBusy ? undefined : onCancel}
              style={styles.headerBtn}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        <View style={styles.progressWrap}>
          <Text style={styles.phaseLabel}>
            {progress.phaseLabel}
            {mode === 'retake' ? ` · ${describeMode('retake')}` : ''}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {flow.draftError && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                임시 저장에 실패했어요. 계속 진행할 수 있지만, 앱을 닫으면 작성한 내용이 사라질 수
                있어요.
              </Text>
            </View>
          )}

          <Text style={styles.questionTitle}>{question.text}</Text>

          {question.freeText ? (
            <WorkOnboardingFreeTextInput
              value={localFreeText}
              answer={flow.currentAnswer}
              disabled={isBusy}
              onChangeText={text => {
                setFreeText({ questionNo: question.questionNo, text });
                actions.setText(text);
              }}
              onSkip={() => {
                setFreeText({ questionNo: question.questionNo, text: '' });
                actions.skipFreeText();
              }}
            />
          ) : (
            <View style={styles.optionList} accessibilityRole="radiogroup">
              {options.map(option => (
                <WorkOnboardingOptionCard
                  key={option.code}
                  label={option.label}
                  selected={option.selected}
                  disabled={isBusy}
                  onPress={() => actions.selectOption(option.code)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={handlePrev}
            disabled={flow.isFirst || isBusy}
            accessibilityRole="button"
            style={[
              styles.footerBtn,
              styles.footerBtnSecondary,
              (flow.isFirst || isBusy) && styles.footerBtnDisabled,
            ]}
          >
            <Text style={styles.footerBtnSecondaryText}>이전</Text>
          </Pressable>
          <Pressable
            onPress={handlePrimary}
            disabled={!primaryEnabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !primaryEnabled, busy: isBusy }}
            style={[
              styles.footerBtn,
              styles.footerBtnPrimary,
              !primaryEnabled && styles.footerBtnDisabled,
            ]}
          >
            <Text style={styles.footerBtnPrimaryText}>{primaryLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Draft mode 불일치 안내 ───────────────────────────────────

function ModeMismatchPanel({ scope, snapshot, actions, repository, onStartFresh, onCancel }) {
  const { modeMismatch } = snapshot;
  const gate = useRequestGate();
  const [completion, setCompletion] = useState(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [notice, setNotice] = useState(null);

  // 서버 완료 상태(API-34). 조회 실패/진행 중이면 이어하기를 열지 않는다.
  useEffect(() => {
    const token = gate.begin(`${scope}:completion:${checkAttempt}`);
    setCompletion(null);
    loadServerCompletion(repository).then(result => {
      if (gate.isCurrent(token)) setCompletion(result);
    });
    return () => gate.invalidate();
  }, [gate, repository, scope, checkAttempt]);

  const availability = getResumeAvailability({
    draftMode: modeMismatch.draftMode,
    completion,
  });

  const handleResume = () => {
    if (availability.status !== RESUME_STATUS.ALLOWED || !completion?.ok) return;
    const result = actions.resumeDraft({ serverCompleted: completion.serverCompleted });
    if (!result.ok) setNotice('이어하기를 할 수 없어요. 서버 상태를 다시 확인해주세요.');
  };

  return (
    <WorkOnboardingStatePanel
      tone="warn"
      title="이전에 저장한 작성 내용이 있어요"
      lines={[
        `현재 진행 방식은 '${describeMode(modeMismatch.requestedMode)}'인데, 저장된 내용은 '${describeMode(modeMismatch.draftMode)}'으로 작성한 거예요.`,
        '저장된 내용은 아직 삭제되지 않았어요.',
      ]}
    >
      {availability.message ? <Text style={styles.panelNote}>{availability.message}</Text> : null}
      {notice ? <Text style={styles.panelNote}>{notice}</Text> : null}

      {availability.status === RESUME_STATUS.ERROR && (
        <PanelButton
          label="서버 상태 다시 확인"
          variant="secondary"
          onPress={() => setCheckAttempt(value => value + 1)}
        />
      )}
      <PanelButton
        label="이어하기"
        disabled={availability.status !== RESUME_STATUS.ALLOWED}
        loading={availability.status === RESUME_STATUS.CHECKING}
        onPress={handleResume}
      />
      <PanelButton
        label="새로 시작하기"
        variant="secondary"
        onPress={() =>
          onStartFresh('저장된 작성 내용이 삭제되고, 현재 진행 방식으로 처음부터 시작해요.')
        }
      />
      <PanelButton label="닫기" variant="secondary" onPress={onCancel} />
    </WorkOnboardingStatePanel>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCounter: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMid,
  },
  progressWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMid,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.olive,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderWarn,
    backgroundColor: colors.bgWarn,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textDark,
  },
  questionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textDark,
    lineHeight: 28,
  },
  optionList: {
    gap: spacing.md,
  },
  panelNote: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMid,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  footerBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMid,
  },
  footerBtnPrimary: {
    backgroundColor: colors.olive,
    ...shadows.sm,
  },
  footerBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.cream,
  },
  footerBtnDisabled: {
    opacity: 0.4,
  },
});
