import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch, useStore } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts, fetchTransactions } from '../../features/asset/assetApi';
import {
  resetTransactions,
  beginTransactionsRefresh,
  setSelectedAccountId,
} from '../../features/asset/assetSlice';
import {
  buildHistoryViewModel,
  formatExactMoney,
  formatServerDateTime,
  formatTxAmount,
  getAccountStatusLabel,
  getAccountStatusNotice,
  getTxTypeLabel,
  resolveHistoryTarget,
  resolveTxTitle,
  txAmountTone,
} from '../../features/asset/assetScreenLogic';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';
import TransactionPeriodModal, {
  computePeriodRange,
  getPeriodLabel,
} from './TransactionPeriodModal';
import TransactionStatusBadge from '../../components/asset/TransactionStatusBadge';

const FILTERS = ['전체', '입금', '출금', '송금'];

// 정상 완료 상태는 badge 없이 보조 정보(거래 유형)만 노출한다. 그 외(pending/checking/failed/canceled)는 badge로 보여준다.
const NORMAL_STATUSES = ['completed', 'depositCompleted', 'expenseCompleted'];

// ── 서브 컴포넌트 ─────────────────────────────────────────────

// 서버 계좌 목록의 라벨과 정확성이 보장된 잔액만 보여준다(요약·사용 가능 금액 API는 없다).
function TransactionSummary({ label, statusLabel, statusNotice, balanceText }) {
  return (
    <View style={summaryStyles.container}>
      <View style={summaryStyles.titleRow}>
        <Text style={summaryStyles.title}>{label}</Text>
        {statusLabel ? <Text style={summaryStyles.statusBadge}>{statusLabel}</Text> : null}
      </View>
      {statusNotice ? <Text style={summaryStyles.notice}>{statusNotice}</Text> : null}

      <Text style={summaryStyles.currentLabel}>현재 잔액</Text>
      <Text style={summaryStyles.currentBalance}>{balanceText}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: redesign.textSecondary,
  },
  notice: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 4,
  },
  currentLabel: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 20,
  },
  currentBalance: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
    marginTop: 2,
  },
});

function TransactionFilterTab({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={[filterStyles.tab, active && filterStyles.tabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[filterStyles.text, active && filterStyles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const filterStyles = StyleSheet.create({
  tab: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: redesign.accent,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    color: redesign.textSecondary,
  },
  textActive: {
    fontWeight: '600',
    color: redesign.accent,
  },
});

function TransactionHistoryRow({ tx, onPress }) {
  const status = mapTransactionStatus(tx.status, tx.type);
  const amountColor = txAmountTone(tx) === 'positive' ? colors.green : redesign.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [rowStyles.container, pressed && rowStyles.pressed]}
      accessibilityRole="button"
    >
      <View style={rowStyles.left}>
        <Text style={rowStyles.counterparty} numberOfLines={1}>
          {resolveTxTitle(tx)}
        </Text>
        <Text style={rowStyles.meta} numberOfLines={1}>
          {`${getTxTypeLabel(tx)} · ${formatServerDateTime(tx.createdAt)}`}
        </Text>
      </View>

      <View style={rowStyles.right}>
        <Text style={[rowStyles.amount, { color: amountColor }]}>{formatTxAmount(tx)}</Text>
        {!NORMAL_STATUSES.includes(status) && <TransactionStatusBadge status={status} />}
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
  },
  pressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  counterparty: {
    fontSize: 16,
    fontWeight: '500',
    color: redesign.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 3,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
});

function SkeletonRow({ delay }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[skeletonStyles.row, { opacity }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[skeletonStyles.bar, { width: 96, height: 12 }]} />
        <View style={[skeletonStyles.bar, { width: 128, height: 10, opacity: 0.65 }]} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[skeletonStyles.bar, { width: 64, height: 12 }]} />
        <View style={[skeletonStyles.bar, { width: 48, height: 10, opacity: 0.65 }]} />
      </View>
    </Animated.View>
  );
}

function TransactionLoadingSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {[0, 1, 2, 3].map(i => (
        <View key={i}>
          <SkeletonRow delay={i * 120} />
          {i < 3 && <View style={skeletonStyles.divider} />}
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
  },
  bar: {
    borderRadius: 4,
    backgroundColor: redesign.divider,
  },
  divider: {
    height: 1,
    backgroundColor: redesign.divider,
  },
});

// 서버 API 없이 동작하지 않는 "계좌 연결" 버튼은 두지 않는다. 송금하기만 제공한다.
function TransactionEmptyState({ onTransfer }) {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.title}>아직 거래내역이 없어요.</Text>
      <Text style={emptyStyles.desc}>송금하면 자산 흐름이 여기에 표시돼요.</Text>

      <View style={emptyStyles.actions}>
        <Pressable
          onPress={onTransfer}
          style={({ pressed }) => [emptyStyles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={emptyStyles.primaryBtnText}>송금하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    paddingTop: 48,
    paddingBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  desc: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 8,
    lineHeight: 21,
  },
  actions: {
    marginTop: 28,
    gap: 8,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

function InlineButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        inlineStyles.btn,
        disabled && inlineStyles.disabled,
        pressed && inlineStyles.pressed,
      ]}
    >
      <Text style={inlineStyles.text}>{label}</Text>
    </Pressable>
  );
}

const inlineStyles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});

function TransactionLoadMoreFooter({ isLoadingMore, errorMessage, onRetry }) {
  return (
    <View>
      {isLoadingMore && (
        <View style={footerStyles.loaderRow}>
          <ActivityIndicator size="small" color={redesign.accent} />
        </View>
      )}
      {errorMessage ? (
        <View style={footerStyles.errorBox}>
          <Text style={footerStyles.errorText}>다음 거래를 불러오지 못했어요.</Text>
          <InlineButton label="다시 시도" onPress={onRetry} disabled={isLoadingMore} />
        </View>
      ) : null}
      <View style={footerStyles.spacer} />
    </View>
  );
}

const footerStyles = StyleSheet.create({
  loaderRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  errorBox: {
    paddingVertical: 16,
  },
  errorText: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  spacer: {
    height: 40,
  },
});

function StatusMessage({ title, message, actionLabel, onAction, actionDisabled }) {
  return (
    <View style={statusStyles.container}>
      <Text style={statusStyles.title}>{title}</Text>
      {message ? <Text style={statusStyles.text}>{message}</Text> : null}
      {actionLabel ? (
        <InlineButton label={actionLabel} onPress={onAction} disabled={actionDisabled} />
      ) : null}
    </View>
  );
}

const statusStyles = StyleSheet.create({
  container: {
    paddingTop: 48,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  text: {
    marginTop: 6,
    fontSize: 14,
    color: redesign.textSecondary,
    lineHeight: 21,
  },
});

// ── 메인 화면 ─────────────────────────────────────────────────

export default function TransactionHistoryScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const store = useStore();
  const transactions = useSelector(state => state.asset.transactions);
  const transactionsAccountId = useSelector(state => state.asset.transactionsAccountId);
  const transactionsLoading = useSelector(state => state.asset.transactionsLoading);
  const transactionsLoadingMore = useSelector(state => state.asset.transactionsLoadingMore);
  const transactionsHasNext = useSelector(state => state.asset.transactionsHasNext);
  const transactionsNextCursor = useSelector(state => state.asset.transactionsNextCursor);
  const transactionsError = useSelector(state => state.asset.transactionsError);
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const accountsError = useSelector(state => state.asset.accountsError);
  const selectedAccountId = useSelector(state => state.asset.selectedAccountId);
  const sessionGeneration = useSelector(state => state.asset.sessionGeneration);
  // 송금 완료로 계좌 데이터가 무효화되면 같은 계좌여도 첫 페이지를 다시 조회한다.
  const accountDataVersion = useSelector(state => state.asset.accountDataVersion);

  // 아래 state/ref는 모두 화면 제어용이다(서버 데이터를 복사하지 않는다).
  const [filter, setFilter] = useState('전체');
  const [periodType, setPeriodType] = useState('전체');
  const [customStartKey, setCustomStartKey] = useState(null);
  const [customEndKey, setCustomEndKey] = useState(null);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accountsRequested, setAccountsRequested] = useState(false);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [lastRequestKind, setLastRequestKind] = useState(null); // 'first' | 'more' — 마지막으로 보낸 거래 요청 종류

  const mountedRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const retryPendingRef = useRef(false);
  const lastRequestKeyRef = useRef(null); // 마지막으로 첫 페이지를 요청한 키(문자열)
  const lastAccountIdRef = useRef(null); // 마지막으로 첫 페이지를 요청한 계좌 id(문자열)

  const dateRange = useMemo(
    () => computePeriodRange(periodType, customStartKey, customEndKey),
    [periodType, customStartKey, customEndKey]
  );

  // ── 조회 대상 계좌 ──
  const routeAccountId =
    typeof route?.params?.accountId === 'string' && route.params.accountId !== ''
      ? route.params.accountId
      : null;
  const routeAccountListed =
    routeAccountId !== null && accounts.some(account => account.id === routeAccountId);
  // route로 받은 계좌가 목록에 없으면 임의의 다른 계좌로 대체하지 않는다.
  const routeAccountMissing = routeAccountId !== null && accounts.length > 0 && !routeAccountListed;
  // route 계좌가 목록에 있지만 선택 상태와 다르면 선택을 맞출 때까지 거래 요청을 보류한다.
  const routeSeedPending = routeAccountListed && routeAccountId !== selectedAccountId;

  const target = resolveHistoryTarget({
    accounts,
    selectedAccountId,
    accountsLoading,
    accountsError,
    fetched: accountsRequested,
  });
  const readyAccountId =
    target.kind === 'ready' && !routeSeedPending && !routeAccountMissing ? target.accountId : null;
  const readyAccount = readyAccountId !== null ? target.account : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dispatch(fetchAccounts());
    setAccountsRequested(true);
  }, [dispatch]);

  useEffect(() => {
    if (routeSeedPending) dispatch(setSelectedAccountId(routeAccountId));
  }, [dispatch, routeSeedPending, routeAccountId]);

  // 거래 첫 페이지 요청은 이 effect 한 곳에서만 보낸다(새로고침·다시 시도는 refreshGeneration만 올린다).
  // 같은 요청 키(세션·계좌·세대)는 dispatch 전에 동기 기록해 중복 네트워크 요청 자체를 막는다.
  useEffect(() => {
    if (readyAccountId === null || routeSeedPending) {
      lastRequestKeyRef.current = null;
      lastAccountIdRef.current = null;
      retryPendingRef.current = false;
      return;
    }
    const requestKey = `${sessionGeneration}#${readyAccountId}#${refreshGeneration}#${accountDataVersion}`;
    if (lastRequestKeyRef.current === requestKey) return;
    lastRequestKeyRef.current = requestKey;
    retryPendingRef.current = false;
    const queryKey = `account:${readyAccountId}`;
    if (lastAccountIdRef.current === readyAccountId) {
      dispatch(beginTransactionsRefresh());
    } else {
      dispatch(resetTransactions({ queryKey }));
    }
    lastAccountIdRef.current = readyAccountId;
    setLastRequestKind('first');
    dispatch(fetchTransactions({ accountId: readyAccountId, queryKey }));
  }, [
    dispatch,
    sessionGeneration,
    readyAccountId,
    routeSeedPending,
    refreshGeneration,
    accountDataVersion,
  ]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  // 새로고침: 계좌 목록을 먼저 확인한 뒤(직렬) 같은 계좌가 유효할 때만 첫 페이지 세대를 올린다.
  // 거래 요청은 위 effect가 최신 목록 기준으로 한 번만 보낸다.
  const handleRefresh = async () => {
    if (isRefreshingRef.current || accountsLoading || transactionsLoading) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    const startedAccountId = readyAccountId;
    try {
      const result = await dispatch(fetchAccounts());
      if (!fetchAccounts.fulfilled.match(result) || !mountedRef.current) return;
      if (startedAccountId === null) return; // 조회 가능 상태가 되면 effect가 첫 요청을 보낸다
      const fresh = store.getState().asset;
      const stillValid =
        fresh.selectedAccountId === startedAccountId &&
        fresh.accounts.some(account => account.id === startedAccountId);
      if (stillValid) setRefreshGeneration(generation => generation + 1);
    } finally {
      isRefreshingRef.current = false;
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  // 첫 페이지 다시 시도: 거래를 직접 요청하지 않고 세대만 올려 effect가 한 번만 요청하게 한다.
  const handleFirstPageRetry = () => {
    if (readyAccountId === null || retryPendingRef.current || transactionsLoading) return;
    retryPendingRef.current = true;
    setRefreshGeneration(generation => generation + 1);
  };

  // 다음 페이지(커서). 실패해도 transactionsNextCursor는 그대로라 같은 커서로 다시 요청한다.
  const requestNextPage = () => {
    if (readyAccountId === null || transactionsAccountId !== readyAccountId) return;
    if (!transactionsHasNext || transactionsLoading || transactionsLoadingMore) return;
    setLastRequestKind('more');
    dispatch(
      fetchTransactions({
        accountId: readyAccountId,
        cursor: transactionsNextCursor,
        queryKey: `account:${readyAccountId}`,
      })
    );
  };
  const handleEndReached = () => {
    if (transactionsError) return; // 오류 뒤에는 자동으로 다시 요청하지 않는다
    requestNextPage();
  };
  const handleNextPageRetry = requestNextPage;

  const handleAccountsRetry = () => {
    if (!accountsLoading) dispatch(fetchAccounts());
  };

  const handleTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleAccountDetailPress = () => navigation.navigate(ROUTES.ACCOUNT_DETAIL);

  // accountId/transactionId는 문자열 그대로 전달한다(Number 변환 금지).
  const handleTxPress = tx => {
    navigation.navigate(ROUTES.TRANSACTION_DETAIL, {
      accountId: readyAccountId,
      transactionId: tx.id,
    });
  };

  const handleApplyPeriod = (newPeriodType, startKey, endKey) => {
    setPeriodType(newPeriodType);
    setCustomStartKey(startKey);
    setCustomEndKey(endKey);
  };

  // 다른 계좌의 목록은 보여주지 않는다. 기간·유형 필터는 불러온 거래에만 적용한다(서버 재조회 없음).
  const visibleTransactions =
    readyAccountId !== null && transactionsAccountId === readyAccountId ? transactions : [];
  const viewModel = useMemo(
    () => buildHistoryViewModel({ transactions: visibleTransactions, filter, period: dateRange }),
    [visibleTransactions, filter, dateRange]
  );

  const hasLoaded = visibleTransactions.length > 0;
  const firstPageError = Boolean(transactionsError) && lastRequestKind === 'first';
  const nextPageError = Boolean(transactionsError) && lastRequestKind === 'more' && hasLoaded;
  const isInitialLoading =
    readyAccountId !== null &&
    !hasLoaded &&
    transactionsAccountId !== readyAccountId &&
    !transactionsError;
  const isNarrowedByFilter = filter !== '전체' || periodType !== '전체';
  const showLoadedNotice = hasLoaded && (isNarrowedByFilter || transactionsHasNext);

  const renderGroup = ({ item }) => (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{item.group}</Text>
      <View style={styles.groupList}>
        {item.items.map((t, i, arr) => (
          <View key={t.id}>
            <TransactionHistoryRow tx={t} onPress={() => handleTxPress(t)} />
            {i < arr.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );

  const listHeader = (
    <View>
      <Text style={styles.screenTitle}>거래내역</Text>
      <Text style={styles.headerSub}>최근 자산 흐름과 처리 상태를 확인해보세요.</Text>

      {readyAccount ? (
        <TransactionSummary
          label={readyAccount.label ?? '내 계좌'}
          statusLabel={getAccountStatusLabel(readyAccount)}
          statusNotice={getAccountStatusNotice(readyAccount)}
          balanceText={formatExactMoney(readyAccount.balance, readyAccount.balanceExact)}
        />
      ) : null}

      {accountsError && accounts.length > 0 ? (
        <Text style={styles.noticeText}>계좌 정보를 새로 불러오지 못했어요.</Text>
      ) : null}
      {firstPageError && hasLoaded ? (
        <View>
          <Text style={styles.noticeText}>거래내역을 새로 불러오지 못했어요.</Text>
          <InlineButton label="다시 시도" onPress={handleFirstPageRetry} />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TransactionFilterTab
            key={f}
            label={f}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setPeriodModalVisible(true)}
        style={({ pressed }) => [styles.periodRow, pressed && styles.periodRowPressed]}
      >
        <Text style={styles.periodLabel}>조회 기간</Text>
        <View style={styles.periodValueWrap}>
          <Text style={styles.periodValue}>
            {getPeriodLabel(periodType, customStartKey, customEndKey)}
          </Text>
          <Feather name="chevron-right" size={16} color={redesign.navInactive} />
        </View>
      </Pressable>

      {showLoadedNotice ? (
        <Text style={styles.loadedNotice}>불러온 거래 기준으로 표시돼요</Text>
      ) : null}
    </View>
  );

  const listEmpty = isInitialLoading ? (
    <TransactionLoadingSkeleton />
  ) : firstPageError && !hasLoaded ? (
    <StatusMessage
      title="거래내역을 불러오지 못했어요"
      message={transactionsError}
      actionLabel="다시 시도"
      onAction={handleFirstPageRetry}
    />
  ) : hasLoaded && viewModel.count === 0 ? (
    <View style={styles.emptyFilter}>
      <Text style={styles.emptyFilterText}>
        {transactionsHasNext
          ? '불러온 거래 중 선택한 조건에 맞는 거래가 없어요.'
          : '선택한 조건에 거래내역이 없어요.'}
      </Text>
      {transactionsHasNext ? (
        <InlineButton
          label="더 불러오기"
          onPress={requestNextPage}
          disabled={transactionsLoadingMore}
        />
      ) : null}
    </View>
  ) : !hasLoaded ? (
    <TransactionEmptyState onTransfer={handleTransferPress} />
  ) : null;

  // 계좌를 확정할 수 없을 때는 거래 요청 없이 상태만 보여준다.
  const renderAccountStatus = () => {
    if (routeAccountMissing) {
      return (
        <StatusMessage
          title="계좌를 찾을 수 없어요"
          message="조회하려는 계좌가 계좌 목록에 없어요."
          actionLabel="다시 시도"
          onAction={handleAccountsRetry}
          actionDisabled={accountsLoading}
        />
      );
    }
    if (target.kind === 'error') {
      return (
        <StatusMessage
          title="계좌를 불러오지 못했어요"
          message={target.message}
          actionLabel="다시 시도"
          onAction={handleAccountsRetry}
          actionDisabled={accountsLoading}
        />
      );
    }
    if (target.kind === 'empty') {
      return <StatusMessage title="연결된 계좌가 없어요" />;
    }
    if (target.kind === 'noSelection') {
      return (
        <StatusMessage
          title="조회할 계좌를 선택해 주세요"
          message="계좌 상세에서 조회할 계좌를 고를 수 있어요."
          actionLabel="계좌 상세로 이동"
          onAction={handleAccountDetailPress}
        />
      );
    }
    return <TransactionLoadingSkeleton />; // loading 또는 선택 계좌 맞추는 중
  };

  const showList = readyAccountId !== null;

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

          <Pressable
            onPress={handleRefresh}
            disabled={isRefreshing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => (pressed || isRefreshing) && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="새로고침"
          >
            <Feather name="refresh-cw" size={20} color={redesign.accent} />
          </Pressable>
        </View>

        {showList ? (
          <FlatList
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            data={viewModel.groups}
            keyExtractor={item => item.group}
            renderItem={renderGroup}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={
              <TransactionLoadMoreFooter
                isLoadingMore={transactionsLoadingMore}
                errorMessage={nextPageError ? transactionsError : null}
                onRetry={handleNextPageRetry}
              />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
          />
        ) : (
          <View style={styles.content}>
            <Text style={styles.screenTitle}>거래내역</Text>
            {renderAccountStatus()}
          </View>
        )}
      </View>

      <TransactionPeriodModal
        visible={periodModalVisible}
        periodType={periodType}
        customStartKey={customStartKey}
        customEndKey={customEndKey}
        onApply={handleApplyPeriod}
        onClose={() => setPeriodModalVisible(false)}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pressedDim: {
    opacity: 0.6,
  },
  screenTitle: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  headerSub: {
    marginTop: 8,
    fontSize: 13,
    color: redesign.textSecondary,
  },
  noticeText: {
    marginTop: 16,
    fontSize: 13,
    color: redesign.textSecondary,
  },
  loadedNotice: {
    marginTop: 12,
    fontSize: 12,
    color: redesign.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 16,
    paddingBottom: 32,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 28,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  periodRowPressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  periodLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  periodValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  periodValue: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  group: {
    marginTop: 28,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
    marginBottom: 4,
  },
  groupList: {
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  emptyFilter: {
    paddingTop: 48,
    alignItems: 'flex-start',
  },
  emptyFilterText: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: redesign.divider,
  },
});
