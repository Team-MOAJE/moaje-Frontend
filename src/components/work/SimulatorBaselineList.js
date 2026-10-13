import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';
import { PanelButton } from '../onboarding/WorkOnboardingStatePanel';

// API-39 기준값 목록. props만 받는다(세션·네비게이션 의존 없음).
// items는 buildBaselineViewModel 결과이며 서버 순서·개수를 그대로 표시한다(빈 배열도 정상).
// 서버가 주는 참고 url은 화면에 표시하지 않는다(데이터는 viewModel에 그대로 남아 있다).
export default function SimulatorBaselineList({ status, items, errorMessage, canRetry, onRetry }) {
  if (status === 'idle' || status === 'loading') {
    return (
      <View style={styles.inline} accessibilityRole="progressbar">
        <ActivityIndicator color={redesign.accent} />
        <Text style={styles.muted}>기준값을 불러오는 중이에요</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        {canRetry ? (
          <PanelButton label="다시 불러오기" variant="secondary" onPress={onRetry} />
        ) : null}
      </View>
    );
  }

  if (items.length === 0) {
    return <Text style={styles.muted}>표시할 기준값이 없어요</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map(item => (
        <View key={item.key} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.amount}>{item.amountText}</Text>
          </View>
          <Text style={[styles.kind, item.isAssumption && styles.kindAssumption]}>
            {item.kindLabel}
          </Text>
          <Text style={styles.source}>
            {[item.source, item.asOf, item.scope].filter(part => part).join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
  errorBox: {
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: redesign.textPrimary,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: redesign.divider,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
    gap: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    color: redesign.accent,
  },
  kind: {
    fontSize: 12,
    fontWeight: '600',
    color: redesign.textSecondary,
  },
  kindAssumption: {
    color: redesign.accent,
  },
  source: {
    fontSize: 12,
    lineHeight: 17,
    color: redesign.textSecondary,
  },
});
