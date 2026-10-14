import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { PanelButton } from '../../onboarding/WorkOnboardingStatePanel';
import RiskBadge from './RiskBadge';

// API-26 알림 한 건. 문구·위험도·금액은 서버 값이다.
// '확인' 요청(API-27)은 버튼을 눌렀을 때만(onConfirm) 나가며, 서버 응답 전에는 확인됨으로 바꾸지 않는다.
export default function FdsAlertRow({ item, onConfirm }) {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <RiskBadge riskLevel={item.riskLevel} label={item.riskLabel} />
        <Text style={styles.amount}>{item.amountText}</Text>
      </View>
      {item.merchantText ? <Text style={styles.merchant}>{item.merchantText}</Text> : null}
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.meta}>{item.createdText}</Text>

      {item.isConfirmed ? (
        <Text style={styles.confirmed}>
          확인함{item.confirmedText ? ` · ${item.confirmedText}` : ''}
        </Text>
      ) : (
        <View style={styles.action}>
          <PanelButton
            label="확인"
            variant="secondary"
            onPress={onConfirm}
            disabled={!item.canConfirm}
            loading={item.confirming}
          />
        </View>
      )}
      {item.confirmErrorMessage ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {item.confirmErrorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
    gap: 6,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  merchant: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textPrimary,
  },
  meta: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  confirmed: {
    fontSize: 12,
    fontWeight: '700',
    color: redesign.textSecondary,
  },
  action: {
    marginTop: 4,
  },
  error: {
    fontSize: 12,
    lineHeight: 18,
    color: '#C0392B',
  },
});
