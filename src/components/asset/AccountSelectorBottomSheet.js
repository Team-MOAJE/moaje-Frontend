import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '../../theme';

const BANK_BADGE_COLORS = ['#FEE500', '#FFB020', '#8FC1FF', '#B8D86B', '#F3B7C4', '#C7B8FF'];

function getBankBadge(bankName) {
  if (!bankName) return { initial: '?', bg: colors.bgOuter };
  if (bankName.includes('카카오')) return { initial: '카', bg: '#FEE500' };
  if (bankName.includes('KB') || bankName.includes('국민')) return { initial: 'KB', bg: '#FFB020' };

  let hash = 0;
  for (let i = 0; i < bankName.length; i += 1) {
    hash = (hash * 31 + bankName.charCodeAt(i)) % BANK_BADGE_COLORS.length;
  }
  return { initial: bankName.slice(0, 1), bg: BANK_BADGE_COLORS[hash] };
}

export default function AccountSelectorBottomSheet({
  visible,
  accounts,
  selectedAccountId,
  onSelect,
  onClose,
}) {
  const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 400, duration: 180, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>계좌 선택</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={20} color={colors.textDark} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>내 계좌</Text>

        {(accounts ?? []).map(account => {
          const selected = account.id === selectedAccountId;
          const badge = getBankBadge(account.bankName);
          return (
            <TouchableOpacity
              key={account.id}
              activeOpacity={0.8}
              onPress={() => onSelect(account.id)}
              style={[styles.accountRow, selected && styles.accountRowSelected]}
            >
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={styles.badgeText}>{badge.initial}</Text>
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.bankName}>{account.bankName ?? '-'}</Text>
                <Text style={styles.accountName}>{account.accountLabel ?? account.bankName}</Text>
                {account.maskedAccountNumber ? (
                  <Text style={styles.maskedNumber}>{account.maskedAccountNumber}</Text>
                ) : null}
              </View>
              {selected ? <Feather name="check" size={18} color={colors.oliveDark} /> : null}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    ...shadows.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textDark,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
    marginBottom: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  accountRowSelected: {
    backgroundColor: 'rgba(184,216,107,0.18)',
    borderColor: colors.oliveLight,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textDark,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  bankName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
  },
  maskedNumber: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
    fontFamily: 'monospace',
  },
});
