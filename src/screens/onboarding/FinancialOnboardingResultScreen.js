import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { colors, radius, spacing, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import { FINANCIAL_ONBOARDING_QUESTIONS } from '../../constants/financialOnboardingQuestions';
import { FUTURE_PROFILE_IMAGES } from '../../constants/futureProfileAssets';
import { buildFinancialOnboardingResultViewModel } from '../../features/onboarding/buildFinancialOnboardingResultViewModel';
import FutureProfileBackdrop from '../../components/onboarding/FutureProfileBackdrop';
import FutureProfileHeroCard from '../../components/onboarding/FutureProfileHeroCard';
import FutureGoalCard from '../../components/onboarding/FutureGoalCard';
import FirstStepCard from '../../components/onboarding/FirstStepCard';
import AnswerSummaryList from '../../components/onboarding/AnswerSummaryList';

function optionLabel(answers, questionId) {
  const optionId = answers?.[questionId];
  if (!optionId) return null;
  const question = FINANCIAL_ONBOARDING_QUESTIONS.find(q => q.id === questionId);
  const option = question?.options.find(o => o.id === optionId);
  return option?.label ?? null;
}

// 선택 답변을 그대로 요약할 뿐, 임의 금융 점수/금액/확률은 절대 만들지 않는다.
export default function FinancialOnboardingResultScreen({ navigation }) {
  const userId = useSelector(state => state.auth.user?.userId);
  const repository = useMemo(() => getOnboardingRepository(userId ?? 'guest'), [userId]);

  const [answers, setAnswers] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const viewModel = useMemo(() => buildFinancialOnboardingResultViewModel(answers), [answers]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    repository.loadResult().then(result => {
      if (cancelled) return;
      setAnswers(result?.answers ?? null);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleRetake = () => {
    navigation.navigate(ROUTES.FINANCIAL_ONBOARDING, {
      mode: 'retake',
      initialAnswers: answers,
      initialIndex: 0,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.olive} />
        </View>
      </SafeAreaView>
    );
  }

  if (!answers) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>아직 완료된 재무 온보딩 결과가 없어요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { profile, future, firstStep } = viewModel;
  const answerSections = [
    { title: '현재의 나', labels: [optionLabel(answers, 'q1'), optionLabel(answers, 'q3')] },
    { title: '주거/생활 스타일', labels: [optionLabel(answers, 'q2'), optionLabel(answers, 'q5')] },
    {
      title: '돈을 대하는 방식',
      labels: [optionLabel(answers, 'q4'), optionLabel(answers, 'q6'), optionLabel(answers, 'q7')],
    },
    { title: '포기하기 어려운 지출', labels: [optionLabel(answers, 'q8')] },
    { title: '지금 가장 필요한 도움', labels: [optionLabel(answers, 'q10')] },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FutureProfileBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>나의 Future Profile</Text>

        <FutureProfileHeroCard
          eyebrow="10개의 답변으로 발견한 나"
          title={profile.title}
          description={profile.description}
          tags={profile.tags}
          imageSource={FUTURE_PROFILE_IMAGES[profile.imageKey] ?? null}
          imageKey={profile.imageKey}
          placeholderIcon={profile.placeholderIcon}
        />

        {future && <FutureGoalCard label={future.label} title={future.title} icon={future.icon} />}

        <Text style={styles.sectionHeading}>미래를 위한 첫걸음</Text>
        <FirstStepCard
          badge={firstStep.badge}
          title={firstStep.title}
          description={firstStep.description}
          ctaLabel={firstStep.ctaLabel}
          icon={firstStep.icon}
          ctaDisabled
          ctaHint="목표 만들기는 곧 제공될 예정이에요."
        />

        <AnswerSummaryList sections={answerSections} />

        <Pressable onPress={handleRetake} style={styles.retakeBtn}>
          <Text style={styles.retakeBtnText}>재검사하기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMid,
    textAlign: 'center',
  },
  scroll: {
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
  sectionHeading: {
    marginTop: spacing.sm,
    fontSize: 18,
    fontWeight: '800',
    color: colors.textDark,
  },
  retakeBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  retakeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.cream,
  },
});
