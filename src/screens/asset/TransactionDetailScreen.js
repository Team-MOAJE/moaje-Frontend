import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { fetchTransactionDetail } from '../../features/asset/assetApi';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';

// ── 상태별 UI 설정 (거래별 값 제외) ──────────────────────────────
// 정상 완료 3종에서는 typeLabel만 화면에 쓴다. pending/checking은 상태 행과 안내 문구를 함께 보여준다.
const STATUS_UI_CONFIG = {
  completed: {
    typeLabel: '송금',
    statusLabel: '송금 완료',
    noticeText: null,
  },
  depositCompleted: {
    typeLabel: '입금',
    statusLabel: '입금 완료',
    noticeText: null,
  },
  expenseCompleted: {
    typeLabel: '출금',
    statusLabel: '지출 완료',
    noticeText: null,
  },
  pending: {
    typeLabel: '송금',
    statusLabel: '처리 중',
    noticeText: '금융망에서 처리 중이에요. 곧 결과가 반영돼요.',
  },
  checking: {
    typeLabel: '송금',
    statusLabel: '확인 중',
    noticeText: '시스템에서 거래 결과를 확인하고 있어요. 잠시 후 다시 확인해주세요.',
  },
};

// ── 포맷 유틸 ───────────────────────────────────────────────────
const formatHeroAmount = amount =>
  amount > 0
    ? `+${Math.abs(amount).toLocaleString()}원`
    : `-${Math.abs(amount).toLocaleString()}원`;

// ── 서브 컴포넌트 ────────────────────────────────────────────────

function ConfirmButton({ onPress, label = '확인' }) {
  return (
    <View style={confirmStyles.area}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [confirmStyles.btn, pressed && confirmStyles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={confirmStyles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const confirmStyles = StyleSheet.create({
  area: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: redesign.bg,
  },
  btn: {
    height: 56,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.85,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

function TitleBlock({ counterparty, memo }) {
  return (
    <View style={titleStyles.container}>
      <Text style={titleStyles.counterparty}>{counterparty}</Text>
      {!!memo && <Text style={titleStyles.memo}>{memo}</Text>}
    </View>
  );
}

const titleStyles = StyleSheet.create({
  container: {
    marginTop: 0,
  },
  counterparty: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  memo: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: redesign.textSecondary,
  },
});

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const infoRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    minHeight: 54,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  label: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  value: {
    flex: 1,
    marginLeft: 16,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: redesign.textPrimary,
    textAlign: 'right',
  },
});

function TransactionInfoList({ rows }) {
  return (
    <View>
      <Text style={listStyles.title}>거래 정보</Text>
      <View style={listStyles.list}>
        {rows.map(row => (
          <InfoRow
            key={row.label}
            label={row.label}
            value={row.value}
            valueColor={row.valueColor}
          />
        ))}
      </View>
    </View>
  );
}

const listStyles = StyleSheet.create({
  title: {
    marginTop: 40,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
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

  if (transactionDetailLoading) {
    return (
      <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
        <View style={screenStyles.screen}>
          <View style={screenStyles.centerState}>
            <ActivityIndicator size="large" color={redesign.accent} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (transactionDetailError || !transactionDetail) {
    return (
      <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
        <View style={screenStyles.screen}>
          <View style={screenStyles.centerState}>
            <Feather name="alert-circle" size={32} color={redesign.navInactive} />
            <Text style={screenStyles.errorText}>거래 상세를 불러오지 못했어요.</Text>
            <Text style={screenStyles.errorSub}>잠시 후 다시 시도해주세요.</Text>
          </View>
          <ConfirmButton onPress={handleBack} label="돌아가기" />
        </View>
      </SafeAreaView>
    );
  }

  const apiStatus = mapTransactionStatus(transactionDetail.status);
  const status = STATUS_UI_CONFIG[apiStatus] ? apiStatus : 'checking';
  const uiConfig = STATUS_UI_CONFIG[status];

  const detail = {
    counterparty: transactionDetail.counterparty ?? '-',
    amount: transactionDetail.amount ?? 0,
    requestedAt: transactionDetail.requestedAt ?? '-',
    memo: transactionDetail.memo ?? '',
  };

  // 상대/메모는 상단 타이틀 영역에서 보여주므로 여기서는 거래 시간·구분·금액(·미완료 상태)만 표시한다.
  const infoRows = [
    { label: '거래 시간', value: detail.requestedAt },
    { label: '거래 구분', value: uiConfig.typeLabel },
    {
      label: '거래 금액',
      value: formatHeroAmount(detail.amount),
      valueColor: detail.amount > 0 ? colors.green : redesign.textPrimary,
    },
  ];
  if (uiConfig.noticeText) {
    infoRows.push({ label: '현재 상태', value: uiConfig.statusLabel });
  }

  return (
    <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
      <View style={screenStyles.screen}>
        <ScrollView
          style={screenStyles.scroll}
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TitleBlock counterparty={detail.counterparty} memo={detail.memo} />
          <TransactionInfoList rows={infoRows} />
          {!!uiConfig.noticeText && <Text style={screenStyles.notice}>{uiConfig.noticeText}</Text>}
        </ScrollView>

        <ConfirmButton onPress={handleBack} />
      </View>
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 32,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
    marginTop: 8,
  },
  errorSub: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  notice: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
  },
});
