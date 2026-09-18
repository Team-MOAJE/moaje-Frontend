import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { colors, radius, shadows, spacing } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchTransactionDetail } from '../../features/asset/assetApi';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';

// ── 로컬 색상 (theme에 없는 값) ───────────────────────────────
const LC = {
  heroReversedBg: '#F5F5F0',
  heroReversedBorder: '#E0E0D8',
  timelineLine: '#C8D89A',
  oliveGradStart: '#6F7F3F',
  oliveGradEnd: '#7E9148',
  reversedIcon: '#6F7F3F',
};

// ── 상태별 UI 설정 (거래별 값 제외) ──────────────────────────────
const STATUS_UI_CONFIG = {
  completed: {
    heroStyle: 'olive',
    heroLabel: '송금 완료',
    heroMessage: '송금이 정상적으로 완료됐어요.',
    typeLabel: '송금',
    statusLabel: '송금 완료',
    timelineSteps: ['송금 요청 접수', '처리 중', '금융망 성공 응답', '송금 완료'],
    noticeText: '정상적으로 처리된 거래예요.',
    statusIcon: 'check-circle',
  },
  depositCompleted: {
    heroStyle: 'olive',
    heroLabel: '입금 완료',
    heroMessage: '예정된 알바비가 입금됐어요.',
    typeLabel: '입금',
    statusLabel: '입금 완료',
    timelineSteps: ['입금 발생', '잔액 반영', '입금 완료'],
    noticeText: '정상적으로 처리된 거래예요.',
    statusIcon: 'check-circle',
  },
  expenseCompleted: {
    heroStyle: 'olive',
    heroLabel: '지출 완료',
    heroMessage: '지출이 정상적으로 처리됐어요.',
    typeLabel: '지출',
    statusLabel: '지출 완료',
    timelineSteps: ['결제 발생', '잔액 차감', '지출 완료'],
    noticeText: '정상적으로 처리된 거래예요.',
    statusIcon: 'check-circle',
  },
  pending: {
    heroStyle: 'reversed',
    heroLabel: '처리 중',
    heroMessage: '송금 요청이 접수됐어요. 잠시 기다려주세요.',
    typeLabel: '송금',
    statusLabel: '처리 중',
    timelineSteps: ['송금 요청 접수', '처리 중'],
    noticeText: '금융망에서 처리 중이에요. 곧 결과가 반영돼요.',
    statusIcon: 'loader',
  },
  checking: {
    heroStyle: 'reversed',
    heroLabel: '확인 중',
    heroMessage: '거래 처리 결과를 확인하고 있어요.',
    typeLabel: '송금',
    statusLabel: '확인 중',
    timelineSteps: ['송금 요청 접수', '처리 중', '금융망 응답 확인 중'],
    noticeText: '시스템에서 거래 결과를 확인하고 있어요. 잠시 후 다시 확인해주세요.',
    statusIcon: 'clock',
  },
};

// ── 포맷 유틸 ───────────────────────────────────────────────────
const formatHeroAmount = amount =>
  amount > 0
    ? `+${Math.abs(amount).toLocaleString()}원`
    : `-${Math.abs(amount).toLocaleString()}원`;

const formatAbsAmount = amount => `${Math.abs(amount).toLocaleString()}원`;

// ── 서브 컴포넌트 ────────────────────────────────────────────────

function DetailHeader({ onBack }) {
  return (
    <View style={headerStyles.container}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [headerStyles.backBtn, pressed && headerStyles.backBtnPressed]}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={20} color={colors.textDark} />
      </Pressable>
      <Text style={headerStyles.title}>거래 상세</Text>
      <View style={headerStyles.spacer} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.textDark,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
    }),
  },
  backBtnPressed: {
    backgroundColor: colors.bgOuter,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  spacer: {
    width: 36,
  },
});

function HeroStatusCard({ uiConfig, detail }) {
  const isOlive = uiConfig.heroStyle === 'olive';

  const textColor = isOlive ? colors.white : colors.textDark;
  const iconColor = isOlive ? colors.white : LC.reversedIcon;

  const innerBoxStyle = isOlive
    ? { backgroundColor: 'rgba(255,255,255,0.18)' }
    : { backgroundColor: 'rgba(0,0,0,0.05)', borderColor: LC.heroReversedBorder, borderWidth: 1 };

  const cardContent = (
    <>
      <View style={heroStyles.labelRow}>
        <Feather name={uiConfig.statusIcon} size={14} color={iconColor} />
        <Text style={[heroStyles.label, { color: textColor }]}>{uiConfig.heroLabel}</Text>
      </View>
      <Text style={[heroStyles.amount, { color: textColor }]}>
        {formatHeroAmount(detail.amount)}
      </Text>
      <Text
        style={[
          heroStyles.counterparty,
          { color: isOlive ? 'rgba(255,255,255,0.85)' : colors.textMid },
        ]}
      >
        {detail.counterparty}
      </Text>
      <View style={[heroStyles.messageBox, innerBoxStyle]}>
        <Text
          style={[
            heroStyles.messageText,
            { color: isOlive ? 'rgba(255,255,255,0.9)' : colors.textMid },
          ]}
        >
          {uiConfig.heroMessage}
        </Text>
      </View>
    </>
  );

  if (isOlive) {
    return (
      <LinearGradient
        colors={[LC.oliveGradStart, LC.oliveGradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={heroStyles.card}
      >
        {cardContent}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        heroStyles.card,
        {
          backgroundColor: LC.heroReversedBg,
          borderWidth: 1,
          borderColor: LC.heroReversedBorder,
        },
      ]}
    >
      {cardContent}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...Platform.select({
      ios: {
        shadowColor: colors.textDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  amount: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },
  counterparty: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  messageBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});

function InfoRow({ label, value }) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={infoRowStyles.value}>{value}</Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  label: {
    fontSize: 13,
    color: colors.textLight,
    fontWeight: '500',
  },
  value: {
    fontSize: 13,
    color: colors.textDark,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: spacing.md,
  },
});

function TransactionInfoCard({ rows }) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.cardTitle}>거래 정보</Text>
      <View style={cardStyles.divider} />
      {rows.map((row, i) => (
        <View key={row.label}>
          <InfoRow label={row.label} value={row.value} />
          {i < rows.length - 1 && <View style={cardStyles.rowDivider} />}
        </View>
      ))}
    </View>
  );
}

function TimelineStep({ label, isLast }) {
  return (
    <View style={timelineStyles.stepRow}>
      <View style={timelineStyles.leftCol}>
        <View style={timelineStyles.circle}>
          <Feather name="check" size={11} color={colors.white} />
        </View>
        {!isLast && <View style={timelineStyles.line} />}
      </View>
      <Text style={[timelineStyles.stepLabel, !isLast && timelineStyles.stepLabelSpaced]}>
        {label}
      </Text>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  leftCol: {
    alignItems: 'center',
    width: 22,
    marginRight: spacing.md,
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: 2,
    height: 28,
    backgroundColor: LC.timelineLine,
    marginTop: 2,
  },
  stepLabel: {
    fontSize: 13,
    color: colors.textDark,
    fontWeight: '500',
    paddingTop: 3,
  },
  stepLabelSpaced: {
    marginBottom: 0,
  },
});

function ProcessingTimelineCard({ steps }) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.cardTitle}>처리 상태</Text>
      <View style={cardStyles.divider} />
      <View style={{ gap: 0 }}>
        {steps.map((step, i) => (
          <TimelineStep key={step} label={step} isLast={i === steps.length - 1} />
        ))}
      </View>
    </View>
  );
}

function FriendlyNoticeBox({ text }) {
  return (
    <View style={noticeStyles.box}>
      <Text style={noticeStyles.text}>{text}</Text>
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  box: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: {
    fontSize: 12,
    color: colors.textLight,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.xl,
    ...shadows.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.5,
  },
});

// ── 메인 스크린 ──────────────────────────────────────────────────
export default function TransactionDetailScreen({ route, navigation }) {
  const dispatch = useDispatch();
  const transactionDetail = useSelector(state => state.asset.transactionDetail);
  const transactionDetailLoading = useSelector(state => state.asset.transactionDetailLoading);
  const transactionDetailError = useSelector(state => state.asset.transactionDetailError);

  const params = route?.params ?? {};
  const { transactionId } = params;

  useEffect(() => {
    if (transactionId) {
      dispatch(fetchTransactionDetail(transactionId));
    }
  }, [transactionId, dispatch]);

  const handleBack = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate(ROUTES.TRANSACTION_HISTORY);

  const handleConfirm = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate(ROUTES.TRANSACTION_HISTORY);

  if (transactionDetailLoading) {
    return (
      <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
        <View style={screenStyles.screen}>
          <DetailHeader onBack={handleBack} />
          <View style={screenStyles.centerState}>
            <ActivityIndicator size="large" color={colors.olive} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (transactionDetailError || !transactionDetail) {
    return (
      <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
        <View style={screenStyles.screen}>
          <DetailHeader onBack={handleBack} />
          <View style={screenStyles.centerState}>
            <Feather name="alert-circle" size={40} color={colors.textLight} />
            <Text style={screenStyles.errorText}>거래 상세를 불러오지 못했어요.</Text>
            <Text style={screenStyles.errorSub}>잠시 후 다시 시도해주세요.</Text>
          </View>
          <View style={screenStyles.bottomArea}>
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                screenStyles.confirmBtn,
                pressed && screenStyles.confirmBtnPressed,
              ]}
            >
              <Text style={screenStyles.confirmBtnText}>돌아가기</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const apiStatus = mapTransactionStatus(transactionDetail.status);
  const status = STATUS_UI_CONFIG[apiStatus] ? apiStatus : 'checking';
  const uiConfig = STATUS_UI_CONFIG[status];

  const detail = {
    transactionId: transactionDetail.id,
    status: apiStatus,
    counterparty: transactionDetail.counterparty ?? '-',
    amount: transactionDetail.amount ?? 0,
    requestedAt: transactionDetail.requestedAt ?? '-',
    memo: transactionDetail.memo ?? '-',
  };

  const infoRows = [
    { label: '거래 유형', value: uiConfig.typeLabel },
    { label: '상대 명', value: detail.counterparty },
    { label: '금액', value: formatAbsAmount(detail.amount) },
    { label: '요청 시각', value: detail.requestedAt },
    { label: '현재 상태', value: uiConfig.statusLabel },
    { label: '메모', value: detail.memo },
  ];

  return (
    <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
      <View style={screenStyles.screen}>
        <DetailHeader onBack={handleBack} />

        <ScrollView
          style={screenStyles.scroll}
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <HeroStatusCard uiConfig={uiConfig} detail={detail} />
          <TransactionInfoCard rows={infoRows} />
          <ProcessingTimelineCard steps={uiConfig.timelineSteps} />
          <FriendlyNoticeBox text={uiConfig.noticeText} />
        </ScrollView>

        <View style={screenStyles.bottomArea}>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [
              screenStyles.confirmBtn,
              pressed && screenStyles.confirmBtnPressed,
            ]}
          >
            <Text style={screenStyles.confirmBtnText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: spacing.md,
  },
  errorSub: {
    fontSize: 13,
    color: colors.textLight,
  },
  bottomArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgMain,
  },
  confirmBtn: {
    backgroundColor: colors.olive,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.textDark,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  confirmBtnPressed: {
    backgroundColor: colors.oliveDark,
    opacity: 0.92,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});
