import React from 'react';
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// transactions는 서버 순서(최신순)라 같은 group이 연속된다. group이 없는 거래는 라벨 없이 묶는다.
function groupByLabel(transactions) {
  const groups = [];
  transactions.forEach(tx => {
    const label = tx.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(tx);
    } else {
      groups.push({ label, items: [tx] });
    }
  });
  return groups;
}

// 홈 거래내역 탭. 데이터는 선택 계좌 한 곳의 서버 거래뿐이다(homeTabLogic.buildHomeTransactionItems 결과).
// state: 'none' | 'loading' | 'error' | 'empty' | 'list'
// transactions: { id, counterparty, group?, time?, amountText, tone } (group/time은 서버 날짜를 읽을 수 있을 때만 있다)
export default function HomeTransactionTab({
  state = 'list',
  transactions,
  accountLabel,
  errorMessage,
  onRetry,
  onTransactionPress,
  onViewAllPress,
}) {
  const groups = groupByLabel(transactions ?? []);

  return (
    <View>
      <Text style={styles.title}>최근 거래내역</Text>
      {accountLabel ? <Text style={styles.accountLabel}>{accountLabel}</Text> : null}

      {state === 'loading' ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={redesign.accent} />
          <Text style={styles.stateText}>거래내역을 불러오는 중이에요</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>거래내역을 불러오지 못했어요</Text>
          {errorMessage ? <Text style={styles.stateText}>{errorMessage}</Text> : null}
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'none' ? <Text style={styles.empty}>연결된 계좌가 없어요.</Text> : null}
      {state === 'empty' ? <Text style={styles.empty}>최근 거래내역이 없어요.</Text> : null}

      {state === 'list'
        ? groups.map((group, groupIndex) => (
            <View key={`${group.label ?? 'none'}-${groupIndex}`}>
              {group.label ? <Text style={styles.groupLabel}>{group.label}</Text> : null}
              {group.items.map(tx => (
                <Pressable
                  key={tx.id}
                  onPress={() => onTransactionPress(tx)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tx.counterparty} 거래 상세`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowInfo}>
                    <Text style={styles.counterparty} numberOfLines={1}>
                      {tx.counterparty}
                    </Text>
                    {tx.time ? <Text style={styles.time}>{tx.time}</Text> : null}
                  </View>
                  <Text style={[styles.amount, tx.tone === 'positive' && styles.amountDeposit]}>
                    {tx.amountText}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))
        : null}

      {state === 'list' || state === 'empty' ? (
        <Pressable
          onPress={onViewAllPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="전체 거래내역 보기"
          style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}
        >
          <Text style={styles.viewAllText}>전체 거래내역 보기</Text>
          <Text style={styles.viewAllChevron}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  accountLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 6,
  },
  empty: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 20,
  },
  stateBox: {
    marginTop: 20,
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  stateText: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 8,
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
  groupLabel: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  rowInfo: {
    flex: 1,
    paddingRight: 12,
  },
  counterparty: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  time: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 4,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  amountDeposit: {
    color: redesign.accent,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 28,
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  viewAllChevron: {
    fontSize: 16,
    color: redesign.textSecondary,
    marginLeft: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
