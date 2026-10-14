import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import {
  getAccountStatusLabel,
  getAccountStatusNotice,
} from '../../features/asset/assetScreenLogic';

// 조회용 계좌 선택 시트다. ACTIVE/SUSPENDED/CLOSED 모두 고를 수 있고, 송금 출금 계좌 후보와는 무관하다
// (송금 가능 여부는 canTransferFrom, 출금 계좌 결정은 TransferScreen이 따로 한다).
// 서버에 은행명·실제 계좌번호가 없으므로 정적 계좌 라벨만 표시한다.

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
            <Feather name="x" size={22} color={redesign.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>내 계좌</Text>

        {(accounts ?? []).map(account => {
          const selected = account.id === selectedAccountId;
          return (
            <TouchableOpacity
              key={account.id}
              activeOpacity={0.8}
              onPress={() => onSelect(account.id)}
              style={styles.accountRow}
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
