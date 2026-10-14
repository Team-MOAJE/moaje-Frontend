import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts, fetchTransactionDetail } from '../../features/asset/assetApi';
import { clearTransactionDetail } from '../../features/asset/assetSlice';
import {
  formatServerDateTime,
  formatTxAmount,
  getTxTypeLabel,
  resolveTxTitle,
  txAmountTone,
} from '../../features/asset/assetScreenLogic';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';

// ── 상태별 UI 설정 (거래별 값 제외) ──────────────────────────────
// mapTransactionStatus 결과 키 기준. 완료는 안내 문구가 없고 그 외는 상태 안내를 함께 보여준다.
// 실패(failed)와 취소됨(canceled)은 완료나 확인 중으로 합치지 않는다.
const STATUS_UI_CONFIG = {
  completed: { statusLabel: '완료', noticeText: null },
  depositCompleted: { statusLabel: '완료', noticeText: null },
  expenseCompleted: { statusLabel: '완료', noticeText: null },
  pending: {
    statusLabel: '처리 중',
    noticeText: '금융망에서 처리 중이에요. 곧 결과가 반영돼요.',
  },
  checking: {
    statusLabel: '확인 중',
    noticeText: '시스템에서 거래 결과를 확인하고 있어요. 잠시 후 다시 확인해주세요.',
  },
  failed: {
    statusLabel: '실패',
    noticeText: '처리되지 않은 거래예요.',
  },
  canceled: {
    statusLabel: '취소됨',
    noticeText: '취소된 거래예요.',
  },
};

const isNonEmptyString = value => typeof value === 'string' && value !== '';

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

function TitleBlock({ title }) {
  return (
    <View style={titleStyles.container}>
      <Text style={titleStyles.counterparty}>{title}</Text>
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

// 로딩 / 안내 / 오류 공통 화면. actionLabel이 있으면 "다시 시도"류 버튼을 함께 보여준다.
function StateScreen({ loading, title, message, actionLabel, onAction, actionDisabled, onBack }) {
  return (
    <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
      <View style={screenStyles.screen}>
        <View style={screenStyles.centerState}>
          {loading ? (
            <ActivityIndicator size="large" color={redesign.accent} />
          ) : (
            <Feather name="alert-circle" size={32} color={redesign.navInactive} />
          )}
          {title ? <Text style={screenStyles.errorText}>{title}</Text> : null}
          {message ? <Text style={screenStyles.errorSub}>{message}</Text> : null}
          {actionLabel ? (
            <Pressable
              onPress={onAction}
              disabled={actionDisabled}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => [
                screenStyles.retryBtn,
                actionDisabled && screenStyles.retryDisabled,
                pressed && screenStyles.retryPressed,
              ]}
            >
              <Text style={screenStyles.retryText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
        {loading ? null : <ConfirmButton onPress={onBack} label="돌아가기" />}
      </View>
    </SafeAreaView>
  );
}

// ── 메인 스크린 ──────────────────────────────────────────────────
// 화면 상태(viewKind):
//   invalid      필수 params 없음 / 계좌 목록에 없는 계좌 → 요청 없음
//   accountsWait 계좌 목록을 아직 모름(진행 중이거나 마운트 직후) → 로딩
//   accountsError 계좌 목록 조회 실패 → 다시 시도(계좌 목록)
//   ready        현재 params와 일치하는 상세가 있음
//   loading      상세 요청이 실제로 진행 중
//   error        상세 요청 실패 → 다시 시도
//   preRequest   요청을 보낸 적 없음(effect가 곧 요청) → 로딩 1프레임
//   invalidated  요청을 보냈지만 무효화되어 데이터·오류·진행이 모두 없음 → 안내 + 다시 시도(자동 재요청 없음)
export default function TransactionDetailScreen({ route, navigation }) {
  const dispatch = useDispatch();
  const transactionDetail = useSelector(state => state.asset.transactionDetail);
  const transactionDetailAccountId = useSelector(state => state.asset.transactionDetailAccountId);
  const transactionDetailLoading = useSelector(state => state.asset.transactionDetailLoading);
  const transactionDetailError = useSelector(state => state.asset.transactionDetailError);
  const transactionDetailRequestId = useSelector(state => state.asset.transactionDetailRequestId);
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const accountsError = useSelector(state => state.asset.accountsError);
  const sessionGeneration = useSelector(state => state.asset.sessionGeneration);

  // 화면 제어용 값만 보관한다(서버 데이터를 복사하지 않는다).
  const [accountsObserved, setAccountsObserved] = useState(false);
  const [requestedKey, setRequestedKey] = useState(null);
  const accountsRequestedRef = useRef(false);
  const lastRequestKeyRef = useRef(null);

  const params = route?.params ?? {};
  const { accountId, transactionId } = params;
  const paramsValid = isNonEmptyString(accountId) && isNonEmptyString(transactionId);
  const accountKnown = paramsValid && accounts.some(account => account.id === accountId);
  const currentKey = `${sessionGeneration}|${accountId}|${transactionId}`;

  // 마운트 시점에 계좌 목록이 비어 있고 진행 중이 아닐 때만 1회 조회한다. 이후 상태 변화로 다시 조회하지 않는다.
  useEffect(() => {
    if (!accountsRequestedRef.current) {
      accountsRequestedRef.current = true;
      if (accounts.length === 0 && !accountsLoading) dispatch(fetchAccounts());
    }
    setAccountsObserved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // 상세 요청: params가 유효하고 계좌가 목록에 있으면(계좌 목록 로딩 여부와 무관) 세션·계좌·거래 키당 1회.
  // 실패·무효화·오류는 deps가 아니므로 자동 재시도는 없다. 재시도는 사용자가 버튼을 눌렀을 때만 한다.
  useEffect(() => {
    const valid = isNonEmptyString(accountId) && isNonEmptyString(transactionId);
    if (!valid || !accountKnown) {
      lastRequestKeyRef.current = null;
      return undefined;
    }
    const key = `${sessionGeneration}|${accountId}|${transactionId}`;
    if (lastRequestKeyRef.current !== key) {
      lastRequestKeyRef.current = key;
      setRequestedKey(key);
      dispatch(clearTransactionDetail());
      dispatch(fetchTransactionDetail({ accountId, transactionId }));
    }
    return () => {
      lastRequestKeyRef.current = null;
      dispatch(clearTransactionDetail()); // 늦은 응답 무효화 + 이전 거래 잔상 제거
    };
  }, [dispatch, sessionGeneration, accountId, transactionId, accountKnown]);

  const handleBack = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate(ROUTES.TRANSACTION_HISTORY);

  const matched =
    transactionDetail != null &&
    transactionDetailAccountId === accountId &&
    transactionDetail.id === transactionId;
  const requestLive = transactionDetailLoading && transactionDetailRequestId !== null;
  const accountsSettled = accountsObserved && !accountsLoading;

  let viewKind;
  if (!paramsValid) viewKind = 'invalid';
  else if (!accountKnown) {
    if (!accountsSettled) viewKind = 'accountsWait';
    else if (accountsError && accounts.length === 0) viewKind = 'accountsError';
    else viewKind = 'invalid';
  } else if (matched) viewKind = 'ready';
  else if (requestLive) viewKind = 'loading';
  else if (transactionDetailError) viewKind = 'error';
  else if (requestedKey !== currentKey) viewKind = 'preRequest';
  else viewKind = 'invalidated';

  // 다시 시도: 사용자가 눌렀을 때만 같은 params로 1회 요청한다(진행 중이면 무시).
  const handleRetry = () => {
    if (requestLive) return;
    if (!accountKnown) {
      if (!accountsLoading) dispatch(fetchAccounts());
      return;
    }
    lastRequestKeyRef.current = currentKey;
    setRequestedKey(currentKey);
    dispatch(clearTransactionDetail());
    dispatch(fetchTransactionDetail({ accountId, transactionId }));
  };

  if (viewKind === 'accountsWait' || viewKind === 'loading' || viewKind === 'preRequest') {
    return <StateScreen loading onBack={handleBack} />;
  }

  if (viewKind === 'invalid') {
    return (
      <StateScreen
        title="거래 정보를 확인할 수 없어요."
        message="거래나 계좌를 찾을 수 없어요."
        onBack={handleBack}
      />
    );
  }

  if (viewKind === 'accountsError') {
    return (
      <StateScreen
        title="계좌 정보를 불러오지 못했어요."
        message="잠시 후 다시 시도해주세요."
        actionLabel="다시 시도"
        onAction={handleRetry}
        actionDisabled={accountsLoading}
        onBack={handleBack}
      />
    );
  }

  if (viewKind === 'error') {
    return (
      <StateScreen
        title="거래 상세를 불러오지 못했어요."
        message="잠시 후 다시 시도해주세요."
        actionLabel="다시 시도"
        onAction={handleRetry}
        onBack={handleBack}
      />
    );
  }

  if (viewKind === 'invalidated') {
    return (
      <StateScreen
        title="거래 정보를 다시 확인해 주세요."
        message="요청이 취소되어 거래 정보를 표시하지 못했어요."
        actionLabel="다시 시도"
        onAction={handleRetry}
        onBack={handleBack}
      />
    );
  }

  const apiStatus = mapTransactionStatus(transactionDetail.status, transactionDetail.type);
  const uiConfig = STATUS_UI_CONFIG[apiStatus] ?? STATUS_UI_CONFIG.checking;

  // 서버가 주지 않는 메모·수수료·완료 시각·상대방 이름은 만들지 않는다.
  const infoRows = [
    { label: '거래 시간', value: formatServerDateTime(transactionDetail.createdAt) },
    { label: '거래 구분', value: getTxTypeLabel(transactionDetail) },
    {
      label: '거래 금액',
      value: formatTxAmount(transactionDetail),
      valueColor: txAmountTone(transactionDetail) === 'positive' ? colors.green : undefined,
    },
    { label: '거래 상태', value: uiConfig.statusLabel },
  ];

  return (
    <SafeAreaView style={screenStyles.safeArea} edges={['top', 'bottom']}>
      <View style={screenStyles.screen}>
        <ScrollView
          style={screenStyles.scroll}
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TitleBlock title={resolveTxTitle(transactionDetail)} />
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
  retryBtn: {
    marginTop: 12,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryDisabled: {
    opacity: 0.4,
  },
  notice: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
  },
});
