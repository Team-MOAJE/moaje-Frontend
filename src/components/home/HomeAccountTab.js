import React from 'react';
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// 홈 계좌 탭. 서버 합계 API가 없으므로 총잔액은 만들지 않는다.
// state: 'loading' | 'error' | 'empty' | 'list' (resolveHomeAccountsState 결과)
// accounts: buildHomeAccountItems 결과({ id, label, statusLabel, balanceText })
export default function HomeAccountTab({
  state,
  accounts,
  errorMessage,
  onRetry,
  onAccountPress,
  onNewAccountPress,
}) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>내 계좌</Text>
        {onNewAccountPress ? (
          <Pressable
            onPress={onNewAccountPress}
            accessibilityRole="button"
            accessibilityLabel="계좌 만들기"
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.newAccountText}>계좌 만들기</Text>
          </Pressable>
        ) : null}
      </View>

      {state === 'loading' ? (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={redesign.accent} />
          <Text style={styles.stateText}>계좌를 불러오는 중이에요</Text>
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>계좌를 불러오지 못했어요</Text>
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

      {state === 'empty' ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>연결된 계좌가 없어요</Text>
        </View>
      ) : null}

      {state === 'list'
        ? accounts.map(account => (
            <Pressable
              key={account.id}
              onPress={() => onAccountPress(account)}
              hitSlop={{ top: 10, bottom: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`${account.label} 계좌 상세`}
              style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
            >
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{account.label}</Text>
                {account.statusLabel ? (
                  <Text style={styles.accountStatus}>{account.statusLabel}</Text>
                ) : null}
              </View>
              <Text style={styles.balance}>{account.balanceText}</Text>
            </Pressable>
          ))
        : null}
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
  newAccountText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.accent,
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
  accountStatus: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 4,
  },
  balance: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  stateBox: {
    marginTop: 22,
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
  pressed: {
    opacity: 0.6,
  },
});
