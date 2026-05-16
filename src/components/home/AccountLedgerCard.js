import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

export default function AccountLedgerCard() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>내 자산 원장</Text>
        <View style={styles.badge}>
          <Feather name="shield" size={10} color={colors.green} />
          <Text style={styles.badgeText}>실계좌번호 숨김</Text>
        </View>
      </View>

      <View style={styles.accountRow}>
        <LinearGradient
          colors={[colors.oliveLight, colors.olive]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.accountIcon}
        >
          <Text style={styles.accountIconText}>₩</Text>
        </LinearGradient>
        <View style={styles.accountInfo}>
          <Text style={styles.bankName}>카카오뱅크 생활비 통장</Text>
          <Text style={styles.tokenId}>acct_***_7F2A</Text>
        </View>
        <Text style={styles.balance}>246,000원</Text>
      </View>

      <View style={styles.updateRow}>
        <Feather name="refresh-cw" size={10} color={colors.textLight} />
        <Text style={styles.updateText}>방금 업데이트됨</Text>
      </View>

      <View style={styles.notice}>
        <Feather name="lock" size={11} color={colors.textMid} />
        <Text style={styles.noticeText}>계좌번호 대신 안전한 토큰으로 관리돼요.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDark,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(47,158,68,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.green,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  bankName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  tokenId: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
    fontFamily: 'monospace',
  },
  balance: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textDark,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -4,
  },
  updateText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textLight,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgLight,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  noticeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMid,
    flex: 1,
  },
});
