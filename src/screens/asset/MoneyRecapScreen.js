import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { ROUTES } from '../../constants/routes';
import MoneyRecapHeroCard from '../../components/moneyRecap/MoneyRecapHeroCard';
import MoneyRecapSummaryCards from '../../components/moneyRecap/MoneyRecapSummaryCards';
import MoneyRecapPatternSection from '../../components/moneyRecap/MoneyRecapPatternSection';

// ── mock 데이터 ────────────────────────────────────────────────
const MOCK_HERO = {
  semesterLabel: '2026년 1학기',
  period: '2026.03.02 — 2026.06.20',
  grade: 'B+',
  score: 72,
  scoreMax: 100,
  summary: '시험기간엔 카페 지출이 늘었지만, 전반적으로 안정적인 소비 흐름을 유지했어요.',
};

const MOCK_STORY = {
  body: '3월엔 새내기 적응 비용으로 지출이 많았고, 중간고사 기간엔 카페 지출이 평소보다 1.8배 늘었어요. 5월부터는 점차 안정적인 소비 패턴을 되찾았어요.',
  highlight: '4월 18일에는 동아리 활동비로 하루 87,000원을 사용했어요.',
};

const MOCK_METRICS = {
  avgDailyLimit: 32000,
  totalTransactionCount: 47,
  mostSavedDate: '3월 9일',
  mostSpentDate: '4월 18일',
  topCategory: { label: '식비', percent: 38 },
};

const MOCK_HOURLY_CHART = [
  { hour: '8시', amount: 4000, highlight: false },
  { hour: '9시', amount: 6000, highlight: false },
  { hour: '10시', amount: 5000, highlight: false },
  { hour: '11시', amount: 9000, highlight: false },
  { hour: '12시', amount: 28000, highlight: true },
  { hour: '13시', amount: 25000, highlight: true },
  { hour: '14시', amount: 8000, highlight: false },
  { hour: '15시', amount: 7000, highlight: false },
  { hour: '16시', amount: 6000, highlight: false },
  { hour: '17시', amount: 9000, highlight: false },
  { hour: '18시', amount: 14000, highlight: false },
  { hour: '19시', amount: 11000, highlight: false },
];

const MOCK_HOURLY_INDICATORS = [
  { iconName: 'clock', text: '12~13시 집중', tone: 'olive' },
  { iconName: 'moon', text: '새벽 시간대 큰 지출은 거의 없었어요', tone: 'green' },
];

const MOCK_CATEGORY_BREAKDOWN = [
  { key: 'food', label: '식비', iconName: 'coffee', percent: 38, color: colors.oliveDark },
  { key: 'cafe', label: '카페', iconName: 'coffee', percent: 22, color: colors.olive },
  { key: 'transport', label: '교통', iconName: 'truck', percent: 15, color: colors.oliveMid },
  {
    key: 'shopping',
    label: '쇼핑',
    iconName: 'shopping-bag',
    percent: 14,
    color: colors.oliveLight,
  },
  { key: 'etc', label: '기타', iconName: 'more-horizontal', percent: 11, color: colors.border },
];

const MOCK_WEEKLY_RHYTHM = [
  { day: '월', level: 'mid' },
  { day: '화', level: 'low' },
  { day: '수', level: 'mid' },
  { day: '목', level: 'low' },
  { day: '금', level: 'high' },
  { day: '토', level: 'high' },
  { day: '일', level: 'mid' },
];

const MOCK_TAGS = [
  { label: '점심 집중형', variant: 'primary' },
  { label: '카페 조절형', variant: 'secondary' },
  { label: '시험기간 소비 증가형', variant: 'warning' },
];

const MOCK_AI_INSIGHTS = [
  {
    iconName: 'trending-down',
    title: '카페 지출이 줄고 있어요',
    body: '5월부터 카페 지출이 전월 대비 18% 줄었어요. 이 흐름을 유지하면 한 달에 약 2만원을 더 아낄 수 있어요.',
  },
  {
    iconName: 'calendar',
    title: '시험기간 소비 패턴',
    body: '중간고사 기간에 평소보다 카페·간식 지출이 늘었어요. 다음 시험기간엔 미리 간식을 준비해보는 건 어떨까요?',
  },
  {
    iconName: 'target',
    title: '다음 학기 제안',
    body: '평균 Daily Limit를 5%만 줄여도 한 학기에 약 15만원을 더 모을 수 있어요.',
  },
];

const MOCK_EXAM_COMPARE = {
  midterm: { label: '중간고사', period: '4월 셋째 주', multiplier: 1.8 },
  final: { label: '기말고사', period: '6월 둘째 주', multiplier: 1.2 },
  baseline: { label: '평소 평균' },
};

const MOCK_SAFETY = {
  score: 80,
  scoreMax: 100,
  grade: 'B등급',
  gradeLabel: '양호',
  message: '이번 학기엔 평소와 다른 큰 지출은 거의 없었어요. 소비 흐름이 안정적으로 유지됐어요.',
};

const MOCK_BADGES = [
  { emoji: '🌱', title: '절약왕', desc: '월 평균 지출 10% 절감', tone: 'green' },
  { emoji: '☕', title: '카페 조절러', desc: '카페 지출을 꾸준히 관리했어요', tone: 'olive' },
  { emoji: '📊', title: '꾸준 기록러', desc: '학기 내내 소비를 기록했어요', tone: 'cream' },
  { emoji: '🎓', title: '첫 학기 완주', desc: '첫 머니 리캡을 받았어요', tone: 'warn' },
];

// ── 화면 전용 섹션 컴포넌트 ────────────────────────────────────
function StoryCard({ body, highlight }) {
  return (
    <View style={[styles.card, shadows.xs]}>
      <View style={styles.storyRow}>
        <View style={styles.storyIconBox}>
          <Text style={styles.storyIcon}>✨</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>이번 학기 소비 스토리</Text>
          <Text style={styles.storyBody}>{body}</Text>
        </View>
      </View>
      <View style={styles.storyHighlight}>
        <Text style={styles.storyHighlightText}>{highlight}</Text>
      </View>
    </View>
  );
}

const TAG_STYLES = {
  primary: { background: colors.olive, color: colors.white, prefix: '✦ ' },
  secondary: { background: 'rgba(184,216,107,0.25)', color: colors.oliveDark, prefix: '' },
  warning: {
    background: colors.bgWarn,
    color: colors.orange,
    prefix: '⚡ ',
    borderColor: colors.borderWarn,
  },
};

function PersonalityTags({ tags }) {
  return (
    <View>
      <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>소비 성향 태그</Text>
      <View style={styles.tagRow}>
        {tags.map(tag => {
          const tone = TAG_STYLES[tag.variant] ?? TAG_STYLES.secondary;
          return (
            <View
              key={tag.label}
              style={[
                styles.tag,
                { backgroundColor: tone.background },
                tone.borderColor && { borderWidth: 1, borderColor: tone.borderColor },
              ]}
            >
              <Text style={[styles.tagText, { color: tone.color }]}>
                {tone.prefix}
                {tag.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AIInsightCard({ insights }) {
  return (
    <LinearGradient
      colors={[colors.oliveDeep, colors.oliveDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, shadows.md]}
    >
      <View style={styles.insightHeader}>
        <View style={styles.insightHeaderIcon}>
          <Feather name="zap" size={16} color={colors.white} />
        </View>
        <Text style={styles.insightHeaderText}>AI 개인 인사이트</Text>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {insights.map(insight => (
          <View key={insight.title} style={styles.insightBox}>
            <View style={styles.insightTitleRow}>
              <Feather name={insight.iconName} size={14} color={colors.oliveLight} />
              <Text style={styles.insightTitle}>{insight.title}</Text>
            </View>
            <Text style={styles.insightBody}>{insight.body}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

function ExamCompareCard({ midterm, final, baseline }) {
  const maxMultiplier = Math.max(midterm.multiplier, final.multiplier, 1);

  return (
    <View>
      <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>
        학사 이벤트별 지출 비교
      </Text>
      <View style={styles.examRow}>
        <View style={[styles.examCard, styles.examCardMidterm]}>
          <Text style={styles.examLabelMidterm}>{midterm.label}</Text>
          <Text style={styles.examPeriod}>{midterm.period}</Text>
          <Text style={styles.examMultiplierMidterm}>{midterm.multiplier}배</Text>
        </View>
        <View style={[styles.examCard, styles.examCardFinal]}>
          <Text style={styles.examLabelFinal}>{final.label}</Text>
          <Text style={styles.examPeriod}>{final.period}</Text>
          <Text style={styles.examMultiplierFinal}>{final.multiplier}배</Text>
        </View>
      </View>

      <View style={[styles.card, shadows.xs, { marginTop: spacing.sm }]}>
        <View style={styles.examCompareRow}>
          <Text style={styles.examCompareLabel}>{baseline.label}</Text>
          <View style={styles.examCompareTrack}>
            <View
              style={[
                styles.examCompareFill,
                styles.examCompareFillBaseline,
                { width: `${(1 / maxMultiplier) * 100}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.examCompareRow}>
          <Text style={styles.examCompareLabel}>{midterm.label}</Text>
          <View style={styles.examCompareTrack}>
            <View
              style={[
                styles.examCompareFill,
                styles.examCompareFillMidterm,
                { width: `${(midterm.multiplier / maxMultiplier) * 100}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.examCompareRow}>
          <Text style={styles.examCompareLabel}>{final.label}</Text>
          <View style={styles.examCompareTrack}>
            <View
              style={[
                styles.examCompareFill,
                styles.examCompareFillFinal,
                { width: `${(final.multiplier / maxMultiplier) * 100}%` },
              ]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const SAFETY_RING_R = 30;
const SAFETY_RING_CIRCUMFERENCE = 2 * Math.PI * SAFETY_RING_R;

function SafetyCard({ score, scoreMax, grade, gradeLabel, message }) {
  const pct = Math.min(Math.max(score / scoreMax, 0), 1);
  const strokeDash = SAFETY_RING_CIRCUMFERENCE * pct;

  return (
    <LinearGradient
      colors={['rgba(184,216,107,0.25)', colors.bgLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, shadows.xs, styles.safetyCard]}
    >
      <View style={styles.safetyTopRow}>
        <View style={styles.safetyRingWrap}>
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Circle
                cx="36"
                cy="36"
                r={SAFETY_RING_R}
                stroke="rgba(111,127,63,0.15)"
                strokeWidth={8}
                fill="none"
              />
              <Circle
                cx="36"
                cy="36"
                r={SAFETY_RING_R}
                stroke={colors.oliveDark}
                strokeWidth={8}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${strokeDash} ${SAFETY_RING_CIRCUMFERENCE}`}
              />
            </Svg>
          </View>
          <View style={styles.safetyRingCenter}>
            <Text style={styles.safetyRingValue}>{score}</Text>
            <Text style={styles.safetyRingMax}>/{scoreMax}</Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.safetyGradeRow}>
            <Feather name="check-circle" size={16} color={colors.oliveDark} />
            <Text style={styles.safetyGrade}>
              {grade} — {gradeLabel}
            </Text>
          </View>
          <Text style={styles.safetyDesc}>이번 학기 소비 흐름을 안전하게 점검했어요.</Text>
        </View>
      </View>

      <View style={styles.safetyMessageBox}>
        <Feather name="shield" size={14} color={colors.oliveDark} />
        <Text style={styles.safetyMessage}>{message}</Text>
      </View>
    </LinearGradient>
  );
}

const BADGE_TONES = {
  green: { background: 'rgba(47,158,68,0.08)', borderColor: 'rgba(47,158,68,0.2)' },
  olive: { background: 'rgba(111,127,63,0.08)', borderColor: 'rgba(111,127,63,0.2)' },
  cream: { background: colors.cream, borderColor: colors.border },
  warn: { background: colors.bgWarn, borderColor: colors.borderWarn },
};

function BadgesSection({ badges }) {
  return (
    <View>
      <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>이번 학기 뱃지</Text>
      <View style={styles.badgeGrid}>
        {badges.map(badge => {
          const tone = BADGE_TONES[badge.tone] ?? BADGE_TONES.cream;
          return (
            <View
              key={badge.title}
              style={[
                styles.badgeCard,
                { backgroundColor: tone.background, borderColor: tone.borderColor },
              ]}
            >
              <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
              <Text style={styles.badgeTitle}>{badge.title}</Text>
              <Text style={styles.badgeDesc}>{badge.desc}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FooterCTA({ onPress }) {
  return (
    <LinearGradient
      colors={[colors.oliveDark, colors.oliveDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, shadows.lg, styles.footerCard]}
    >
      <Text style={styles.footerEmoji}>🌿</Text>
      <Text style={styles.footerTitle}>다음 학기는 더 똑똑하게 소비해볼까요?</Text>
      <Text style={styles.footerDesc}>
        오늘의 가용금액과 분석 화면에서 소비 습관을 더 자세히 확인할 수 있어요.
      </Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.footerButton}>
        <Text style={styles.footerButtonText}>홈으로 돌아가기</Text>
        <Feather name="arrow-right" size={16} color={colors.oliveDark} />
      </TouchableOpacity>
    </LinearGradient>
  );
}

// ── 메인 화면 ──────────────────────────────────────────────────
export default function MoneyRecapScreen({ navigation }) {
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.75}>
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>머니 리캡</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <MoneyRecapHeroCard {...MOCK_HERO} />
          <StoryCard {...MOCK_STORY} />
          <MoneyRecapSummaryCards {...MOCK_METRICS} />
          <MoneyRecapPatternSection
            hourlyData={MOCK_HOURLY_CHART}
            hourlyIndicators={MOCK_HOURLY_INDICATORS}
            categoryData={MOCK_CATEGORY_BREAKDOWN}
            weeklyData={MOCK_WEEKLY_RHYTHM}
          />
          <PersonalityTags tags={MOCK_TAGS} />
          <AIInsightCard insights={MOCK_AI_INSIGHTS} />
          <ExamCompareCard {...MOCK_EXAM_COMPARE} />
          <SafetyCard {...MOCK_SAFETY} />
          <BadgesSection badges={MOCK_BADGES} />
          <FooterCTA onPress={() => navigation.navigate(ROUTES.HOME)} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 4,
  },

  // StoryCard
  storyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  storyIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyIcon: {
    fontSize: 18,
  },
  storyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMid,
  },
  storyHighlight: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(184,216,107,0.18)',
    borderRadius: radius.sm,
    padding: 10,
  },
  storyHighlightText: {
    fontSize: 12,
    color: colors.oliveDark,
    fontWeight: '600',
  },

  // PersonalityTags
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // AIInsightCard
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  insightHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  insightBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: 14,
  },
  insightTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.oliveLight,
  },
  insightBody: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },

  // ExamCompareCard
  examRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  examCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  examCardMidterm: {
    backgroundColor: colors.bgWarn,
    borderColor: colors.borderWarn,
  },
  examCardFinal: {
    backgroundColor: 'rgba(184,216,107,0.15)',
    borderColor: 'rgba(184,216,107,0.3)',
  },
  examLabelMidterm: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.orange,
  },
  examLabelFinal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.oliveDark,
  },
  examPeriod: {
    fontSize: 11,
    color: colors.textMid,
  },
  examMultiplierMidterm: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.orange,
    marginTop: 4,
  },
  examMultiplierFinal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.oliveDark,
    marginTop: 4,
  },
  examCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  examCompareLabel: {
    width: 64,
    fontSize: 11,
    color: colors.textMid,
  },
  examCompareTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  examCompareFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  examCompareFillBaseline: {
    backgroundColor: colors.textLight,
  },
  examCompareFillMidterm: {
    backgroundColor: colors.orange,
  },
  examCompareFillFinal: {
    backgroundColor: colors.oliveDark,
  },

  // SafetyCard
  safetyCard: {
    gap: spacing.md,
  },
  safetyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  safetyRingWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyRingCenter: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  safetyRingValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.oliveDark,
  },
  safetyRingMax: {
    fontSize: 11,
    color: colors.textMid,
  },
  safetyGradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  safetyGrade: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.oliveDark,
  },
  safetyDesc: {
    fontSize: 12,
    color: colors.textMid,
    marginTop: 4,
  },
  safetyMessageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    padding: 12,
  },
  safetyMessage: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textDark,
  },

  // BadgesSection
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeCard: {
    width: '48%',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textDark,
  },
  badgeDesc: {
    fontSize: 11,
    color: colors.textMid,
  },

  // FooterCTA
  footerCard: {
    alignItems: 'center',
    padding: 24,
  },
  footerEmoji: {
    fontSize: 32,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    marginTop: 8,
  },
  footerDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 6,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 16,
    width: '100%',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.oliveDark,
  },
});
