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
import { useSelector, useDispatch } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { ROUTES } from '../../constants/routes';
import {
  fetchAccounts,
  fetchTransactions,
  fetchAccountSummary,
} from '../../features/asset/assetApi';
import { resetTransactions, beginTransactionsRefresh } from '../../features/asset/assetSlice';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';
import { formatDateTime } from '../../utils/formatDate';
import TransactionPeriodModal, {
  computePeriodRange,
  getPeriodLabel,
} from './TransactionPeriodModal';
import TransactionStatusBadge from '../../components/asset/TransactionStatusBadge';

const FILTERS = ['전체', '입금', '출금', '송금'];

const getGroup = isoString => {
  if (!isoString) return '이전';
  const d = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return '이번 주';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const matchesFilter = (tx, f) => {
  switch (f) {
    case '전체':
      return true;
    case '입금':
      return tx.status === 'depositCompleted';
    case '출금':
      return tx.status === 'expenseCompleted';
    case '송금':
      return tx.status === 'completed' || tx.status === 'pending';
    default:
      return true;
  }
};

// ── 서브 컴포넌트 ─────────────────────────────────────────────

function TransactionSummary({ bank, token, current, available }) {
  return (
    <View style={summaryStyles.container}>
      <Text style={summaryStyles.bankName}>{bank}</Text>
      <Text style={summaryStyles.token}>{token}</Text>

      <Text style={summaryStyles.currentLabel}>현재 잔액</Text>
      <Text style={summaryStyles.currentBalance}>{current.toLocaleString()}원</Text>

      <View style={summaryStyles.availableRow}>
        <Text style={summaryStyles.availableLabel}>사용 가능 금액</Text>
        <Text style={summaryStyles.availableVal}>{available.toLocaleString()}원</Text>
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  bankName: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  token: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 2,
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
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  availableLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  availableVal: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textPrimary,
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

// 정상 완료 상태는 사용자에게 badge로 노출하지 않고 보조 정보에 거래 종류만 표시한다.
// 그 외 상태(pending/failed 등 향후 예외 상태)는 의미가 있으므로 기존 badge로 계속 보여준다.
const NORMAL_STATUS_KIND = {
  completed: '송금',
  depositCompleted: '입금',
  expenseCompleted: '출금',
};

function TransactionHistoryRow({ tx, onPress }) {
  const positive = tx.amount > 0;
  const kind = NORMAL_STATUS_KIND[tx.status];
  const isNormalStatus = kind !== undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [rowStyles.container, pressed && rowStyles.pressed]}
      accessibilityRole="button"
    >
      <View style={rowStyles.left}>
        <Text style={rowStyles.counterparty} numberOfLines={1}>
          {tx.counterparty}
        </Text>
        <Text style={rowStyles.meta} numberOfLines={1}>
          {kind ? `${kind} · ` : ''}
          {tx.time}
        </Text>
      </View>

      <View style={rowStyles.right}>
        <Text style={[rowStyles.amount, { color: positive ? colors.green : redesign.textPrimary }]}>
          {positive ? '+' : ''}
          {tx.amount.toLocaleString()}원
        </Text>
        {!isNormalStatus && <TransactionStatusBadge status={tx.status} />}
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

function TransactionEmptyState({ onTransfer }) {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.title}>아직 거래내역이 없어요.</Text>
      <Text style={emptyStyles.desc}>
        {'송금하거나 계좌를 연결하면\n자산 흐름이 여기에 표시돼요.'}
      </Text>

      <View style={emptyStyles.actions}>
        <Pressable
          onPress={onTransfer}
          style={({ pressed }) => [emptyStyles.primaryBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={emptyStyles.primaryBtnText}>송금하기</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            emptyStyles.secondaryBtn,
            pressed && emptyStyles.secondaryPressed,
          ]}
        >
          <Text style={emptyStyles.secondaryBtnText}>계좌 연결</Text>
          <Feather name="lock" size={12} color={redesign.navInactive} />
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
  secondaryBtn: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: redesign.textSecondary,
  },
});

function TransactionLoadMoreFooter({ isLoadingMore }) {
  return (
    <View>
      {isLoadingMore && (
        <View style={footerStyles.loaderRow}>
          <ActivityIndicator size="small" color={redesign.accent} />
        </View>
      )}
      <View style={footerStyles.spacer} />
    </View>
  );
}

const footerStyles = StyleSheet.create({
  loaderRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  spacer: {
    height: 40,
  },
});

function TransactionErrorState({ message }) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.text}>{message}</Text>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    paddingTop: 48,
  },
  text: {
    fontSize: 14,
    color: redesign.textSecondary,
    lineHeight: 21,
  },
});

// ── 메인 화면 ─────────────────────────────────────────────────

export default function TransactionHistoryScreen({ navigation }) {
  const dispatch = useDispatch();
  const transactions = useSelector(state => state.asset.transactions);
  const summary = useSelector(state => state.asset.summary);
  const transactionsLoading = useSelector(state => state.asset.transactionsLoading);
  const transactionsLoadingMore = useSelector(state => state.asset.transactionsLoadingMore);
  const transactionsHasMore = useSelector(state => state.asset.transactionsHasMore);
  const transactionsNextPage = useSelector(state => state.asset.transactionsNextPage);
  const transactionsError = useSelector(state => state.asset.transactionsError);
  const accounts = useSelector(state => state.asset.accounts);
  const defaultAccount = selectDefaultAccount(accounts);

  const [filter, setFilter] = useState('전체');
  const [periodType, setPeriodType] = useState('전체');
  const [customStartKey, setCustomStartKey] = useState(null);
  const [customEndKey, setCustomEndKey] = useState(null);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dateRange = useMemo(
    () => computePeriodRange(periodType, customStartKey, customEndKey),
    [periodType, customStartKey, customEndKey]
  );

  // dateRange는 매 렌더마다 새 객체이므로 effect deps로 쓰면 안 된다.
  // 대신 startKey/endKey로 만든 primitive 문자열을 식별자 겸 effect dep으로 쓴다.
  const transactionQueryKey = useMemo(
    () => `${dateRange.startKey ?? 'all'}:${dateRange.endKey ?? 'all'}`,
    [dateRange.startKey, dateRange.endKey]
  );

  // "어떤 쿼리의 몇 번째 페이지 요청인지"를 식별하는 토큰을 저장한다.
  // 기간이 바뀐 뒤 뒤늦게 끝나는 이전 기간 loadMore의 .finally()가 새 기간의
  // guard를 잘못 풀어버리지 않도록, 저장 당시 토큰과 현재 값이 같을 때만 해제한다.
  const loadMoreTokenRef = useRef(null);

  useEffect(() => {
    dispatch(fetchAccounts());
    dispatch(fetchAccountSummary());
  }, [dispatch]);

  useEffect(() => {
    loadMoreTokenRef.current = null; // 이전 기간의 in-flight loadMore guard를 강제 해제
    dispatch(resetTransactions({ queryKey: transactionQueryKey }));
    dispatch(fetchTransactions({ page: 0, dateRange, queryKey: transactionQueryKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionQueryKey, dispatch]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    // beginTransactionsRefresh()로 seq만 새로 시작 — 새로고침 직전까지 진행 중이던
    // loadMore가 있었다면 다른 seq를 갖게 되어 나중에 응답이 와도 stale로 무시된다.
    dispatch(beginTransactionsRefresh());
    loadMoreTokenRef.current = null;
    try {
      await Promise.all([
        dispatch(fetchAccounts()),
        dispatch(fetchTransactions({ page: 0, dateRange, queryKey: transactionQueryKey })),
        dispatch(fetchAccountSummary()),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLoadMore = () => {
    if (transactionsLoading || transactionsLoadingMore || !transactionsHasMore) return;
    if (loadMoreTokenRef.current) return; // 이미 in-flight 요청 있음
    const token = `${transactionQueryKey}:${transactionsNextPage}`;
    loadMoreTokenRef.current = token;
    dispatch(
      fetchTransactions({ page: transactionsNextPage, dateRange, queryKey: transactionQueryKey })
    ).finally(() => {
      if (loadMoreTokenRef.current === token) {
        loadMoreTokenRef.current = null;
      }
    });
  };

  const handleTransferPress = () => navigation.navigate(ROUTES.TRANSFER);

  const handleTxPress = tx => {
    navigation.navigate(ROUTES.TRANSACTION_DETAIL, {
      transactionId: tx.id,
      status: tx.status,
    });
  };

  const handleApplyPeriod = (newPeriodType, startKey, endKey) => {
    setPeriodType(newPeriodType);
    setCustomStartKey(startKey);
    setCustomEndKey(endKey);
  };

  const mappedTxList = transactions.map(tx => ({
    ...tx,
    status: mapTransactionStatus(tx.status),
    time: tx.requestedAt ? formatDateTime(tx.requestedAt) : '-',
    group: getGroup(tx.requestedAt),
  }));

  const filtered = mappedTxList.filter(t => matchesFilter(t, filter));
  const groups = [...new Set(filtered.map(t => t.group))];
  const listData = groups.map(g => ({
    group: g,
    items: filtered.filter(t => t.group === g),
  }));

  const isInitialLoading = transactionsLoading && transactions.length === 0;
  const isFilteredEmpty = !isInitialLoading && filtered.length === 0 && !transactionsError;
  const isNarrowedByFilter = filter !== '전체' || periodType !== '전체';

  const renderGroup = ({ item }) => (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{item.group}</Text>
      <View style={styles.groupList}>
        {item.items.map((t, i, arr) => (
          <View key={t.id}>
            <TransactionHistoryRow
              tx={t}
              onPress={
                t.status === 'checking' || t.status === 'pending'
                  ? undefined
                  : () => handleTxPress(t)
              }
            />
            {i < arr.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>
    </View>
  );

  const listHeader = (
    <View>
      {/* 잔액 요약 */}
      <TransactionSummary
        bank={defaultAccount?.bankName ?? '-'}
        token={defaultAccount?.tokenId ?? '-'}
        current={summary?.currentBalance ?? 0}
        available={summary?.availableBalance ?? 0}
      />

      {/* 필터 */}
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

      {/* 기간 선택 */}
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
    </View>
  );

  const listEmpty = isInitialLoading ? (
    <TransactionLoadingSkeleton />
  ) : transactionsError ? (
    <TransactionErrorState message={transactionsError} />
  ) : isFilteredEmpty ? (
    isNarrowedByFilter ? (
      <View style={styles.emptyFilter}>
        <Text style={styles.emptyFilterText}>선택한 조건에 거래내역이 없어요.</Text>
      </View>
    ) : (
      <TransactionEmptyState onTransfer={handleTransferPress} />
    )
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        {/* 헤더 */}
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="새로고침"
          >
            <Feather name="refresh-cw" size={20} color={redesign.accent} />
          </Pressable>
        </View>

        <FlatList
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          data={listData}
          keyExtractor={item => item.group}
          renderItem={renderGroup}
          ListHeaderComponent={
            <View>
              <Text style={styles.screenTitle}>거래내역</Text>
              <Text style={styles.headerSub}>최근 자산 흐름과 처리 상태를 확인해보세요.</Text>
              {listHeader}
            </View>
          }
          ListEmptyComponent={listEmpty}
          ListFooterComponent={
            <TransactionLoadMoreFooter isLoadingMore={transactionsLoadingMore} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
        />
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
