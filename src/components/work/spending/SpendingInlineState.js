import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { PanelButton } from '../../onboarding/WorkOnboardingStatePanel';

// 구간 안에서 쓰는 로딩/오류/빈 상태 표시. props만 받는다.
// 재시도는 사용자가 버튼을 눌렀을 때만(onRetry) 일어난다.
export function InlineLoading({ message }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar">
      <ActivityIndicator color={redesign.accent} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

export function InlineError({ title, message, canRetry, onRetry }) {
  return (
    <View style={styles.error}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={styles.message}>{message}</Text>
      {canRetry ? (
        <PanelButton label="다시 불러오기" variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function InlineEmpty({ title, message }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  error: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: redesign.surfaceSoft,
    gap: 10,
  },
  empty: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: redesign.surfaceSoft,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: redesign.textSecondary,
  },
});
