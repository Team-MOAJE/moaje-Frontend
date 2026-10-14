import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import {
  getAccountStatusLabel,
  getAccountStatusNotice,
} from '../../features/asset/assetScreenLogic';

// 조회용 계좌 선택 시트다. 기본은 ACTIVE/SUSPENDED/CLOSED 모두 고를 수 있다.
// 송금 출금 계좌처럼 고를 수 있는 계좌를 제한해야 하면 호출하는 화면이 isSelectable 함수를 넘긴다
// (송금 가능 여부 판단은 화면의 canTransferFrom이 하며, 시트는 판단하지 않는다).
// 계좌 라벨(서버 은행명 기반, 없으면 "내 계좌")과 서버가 마스킹한 번호(maskedAccountNumber)만 표시한다. 전체 번호는 목록에 오지 않는다.

export default function AccountSelectorBottomSheet({
  visible,
  accounts,
  selectedAccountId,
  onSelect,
  onClose,
  title = '계좌 선택',
  isSelectable,
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
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={redesign.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>내 계좌</Text>

        {(accounts ?? []).map(account => {
          const selected = account.id === selectedAccountId;
          const selectable = typeof isSelectable === 'function' ? isSelectable(account) : true;
          return (
            <TouchableOpacity
              key={account.id}
              activeOpacity={0.8}
              disabled={!selectable}
              accessibilityState={{ disabled: !selectable, selected }}
              onPress={() => {
                if (selectable) onSelect(account.id);
              }}
              style={[styles.accountRow, !selectable && styles.accountRowDisabled]}
            >
              <View style={styles.accountInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.accountName}>{account.label ?? '내 계좌'}</Text>
                  {getAccountStatusLabel(account) ? (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{getAccountStatusLabel(account)}</Text>
                    </View>
                  ) : null}
                </View>
                {account.maskedAccountNumber ? (
                  <Text style={styles.maskedNumber}>{account.maskedAccountNumber}</Text>
                ) : null}
                {getAccountStatusNotice(account) ? (
                  <Text style={styles.statusNotice}>{getAccountStatusNotice(account)}</Text>
                ) : null}
              </View>
              {selected ? <Feather name="check" size={20} color={redesign.accent} /> : null}
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
    backgroundColor: redesign.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: redesign.divider,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: redesign.textPrimary,
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  accountRowDisabled: {
    opacity: 0.45,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: redesign.divider,
  },
  statusBadgeText: {
    fontSize: 11,
    color: redesign.textSecondary,
  },
  maskedNumber: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  statusNotice: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
});
