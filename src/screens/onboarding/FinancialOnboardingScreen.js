import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import {
  useOnboardingFlow,
  getMissingQuestionIds,
} from '../../features/onboarding/useOnboardingFlow';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import OnboardingProgress from '../../components/onboarding/OnboardingProgress';
import OnboardingOptionCard from '../../components/onboarding/OnboardingOptionCard';

const TOTAL_QUESTIONS = 10;

export default function FinancialOnboardingScreen({ navigation, route }) {
  const { mode = 'initial', initialAnswers, initialIndex } = route.params ?? {};

  const userId = useSelector(state => state.auth.user?.userId);
  const repository = useMemo(() => getOnboardingRepository(userId ?? 'guest'), [userId]);

  const hasSubmittedRef = useRef(false);
  const isCancellingRetakeRef = useRef(false);
  const flowRef = useRef(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const handleStateChange = useCallback(
    nextState => {
      // 답 선택/이전/다음 액션이 일어난 시점에 즉시 저장을 시도한다(지연된 effect에만 의존하지 않음).
      // 저장 자체의 동시성 제어(순서 보장)는 repository/adapter 내부 책임이다.
      repository.saveDraft(nextState).catch(() => {});
    },
    [repository]
  );

  const flow = useOnboardingFlow({
    mode,
    initialAnswers,
    initialIndex,
    onStateChange: handleStateChange,
  });

  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // 모든 화면 이탈 경로(헤더 뒤로가기, 하드웨어 back, swipe-back 제스처)를 하나의 정책으로 처리한다.
  useEffect(() => {
    const handleBeforeRemove = e => {
      if (hasSubmittedRef.current) {
        // 제출 성공 후 navigation.replace()가 이 정책에 막히거나 draft가 잘못 처리되지 않도록 최우선으로 통과.
        return;
      }

      if (isCancellingRetakeRef.current) {
        // retake 전용 "취소" 버튼이 세팅한 명시적 취소 — currentIndex와 무관하게 재검사 전체 취소.
        e.preventDefault();
        repository.clearDraft().finally(() => {
          isCancellingRetakeRef.current = false;
          navigation.dispatch(e.data.action);
        });
        return;
      }

      const currentFlow = flowRef.current;
      if (currentFlow && currentFlow.currentIndex > 0) {
        // 일반 back은 화면 이탈이 아니라 로컬 질문 이동으로 대체한다.
        e.preventDefault();
        currentFlow.goPrev();
        return;
      }

      if (currentFlow && currentFlow.mode === 'retake') {
        // 취소 버튼이 아니라 Q1에서 일반 back으로 나가는 경우도 재검사 취소로 취급.
        e.preventDefault();
        repository.clearDraft().finally(() => {
          navigation.dispatch(e.data.action);
        });
      }
      // initial 모드에서 Q1 이탈 → 기본 동작 허용(draft는 각 액션 시점에 이미 저장돼 있음)
    };

    return navigation.addListener('beforeRemove', handleBeforeRemove);
  }, [navigation, repository]);

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleCancelRetake = () => {
    isCancellingRetakeRef.current = true;
    navigation.goBack();
  };

  const handleSelect = optionId => {
    flow.selectAnswer(optionId);
  };

  const handleNext = async () => {
    if (!flow.isCurrentAnswered || isSubmitting) return;

    if (!flow.isLast) {
      flow.goNext();
      return;
    }

    setSubmitError(null);

    // 제출 직전 최종 검증: 정상 UI에서는 항상 통과하지만, 잘못된 draft/route params로
    // 응답이 빠진 채 여기까지 온 경우를 방어한다. 누락이 있으면 repository를 호출하지 않는다.
    const missing = getMissingQuestionIds(flow.answers);
    if (missing.length > 0) {
      setSubmitError('일부 질문에 대한 답변이 없어 제출할 수 없어요. 처음부터 다시 확인해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      await repository.submitResult(flow.answers);
      hasSubmittedRef.current = true;
      await repository.clearDraft();
      navigation.replace(ROUTES.FINANCIAL_ONBOARDING_RESULT);
    } catch {
      setSubmitError('결과를 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canGoPrev = flow.currentIndex > 0;
  const nextLabel = flow.isLast ? '결과 보기' : '다음';
  const nextDisabled = !flow.isCurrentAnswered || isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBackPress} style={styles.headerBtn}>
          <Feather name="arrow-left" size={20} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerCounter}>
          {flow.currentIndex + 1} / {TOTAL_QUESTIONS}
        </Text>
        {flow.mode === 'retake' ? (
          <Pressable onPress={handleCancelRetake} style={styles.headerBtn}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <OnboardingProgress
        currentIndex={flow.currentIndex}
        total={TOTAL_QUESTIONS}
        phase={flow.currentQuestion.phase}
        phaseTitle={flow.currentQuestion.phaseTitle}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.questionTitle}>{flow.currentQuestion.title}</Text>

        <View style={styles.optionList}>
          {flow.currentQuestion.options.map(option => (
            <OnboardingOptionCard
              key={option.id}
              label={option.label}
              iconName={option.icon}
              selected={flow.answers[flow.currentQuestion.id] === option.id}
              onPress={() => handleSelect(option.id)}
            />
          ))}
        </View>

        {submitError && <Text style={styles.errorText}>{submitError}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={handleBackPress}
          disabled={!canGoPrev}
          style={[
            styles.footerBtn,
            styles.footerBtnSecondary,
            !canGoPrev && styles.footerBtnDisabled,
          ]}
        >
          <Text style={styles.footerBtnSecondaryText}>이전</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          disabled={nextDisabled}
          style={[
            styles.footerBtn,
            styles.footerBtnPrimary,
            nextDisabled && styles.footerBtnDisabled,
          ]}
        >
          <Text style={styles.footerBtnPrimaryText}>{isSubmitting ? '저장 중...' : nextLabel}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
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
    width: 40,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
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
  errorText: {
    fontSize: 13,
    color: colors.red,
    lineHeight: 18,
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
