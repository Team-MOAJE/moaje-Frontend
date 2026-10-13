import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadows } from '../../theme';

// 신규 온보딩 화면의 상태 안내 공용 UI: 로딩 / 오류(재시도) / Draft 안내 / 제출 상태.

export function PanelButton({ label, onPress, variant = 'primary', disabled, loading }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.cream : colors.olive} />
      ) : (
        <Text style={isPrimary ? styles.buttonPrimaryText : styles.buttonSecondaryText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function LoadingPanel({ message }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.olive} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

// tone: 'default' | 'error' | 'warn'
export default function WorkOnboardingStatePanel({
  title,
  message,
  lines,
  tone = 'default',
  children,
}) {
  return (
    <View style={styles.centered}>
      <View
        style={[
          styles.card,
          tone === 'error' && styles.cardError,
          tone === 'warn' && styles.cardWarn,
        ]}
      >
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {(lines ?? []).map(line => (
          <Text key={line} style={styles.line}>
            • {line}
          </Text>
        ))}
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    alignSelf: 'stretch',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...shadows.sm,
  },
  cardError: {
    borderColor: colors.red,
  },
  cardWarn: {
    borderColor: colors.borderWarn,
    backgroundColor: colors.bgWarn,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textDark,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMid,
    textAlign: 'left',
  },
  line: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textDark,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.olive,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.cream,
  },
  buttonSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
});
