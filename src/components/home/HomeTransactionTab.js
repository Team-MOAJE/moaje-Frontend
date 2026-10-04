import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';

// transactions는 occurredAt 최신순이라 같은 group이 연속된다.
function groupByLabel(transactions) {
  const groups = [];
  transactions.forEach(tx => {
    const last = groups[groups.length - 1];
    if (last && last.label === tx.group) {
      last.items.push(tx);
    } else {
      groups.push({ label: tx.group, items: [tx] });
    }
  });
  return groups;
}

export default function HomeTransactionTab({ transactions, onTransactionPress, onViewAllPress }) {
  const groups = groupByLabel(transactions);

  return (
    <View>
      <Text style={styles.title}>최근 거래내역</Text>

      {groups.length === 0 ? (
        <Text style={styles.empty}>최근 거래내역이 없어요.</Text>
      ) : (
        groups.map(group => (
          <View key={group.label}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {group.items.map(tx => {
              const isDeposit = tx.amount > 0;
              return (
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
                    <Text style={styles.time}>{tx.time}</Text>
                  </View>
                  <Text style={[styles.amount, isDeposit && styles.amountDeposit]}>
                    {formatKRW(tx.amount, true)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  empty: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 20,
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
