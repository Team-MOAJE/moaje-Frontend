import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import TransactionListItem from './TransactionListItem';
import AccountSelectorBottomSheet from './AccountSelectorBottomSheet';

// titleText(계좌 라벨, 서버 은행명 기반)/accountNumberText(API-11 실제 계좌번호의 표시용 포맷)/balanceText/statusNotice/sync는
// 부모(AccountDetailScreen)가 assetScreenLogic으로 만든 표시용 값이다. 복사할 값은 부모가 결정하며(onCopyAccountNumber),
// 이 컴포넌트는 표시 문자열을 복사하지 않는다. detailError가 있으면 번호·잔액을 대신 만들지 않고 오류와 재시도만 보여준다.
const SYNC_TONE_COLOR = {
  error: colors.red,
  progress: redesign.textSecondary,
  notice: redesign.textSecondary,
};

export default function AccountDetailView({
  titleText,
  balanceText,
  statusNotice,
  sync,
  accountNumberText,
  canCopyAccountNumber,
  onCopyAccountNumber,
  copyNotice,
  detailError,
  onRetryDetail,
  canTransfer,
  isRecentTransactionsSupported,
  isRecentLoading,
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="arrow-left" size={22} color={redesign.textPrimary} />
          </Pressable>
          <Pressable
            onPress={onRefresh}
            disabled={isRefreshing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="새로고침"
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={redesign.accent} />
            ) : (
              <Feather name="refresh-cw" size={20} color={redesign.accent} />
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
              accessibilityRole="button"
              accessibilityLabel="계좌 선택"
            >
              <View style={styles.titleRow}>
                <Text style={styles.accountTitle}>{titleText}</Text>
                <Feather name="chevron-down" size={20} color={redesign.navInactive} />
              </View>
            </Pressable>

            {detailError ? (
              <View style={styles.detailErrorBox}>
                <View style={styles.refreshErrorRowFlat}>
                  <Feather name="alert-circle" size={13} color={colors.red} />
                  <Text style={styles.refreshErrorText}>{detailError}</Text>
                </View>
                <Pressable
                  onPress={onRetryDetail}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => pressed && styles.pressedDim}
                  accessibilityRole="button"
                  accessibilityLabel="계좌 정보 다시 시도"
                >
                  <Text style={styles.detailRetryText}>다시 시도</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.numberRow}>
                <Text style={styles.numberLabel}>계좌번호</Text>
                <Text style={styles.numberText} selectable={false}>
                  {accountNumberText ?? '-'}
                </Text>
                <Pressable
                  onPress={onCopyAccountNumber}
                  disabled={!canCopyAccountNumber}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    styles.copyBtn,
                    !canCopyAccountNumber && styles.btnDisabled,
                    pressed && canCopyAccountNumber && styles.btnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canCopyAccountNumber }}
                  accessibilityLabel="계좌번호 복사"
                >
                  <Text style={styles.copyBtnText}>복사</Text>
                </Pressable>
              </View>
            )}

            {copyNotice ? (
              <Text style={[styles.copyNotice, copyNotice.isError && styles.copyNoticeError]}>
                {copyNotice.message}
              </Text>
            ) : null}

            {statusNotice ? <Text style={styles.statusNotice}>{statusNotice}</Text> : null}

            {sync ? (
              <View style={styles.refreshErrorRow}>
                <Feather name="info" size={13} color={SYNC_TONE_COLOR[sync.tone]} />
                <Text style={[styles.refreshErrorText, { color: SYNC_TONE_COLOR[sync.tone] }]}>
                  {sync.message ? `${sync.label} · ${sync.message}` : sync.label}
                </Text>
              </View>
            ) : null}

            {refreshError ? (
              <View style={styles.refreshErrorRow}>
                <Feather name="alert-circle" size={13} color={colors.red} />
                <Text style={styles.refreshErrorText}>{refreshError}</Text>
              </View>
            ) : null}

            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>현재 잔액</Text>
              <Text
                style={styles.balanceAmount}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                numberOfLines={1}
              >
                {balanceText}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={onTransferPress}
                disabled={!canTransfer}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.transferBtn,
                  !canTransfer && styles.btnDisabled,
                  pressed && canTransfer && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canTransfer }}
                accessibilityLabel="송금하기"
              >
                <Text style={styles.transferBtnText}>송금하기</Text>
              </Pressable>
              <Pressable
                onPress={onHistoryPress}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.historyBtn,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="거래내역"
              >
                <Text style={styles.historyBtnText}>거래내역</Text>
              </Pressable>
            </View>
            {!canTransfer && selectedAccountId != null ? (
              <Text style={styles.transferDisabledNote}>조회만 가능한 계좌예요.</Text>
            ) : null}

            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>최근 거래</Text>
            </View>

            <View style={styles.recentList}>
              {!isRecentTransactionsSupported ? (
                <View style={styles.recentUnsupported}>
                  <Text style={styles.recentUnsupportedText}>
                    최근 거래 내역은 아직 제공되지 않아요.
                  </Text>
                  <Text style={styles.recentUnsupportedSubText}>
                    거래내역 화면에서 전체 내역을 확인해보세요.
                  </Text>
                  <Pressable
                    onPress={onHistoryPress}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.recentUnsupportedLink}>거래내역 보기</Text>
                  </Pressable>
                </View>
              ) : isRecentLoading ? (
                <Text style={styles.recentEmptyText}>최근 거래를 불러오는 중이에요.</Text>
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
      <View style={[styles.skeletonBar, { width: 180, height: 28, marginTop: 12 }]} />
      <View style={[styles.skeletonBar, { width: 120, height: 12, marginTop: 12 }]} />
      <View style={[styles.skeletonBar, { width: 200, height: 34, marginTop: 40 }]} />
      <View style={[styles.skeletonBar, { height: 56, borderRadius: 12, marginTop: 32 }]} />
      <View style={[styles.skeletonBar, { height: 120, marginTop: 40 }]} />
    </View>
  );
}

function AccountDetailErrorState({ message, onRetry }) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>계좌 정보를 불러오지 못했어요.</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.stateRetryBtn, pressed && styles.btnPressed]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.stateRetryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function AccountDetailEmptyState() {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>아직 연결된 계좌가 없어요.</Text>
    </View>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 16,
    paddingBottom: 48,
  },
  identitySection: {
    gap: 4,
    alignSelf: 'flex-start',
  },
  identitySectionPressed: {
    opacity: 0.7,
  },
  accountTitle: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusNotice: {
    marginTop: 12,
    fontSize: 13,
    color: redesign.textSecondary,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  numberLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  numberText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: redesign.textPrimary,
  },
  copyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: redesign.accent,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: redesign.accent,
  },
  copyNotice: {
    marginTop: 8,
    fontSize: 12,
    color: redesign.accent,
  },
  copyNoticeError: {
    color: colors.red,
  },
  detailErrorBox: {
    marginTop: 12,
    gap: 8,
  },
  refreshErrorRowFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailRetryText: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.accent,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  transferDisabledNote: {
    marginTop: 8,
    fontSize: 12,
    color: redesign.textSecondary,
  },
  refreshErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  refreshErrorText: {
    fontSize: 12,
    color: colors.red,
    flex: 1,
  },
  balanceSection: {
    marginTop: 36,
  },
  balanceLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  balanceAmount: {
    marginTop: 4,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  actionBtn: {
    flex: 1,
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBtn: {
    backgroundColor: redesign.accent,
  },
  btnPressed: {
    opacity: 0.85,
  },
  transferBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  historyBtn: {
    backgroundColor: redesign.accent,
  },
  historyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 4,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  recentList: {
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  recentDivider: {
    height: 1,
    backgroundColor: redesign.divider,
  },
  recentEmptyText: {
    fontSize: 14,
    color: redesign.textSecondary,
    paddingVertical: 24,
  },
  recentUnsupported: {
    gap: 4,
    paddingVertical: 24,
  },
  recentUnsupportedText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  recentUnsupportedSubText: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  recentUnsupportedLink: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.accent,
    marginTop: 8,
  },
  stateContainer: {
    flex: 1,
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 32,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  stateMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
    marginTop: 8,
  },
  stateRetryBtn: {
    marginTop: 24,
    alignSelf: 'flex-start',
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateRetryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  skeletonBar: {
    backgroundColor: redesign.divider,
    borderRadius: 4,
  },
});
