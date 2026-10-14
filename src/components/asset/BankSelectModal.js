import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
import { VIRTUAL_BANKS } from '../../features/asset/virtualBanks';

// 가상 은행 선택 시트(계좌 개설·송금 공용). 목록은 virtualBanks.js의 시연용 코드 10개이며 실제 금융기관 코드가 아니다.
// 선택 결과는 { bankCode, bankName }으로 호출부에 전달한다. 선택값을 저장하지 않는다(상태는 호출부 소유).
// ScrollView는 auto-height 부모에서 잘리지 않도록 화면 높이 기반 고정 px maxHeight를 쓴다.

export default function BankSelectModal({ visible, selectedBankCode, onSelect, onClose, title }) {
  const { height: windowHeight } = useWindowDimensions();
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

  const listMaxHeight = Math.round(windowHeight * 0.55);

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>{title ?? '은행 선택'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="닫기">
            <Feather name="x" size={22} color={redesign.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ maxHeight: listMaxHeight }} showsVerticalScrollIndicator={false}>
          {VIRTUAL_BANKS.map(bank => {
            const selected = bank.bankCode === selectedBankCode;
            return (
              <TouchableOpacity
                key={bank.bankCode}
                activeOpacity={0.8}
                onPress={() => onSelect({ bankCode: bank.bankCode, bankName: bank.bankName })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={styles.bankRow}
              >
                <Text style={styles.bankName}>{bank.bankName}</Text>
                {selected ? <Feather name="check" size={20} color={redesign.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: redesign.textPrimary,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
});
