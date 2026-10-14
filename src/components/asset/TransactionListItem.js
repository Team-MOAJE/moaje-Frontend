import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';
import TransactionStatusBadge from './TransactionStatusBadge';
import { mapTransactionStatus } from '../../utils/mapTransactionStatus';
import {
  formatServerDateTime,
  formatTxAmount,
  getTxTypeLabel,
  resolveTxTitle,
  txAmountTone,
} from '../../features/asset/assetScreenLogic';

// ── 아이콘 매핑 (Feather) ─────────────────────────────────────
const ICON_MAP = {
  pending: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  checking: { name: 'clock', bg: '#FFF8E6', fg: colors.orange },
  completed: { name: 'send', bg: '#F3F6EA', fg: colors.olive },
  depositCompleted: { name: 'arrow-down-left', bg: 'rgba(184,216,107,0.3)', fg: colors.textDark },
  expenseCompleted: { name: 'file-text', bg: '#F3F6EA', fg: colors.olive },
  failed: { name: 'alert-circle', bg: 'rgba(229,72,77,0.1)', fg: colors.red },
  canceled: { name: 'x-circle', bg: '#F1F1F1', fg: '#6B6B6B' },
};

// tx는 normalizeTransaction 모델(서버 status 원문)이다. 표시용 상태·금액·날짜는 assetScreenLogic이 만든다.
export default function TransactionListItem({ tx, onPress }) {
  const status = mapTransactionStatus(tx.status, tx.type);
  const iconCfg = ICON_MAP[status] ?? ICON_MAP.pending;
  const positive = txAmountTone(tx) === 'positive';
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { onPress, activeOpacity: 0.75 } : {};

  return (
    <Container {...containerProps} style={listStyles.container}>
      <View style={[listStyles.iconBox, { backgroundColor: iconCfg.bg }]}>
        <Feather name={iconCfg.name} size={20} color={iconCfg.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={listStyles.counterparty} numberOfLines={1}>
          {resolveTxTitle(tx)}
        </Text>
        <Text style={listStyles.meta} numberOfLines={1}>
          {getTxTypeLabel(tx)} · {formatServerDateTime(tx.createdAt)}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[listStyles.amount, { color: positive ? colors.green : colors.textDark }]}>
          {formatTxAmount(tx)}
        </Text>
        <TransactionStatusBadge status={status} />
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
