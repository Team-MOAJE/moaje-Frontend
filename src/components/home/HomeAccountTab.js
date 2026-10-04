import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import { formatKRW } from '../../utils/formatMoney';

export default function HomeAccountTab({ accounts, totalBalance, onAccountPress, onConnectPress }) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>내 계좌</Text>
        <Text style={styles.total}>{`총 ${formatKRW(totalBalance)}`}</Text>
      </View>

      {accounts.map(account => (
        <Pressable
          key={account.id}
          onPress={() => onAccountPress(account)}
          accessibilityRole="button"
          accessibilityLabel={`${account.name} 계좌 상세`}
          style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
        >
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountToken}>{account.token}</Text>
          </View>
          <Text style={styles.balance}>{formatKRW(account.balance)}</Text>
        </Pressable>
      ))}

      <Pressable
        onPress={onConnectPress}
        accessibilityRole="button"
        accessibilityLabel="계좌 연결"
        style={({ pressed }) => [styles.connect, pressed && styles.pressed]}
      >
        <Text style={styles.connectPlus}>+</Text>
        <Text style={styles.connectText}>계좌 연결</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  total: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  accountInfo: {
    flex: 1,
    paddingRight: 12,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  accountToken: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 4,
  },
  balance: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 28,
    paddingVertical: 6,
  },
  connectPlus: {
    fontSize: 20,
    color: redesign.textSecondary,
    marginRight: 10,
  },
  connectText: {
    fontSize: 14,
    color: redesign.textPrimary,
  },
  pressed: {
    opacity: 0.6,
  },
});
