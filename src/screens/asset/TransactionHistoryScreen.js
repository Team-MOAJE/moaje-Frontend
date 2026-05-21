import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { colors, radius, shadows, spacing } from '../../theme';
import { ROUTES } from '../../constants/routes';
import {
  fetchAccounts,
  fetchTransactions,
  fetchAccountSummary,
} from '../../features/asset/assetApi';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';
import { formatDateTime } from '../../utils/formatDate';

const FILTERS = ['전체', '입금', '출금', '송금', '확인 중', '실패/취소'];

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
    case '확인 중':
      return tx.status === 'checking';
    case '실패/취소':
      return tx.status === 'failed' || tx.status === 'reversed';
    default:
      return true;
  }
};

// ── 아이콘 매핑 (Feather) ─────────────────────────────────────
const ICON_MAP = {
  pending: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  checking: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  completed: { name: 'send', bg: '#F3F6EA', fg: colors.olive },
  failed: { name: 'alert-triangle', bg: 'rgba(229,72,77,0.1)', fg: colors.red },
  reversed: { name: 'rotate-ccw', bg: '#E8EBD8', fg: colors.olive },
  depositCompleted: { name: 'arrow-down-left', bg: 'rgba(184,216,107,0.3)', fg: colors.textDark },
  expenseCompleted: { name: 'file-text', bg: '#F3F6EA', fg: colors.olive },
};

// ── 상태 뱃지 설정 ─────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { label: '처리 중', bg: '#F3F6EA', fg: colors.olive, icon: 'loader' },
  checking: { label: '확인 중', bg: '#FFF8E6', fg: colors.orange, icon: 'clock' },
  completed: { label: '송금 완료', bg: 'rgba(47,158,68,0.1)', fg: colors.green, icon: 'check' },
  failed: {
    label: '송금 실패',
    bg: 'rgba(229,72,77,0.1)',
    fg: colors.red,
    icon: 'alert-triangle',
  },
  reversed: { label: '취소 완료', bg: '#E8EBD8', fg: colors.olive, icon: 'rotate-ccw' },
  depositCompleted: {
    label: '입금 완료',
    bg: 'rgba(184,216,107,0.3)',
    fg: colors.textDark,
    icon: 'arrow-down-left',
  },
  expenseCompleted: { label: '지출 완료', bg: '#F3F6EA', fg: colors.textDark, icon: 'file-text' },
};

// ── 서브 컴포넌트 ─────────────────────────────────────────────

function TransactionSummaryCard({ bank, token, current, available, held }) {
  return (
    <View style={[summaryStyles.container, shadows.md]}>
      <View style={summaryStyles.accountRow}>
        <LinearGradient
          colors={[colors.oliveLight, colors.olive]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={summaryStyles.iconBox}
        >
          <MaterialCommunityIcons name="wallet" size={20} color={colors.white} />
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <Text style={summaryStyles.bankName}>{bank}</Text>
          <Text style={summaryStyles.token}>{token}</Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={summaryStyles.currentLabel}>현재 잔액</Text>
          <Text style={summaryStyles.currentBalance}>{current.toLocaleString()}원</Text>
        </View>
      </View>

      <View style={summaryStyles.grid}>
        <View style={summaryStyles.availableBox}>
          <Text style={summaryStyles.gridLabel}>사용 가능 금액</Text>
          <Text style={summaryStyles.gridVal}>{available.toLocaleString()}원</Text>
        </View>
        <View style={summaryStyles.heldBox}>
          <Text style={summaryStyles.heldLabel}>확인 중인 송금</Text>
          <Text style={summaryStyles.gridVal}>{held.toLocaleString()}원</Text>
        </View>
      </View>

      <Text style={summaryStyles.notice}>
        확인 중인 거래 금액은 사용 가능 금액에서 잠시 제외돼요.
      </Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankName: {
    fontSize: 14,
    color: colors.textDark,
  },
  token: {
    fontSize: 11,
    color: colors.textMid,
    marginTop: 1,
  },
  currentLabel: {
    fontSize: 10,
    color: colors.textMid,
  },
  currentBalance: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  availableBox: {
    flex: 1,
    backgroundColor: colors.bgMain,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heldBox: {
    flex: 1,
    backgroundColor: colors.bgWarn,
    borderWidth: 1,
    borderColor: colors.borderWarn,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  gridLabel: {
    fontSize: 10,
    color: colors.textMid,
  },
  heldLabel: {
    fontSize: 10,
    color: colors.orange,
  },
  gridVal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 2,
  },
  notice: {
    fontSize: 11,
    color: 'rgba(111,127,63,0.8)',
  },
});

function CachedDataBanner() {
  return (
    <View style={cachedStyles.container}>
      <View style={cachedStyles.badge}>
        <Text style={cachedStyles.badgeText}>캐시 데이터</Text>
      </View>
      <Text style={cachedStyles.text}>금융망 점검으로 최근 저장된 거래내역을 보여주고 있어요.</Text>
    </View>
  );
}

const cachedStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.bgWarn,
    borderWidth: 1,
    borderColor: colors.borderWarn,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badge: {
    backgroundColor: colors.orange,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  text: {
    flex: 1,
    fontSize: 11,
    color: colors.orange,
    lineHeight: 16,
  },
});

function TransactionFilterChip({ label, active, onPress }) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={[colors.olive, colors.oliveDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={chipStyles.base}
        >
          <Text style={[chipStyles.text, { color: colors.cream }]}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[chipStyles.base, chipStyles.inactive]}
    >
      <Text style={[chipStyles.text, { color: colors.textDark }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  inactive: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});

function TransactionStatusBadge({ status }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <View style={[badgeStyles.container, { backgroundColor: c.bg }]}>
      <Feather name={c.icon} size={10} color={c.fg} />
      <Text style={[badgeStyles.text, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 10,
    fontWeight: '500',
  },
});

function TransactionListItem({ tx, onPress }) {
  const iconCfg = ICON_MAP[tx.status] ?? ICON_MAP.pending;
  const positive = tx.amount > 0;
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { onPress, activeOpacity: 0.75 } : {};

  return (
    <Container {...containerProps} style={listStyles.container}>
      <View style={[listStyles.iconBox, { backgroundColor: iconCfg.bg }]}>
        <Feather name={iconCfg.name} size={20} color={iconCfg.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={listStyles.counterparty} numberOfLines={1}>
          {tx.counterparty}
        </Text>
        <Text style={listStyles.meta} numberOfLines={1}>
          {tx.time} · {tx.description}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[listStyles.amount, { color: positive ? colors.green : colors.textDark }]}>
          {positive ? '+' : ''}
          {tx.amount.toLocaleString()}원
        </Text>
        <TransactionStatusBadge status={tx.status} />
      </View>
    </Container>
  );
}

const listStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  counterparty: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textDark,
  },
  meta: {
    fontSize: 11,
    color: 'rgba(111,127,63,0.8)',
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
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
      <View style={skeletonStyles.iconBox} />
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
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    flexShrink: 0,
  },
  bar: {
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});

function TransactionEmptyState({ onTransfer }) {
  return (
    <View style={emptyStyles.container}>
      <LinearGradient
        colors={[colors.oliveLight, colors.olive]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={emptyStyles.iconWrap}
      >
        <Text style={emptyStyles.iconEmoji}>🌱</Text>
      </LinearGradient>

      <Text style={emptyStyles.title}>아직 거래내역이 없어요.</Text>
      <Text style={emptyStyles.desc}>
        {'송금하거나 계좌를 연결하면\n자산 흐름이 여기에 표시돼요.'}
      </Text>

      <View style={emptyStyles.actions}>
        <Pressable
          onPress={onTransfer}
          style={({ pressed }) => [emptyStyles.primaryBtn, pressed && { opacity: 0.75 }]}
        >
          <LinearGradient
            colors={[colors.olive, colors.oliveDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={emptyStyles.primaryBtnInner}
          >
            <Text style={emptyStyles.primaryBtnText}>송금하기</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            emptyStyles.secondaryBtn,
            pressed && { backgroundColor: colors.bgOuter },
          ]}
        >
          <Text style={emptyStyles.secondaryBtnText}>계좌 연결</Text>
          <View style={emptyStyles.comingSoonBadge}>
            <Feather name="lock" size={8} color={colors.textLight} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 28,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 12,
    textAlign: 'center',
  },
  desc: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.8)',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  primaryBtn: {
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  primaryBtnInner: {
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryBtn: {
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMid,
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.bgOuter,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── 메인 화면 ─────────────────────────────────────────────────

export default function TransactionHistoryScreen({ navigation }) {
  const dispatch = useDispatch();
  const transactions = useSelector(state => state.asset.transactions);
  const summary = useSelector(state => state.asset.summary);
  const transactionsLoading = useSelector(state => state.asset.transactionsLoading);
  const transactionsRefreshing = useSelector(state => state.asset.transactionsRefreshing);
  const accounts = useSelector(state => state.asset.accounts);
  const defaultAccount = selectDefaultAccount(accounts);

  const [filter, setFilter] = useState('전체');

  useEffect(() => {
    dispatch(fetchAccounts());
    dispatch(fetchTransactions());
    dispatch(fetchAccountSummary());
  }, [dispatch]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleRefresh = async () => {
    if (transactionsRefreshing || transactionsLoading) return;
    await dispatch(fetchAccounts());
    await dispatch(fetchTransactions());
    await dispatch(fetchAccountSummary());
  };

  const handleTransferPress = () => navigation.navigate(ROUTES.TRANSFER);

  const handleTxPress = tx => {
    navigation.navigate(ROUTES.TRANSACTION_DETAIL, {
      transactionId: tx.id,
      status: tx.status,
    });
  };

  const mappedTxList = transactions.map(tx => ({
    ...tx,
    status: mapTransactionStatus(tx.status),
    time: tx.requestedAt ? formatDateTime(tx.requestedAt) : '-',
    group: getGroup(tx.requestedAt),
  }));

  const filtered = mappedTxList.filter(t => matchesFilter(t, filter));
  const groups = [...new Set(filtered.map(t => t.group))];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </Pressable>

          <Text style={styles.headerTitle}>거래내역</Text>

          <Pressable
            onPress={handleRefresh}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="refresh-cw" size={18} color={colors.textDark} />
          </Pressable>
        </View>

        <Text style={styles.headerSub}>최근 자산 흐름과 처리 상태를 확인해보세요.</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 잔액 요약 카드 */}
          <TransactionSummaryCard
            bank={defaultAccount?.bankName ?? '-'}
            token={defaultAccount?.tokenId ?? '-'}
            current={summary?.currentBalance ?? 0}
            available={summary?.availableBalance ?? 0}
            held={summary?.heldAmount ?? 0}
          />

          {/* 필터 칩 가로 스크롤 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map(f => (
              <TransactionFilterChip
                key={f}
                label={f}
                active={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
          </ScrollView>

          {/* 로딩 / 빈 상태 / 거래 목록 */}
          {transactionsLoading ? (
            <TransactionLoadingSkeleton />
          ) : filtered.length === 0 ? (
            filter !== '전체' ? (
              <View style={styles.emptyFilter}>
                <Text style={styles.emptyFilterText}>해당 조건의 거래내역이 없어요.</Text>
              </View>
            ) : (
              <TransactionEmptyState onTransfer={handleTransferPress} />
            )
          ) : (
            <View style={{ gap: 12 }}>
              {groups.map(g => (
                <View key={g} style={[styles.groupCard, shadows.sm]}>
                  <Text style={styles.groupLabel}>{g}</Text>
                  <View>
                    {filtered
                      .filter(t => t.group === g)
                      .map((t, i, arr) => (
                        <View key={t.id}>
                          <TransactionListItem
                            tx={t}
                            onPress={
                              t.status === 'checking' || t.status === 'pending'
                                ? null
                                : () => handleTxPress(t)
                            }
                          />
                          {i < arr.length - 1 && <View style={styles.divider} />}
                        </View>
                      ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
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
    backgroundColor: colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
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
  headerBtnPressed: {
    backgroundColor: colors.bgOuter,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.8)',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: 12,
    paddingBottom: 32,
  },
  filterRow: {
    gap: 8,
    paddingRight: 4,
  },
  groupCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMid,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 4,
  },
  emptyFilter: {
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
  },
  emptyFilterText: {
    fontSize: 14,
    color: colors.textMid,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
});
