import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import RiskBadge from './RiskBadge';

// API-25 점검 기록 한 건(읽기 전용). 서버는 가맹점·발생 시각을 로그에 담지 않는다.
export default function FdsLogRow({ item }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <RiskBadge riskLevel={item.riskLevel} label={item.riskLabel} />
        <Text style={styles.meta}>
          {item.createdText}
          {item.isAlerted ? ' · 알림 대상' : ''}
        </Text>
      </View>
      <Text style={styles.amount}>{item.amountText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  left: {
    flex: 1,
    gap: 6,
  },
  meta: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
});
