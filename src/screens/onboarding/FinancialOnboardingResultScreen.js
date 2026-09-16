import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { getOnboardingRepository } from '../../features/onboarding/onboardingRepository';
import { FINANCIAL_ONBOARDING_QUESTIONS } from '../../constants/financialOnboardingQuestions';

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

  const heroLabel = optionLabel(answers, 'q9');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>나의 Future Profile</Text>

        {heroLabel && (
          <View style={styles.heroCard}>
            <View style={styles.heroIconBox}>
              <Feather name="flag" size={20} color={colors.cream} />
            </View>
            <Text style={styles.heroLabel}>3년 뒤 내가 원하는 모습</Text>
            <Text style={styles.heroValue}>{heroLabel}</Text>
          </View>
        )}

        <SectionCard title="현재의 나">
          <SummaryRow label={optionLabel(answers, 'q1')} />
          <SummaryRow label={optionLabel(answers, 'q3')} />
        </SectionCard>

        <SectionCard title="주거/생활 스타일">
          <SummaryRow label={optionLabel(answers, 'q2')} />
          <SummaryRow label={optionLabel(answers, 'q5')} />
        </SectionCard>

        <SectionCard title="돈을 대하는 방식">
          <SummaryRow label={optionLabel(answers, 'q4')} />
          <SummaryRow label={optionLabel(answers, 'q6')} />
          <SummaryRow label={optionLabel(answers, 'q7')} />
        </SectionCard>

        <SectionCard title="포기하기 어려운 지출">
          <SummaryRow label={optionLabel(answers, 'q8')} />
        </SectionCard>

        <SectionCard title="지금 가장 필요한 도움">
          <SummaryRow label={optionLabel(answers, 'q10')} />
        </SectionCard>

        <Pressable onPress={handleRetake} style={styles.retakeBtn}>
          <Text style={styles.retakeBtnText}>재검사하기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionCard({ title, children }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SummaryRow({ label }) {
  if (!label) return null;
  return (
    <View style={styles.summaryRow}>
      <Feather name="check" size={14} color={colors.olive} />
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
    fontSize: 22,
    fontWeight: '800',
    color: colors.textDark,
  },
  heroCard: {
    borderRadius: radius.xxl,
    backgroundColor: colors.olive,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.lg,
  },
  heroIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  heroValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.cream,
  },
  sectionCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMid,
  },
  sectionBody: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '600',
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
