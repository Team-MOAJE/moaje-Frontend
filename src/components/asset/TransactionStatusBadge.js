import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius } from '../../theme';

// ── 상태 뱃지 설정 ─────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { label: '처리 중', bg: '#F3F6EA', fg: colors.olive, icon: 'loader' },
  checking: { label: '확인 중', bg: '#FFF8E6', fg: colors.orange, icon: 'clock' },
  completed: { label: '송금 완료', bg: 'rgba(47,158,68,0.1)', fg: colors.green, icon: 'check' },
  failed: {
    label: '송금 실패',
    bg: 'rgba(229,72,77,0.1)',
    fg: colors.red,
    icon: 'alert-triangle',
  },
  reversed: { label: '취소 완료', bg: '#E8EBD8', fg: colors.olive, icon: 'rotate-ccw' },
  depositCompleted: {
    label: '입금 완료',
    bg: 'rgba(184,216,107,0.3)',
    fg: colors.textDark,
    icon: 'arrow-down-left',
  },
  expenseCompleted: { label: '지출 완료', bg: '#F3F6EA', fg: colors.textDark, icon: 'file-text' },
};

export default function TransactionStatusBadge({ status }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <View style={[badgeStyles.container, { backgroundColor: c.bg }]}>
      <Feather name={c.icon} size={10} color={c.fg} />
      <Text style={[badgeStyles.text, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 10,
    fontWeight: '500',
  },
});
