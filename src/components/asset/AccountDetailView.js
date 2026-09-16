import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';
import TransactionListItem from './TransactionListItem';
import AccountSelectorBottomSheet from './AccountSelectorBottomSheet';

export default function AccountDetailView({
  bankName,
  accountLabel,
  maskedAccountNumber,
  currentBalance,
  isAvailableBalanceSupported,
  availableBalance,
  isRecentTransactionsSupported,
  recentTransactions,
  renderRecentTransaction,
  accounts,
  selectedAccountId,
  onSelectAccount,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  refreshError,
  isRefreshing,
  onRefresh,
  onBack,
  onTransferPress,
  onHistoryPress,
  onViewAllTransactionsPress,
  onTransactionPress,
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const hasAccounts = (accounts?.length ?? 0) > 0;

  const renderItem =
    renderRecentTransaction ??
    (tx => (
      <TransactionListItem
        key={tx.id}
        tx={tx}
        onPress={onTransactionPress ? () => onTransactionPress(tx) : undefined}
      />
    ));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>내 계좌</Text>
          <Pressable
            onPress={onRefresh}
            disabled={isRefreshing}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.textDark} />
            ) : (
              <Feather name="refresh-cw" size={18} color={colors.textDark} />
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <AccountDetailSkeleton />
        ) : isError ? (
          <AccountDetailErrorState message={errorMessage} onRetry={onRetry} />
        ) : !hasAccounts ? (
          <AccountDetailEmptyState />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={() => setSheetVisible(true)}
              style={({ pressed }) => [
                styles.identitySection,
                pressed && styles.identitySectionPressed,
              ]}
            >
              <Text style={styles.bankName}>{bankName ?? '-'}</Text>
              <Text style={styles.accountLabel}>{accountLabel ?? bankName ?? '-'}</Text>
              {maskedAccountNumber ? (
                <View style={styles.maskedRow}>
                  <Text style={styles.maskedNumber}>{maskedAccountNumber}</Text>
                  <Feather name="chevron-down" size={16} color={colors.textLight} />
                </View>
              ) : null}
            </Pressable>

            {refreshError ? (
              <View style={styles.refreshErrorBanner}>
                <Feather name="alert-circle" size={12} color={colors.red} />
                <Text style={styles.refreshErrorText}>{refreshError}</Text>
              </View>
            ) : null}

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>현재 잔액</Text>
              <Text style={styles.balanceAmount}>{formatKRW(currentBalance)}</Text>

              <View style={styles.availableRow}>
                <Text style={styles.availableLabel}>사용 가능 금액</Text>
                {isAvailableBalanceSupported ? (
                  <Text style={styles.availableValue}>{formatKRW(availableBalance)}</Text>
                ) : (
                  <Text style={styles.availableUnsupported}>제공되지 않아요</Text>
                )}
              </View>

              <Text style={styles.balanceNotice}>
                {isAvailableBalanceSupported
                  ? '처리 중인 거래가 있으면 사용 가능 금액이 달라질 수 있어요.'
                  : '사용 가능 금액은 아직 제공되지 않는 정보예요.'}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.transferBtn]}
                onPress={onTransferPress}
                activeOpacity={0.85}
              >
                <Feather name="send" size={16} color={colors.white} />
                <Text style={styles.transferBtnText}>송금하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.historyBtn]}
                onPress={onHistoryPress}
                activeOpacity={0.75}
              >
                <Feather name="file-text" size={16} color={colors.textDark} />
                <Text style={styles.historyBtnText}>거래내역</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>최근 거래</Text>
              <TouchableOpacity onPress={onViewAllTransactionsPress} hitSlop={8}>
                <Text style={styles.recentViewAll}>전체보기 〉</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.recentCard}>
              {!isRecentTransactionsSupported ? (
                <View style={styles.recentUnsupported}>
                  <Text style={styles.recentUnsupportedText}>
                    최근 거래 내역은 아직 제공되지 않아요.
                  </Text>
                  <Text style={styles.recentUnsupportedSubText}>
                    거래내역 화면에서 전체 내역을 확인해보세요.
                  </Text>
                  <TouchableOpacity onPress={onHistoryPress}>
                    <Text style={styles.recentUnsupportedLink}>거래내역 보기</Text>
                  </TouchableOpacity>
                </View>
              ) : (recentTransactions?.length ?? 0) === 0 ? (
                <Text style={styles.recentEmptyText}>최근 거래 내역이 없어요.</Text>
              ) : (
                recentTransactions.slice(0, 3).map((tx, index) => (
                  <View key={tx.id ?? index}>
                    {renderItem(tx)}
                    {index < Math.min(recentTransactions.length, 3) - 1 ? (
                      <View style={styles.recentDivider} />
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        <AccountSelectorBottomSheet
          visible={sheetVisible}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={id => {
            onSelectAccount(id);
            setSheetVisible(false);
          }}
          onClose={() => setSheetVisible(false)}
        />
      </View>
    </SafeAreaView>
  );
}

function AccountDetailSkeleton() {
  return (
    <View style={styles.stateContainer}>
      <View style={[styles.skeletonBar, { width: 80, height: 12 }]} />
      <View style={[styles.skeletonBar, { width: 140, height: 18, marginTop: spacing.sm }]} />
      <View style={[styles.skeletonBar, { width: 120, height: 12, marginTop: spacing.sm }]} />
      <View style={[styles.skeletonBlock, { marginTop: spacing.xl }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonBar, { flex: 1, height: 48, borderRadius: radius.lg }]} />
        <View style={[styles.skeletonBar, { flex: 1, height: 48, borderRadius: radius.lg }]} />
      </View>
      <View style={[styles.skeletonBlock, { marginTop: spacing.xl, height: 160 }]} />
    </View>
  );
}

function AccountDetailErrorState({ message, onRetry }) {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.stateCard}>
        <Feather name="alert-triangle" size={28} color={colors.red} />
        <Text style={styles.stateTitle}>계좌 정보를 불러오지 못했어요.</Text>
        {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
        <TouchableOpacity style={styles.stateRetryBtn} onPress={onRetry}>
          <Text style={styles.stateRetryText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AccountDetailEmptyState() {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.stateCard}>
        <Feather name="credit-card" size={28} color={colors.textLight} />
        <Text style={styles.stateTitle}>아직 연결된 계좌가 없어요.</Text>
      </View>
    </View>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  headerBtnPressed: {
    backgroundColor: colors.bgOuter,
    opacity: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  identitySection: {
    gap: 2,
    alignSelf: 'flex-start',
  },
  identitySectionPressed: {
    opacity: 0.7,
  },
  bankName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
  },
  accountLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textDark,
  },
  maskedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  maskedNumber: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textLight,
    fontFamily: 'monospace',
  },
  refreshErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(229,72,77,0.08)',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  refreshErrorText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.red,
    flex: 1,
  },
  balanceCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.xs,
    ...shadows.md,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMid,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textDark,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  availableLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMid,
  },
  availableValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  availableUnsupported: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textLight,
  },
  balanceNotice: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  transferBtn: {
    backgroundColor: colors.oliveDark,
  },
  transferBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  historyBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDark,
  },
  recentViewAll: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
  },
  recentCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  recentDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  recentEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  recentUnsupported: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  recentUnsupportedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMid,
    textAlign: 'center',
  },
  recentUnsupportedSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
  },
  recentUnsupportedLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.oliveDark,
    marginTop: spacing.xs,
  },
  stateContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  stateCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
  },
  stateRetryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.oliveDark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  stateRetryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  skeletonBar: {
    backgroundColor: colors.bgOuter,
    borderRadius: radius.xs,
  },
  skeletonBlock: {
    backgroundColor: colors.bgOuter,
    borderRadius: radius.xl,
    height: 120,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
