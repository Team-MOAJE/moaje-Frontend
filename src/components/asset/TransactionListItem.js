import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';
import TransactionStatusBadge from './TransactionStatusBadge';

// ── 아이콘 매핑 (Feather) ─────────────────────────────────────
const ICON_MAP = {
  pending: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  checking: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  completed: { name: 'send', bg: '#F3F6EA', fg: colors.olive },
  depositCompleted: { name: 'arrow-down-left', bg: 'rgba(184,216,107,0.3)', fg: colors.textDark },
  expenseCompleted: { name: 'file-text', bg: '#F3F6EA', fg: colors.olive },
};

export default function TransactionListItem({ tx, onPress }) {
  const iconCfg = ICON_MAP[tx.status] ?? ICON_MAP.pending;
  const positive = tx.amount > 0;
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { onPress, activeOpacity: 0.75 } : {};

  return (
    <Container {...containerProps} style={listStyles.container}>
      <View style={[listStyles.iconBox, { backgroundColor: iconCfg.bg }]}>
        <Feather name={iconCfg.name} size={20} color={iconCfg.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={listStyles.counterparty} numberOfLines={1}>
          {tx.counterparty}
        </Text>
        <Text style={listStyles.meta} numberOfLines={1}>
          {tx.time} · {tx.description}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[listStyles.amount, { color: positive ? colors.green : colors.textDark }]}>
          {positive ? '+' : ''}
          {tx.amount.toLocaleString()}원
        </Text>
        <TransactionStatusBadge status={tx.status} />
      </View>
    </Container>
  );
}

const listStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  counterparty: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textDark,
  },
  meta: {
    fontSize: 11,
    color: 'rgba(111,127,63,0.8)',
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
  },
});
