import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ROUTES } from '../../constants/routes';
import { REQUIRED_ACTIONS } from '../../constants/requiredActions';
import { colors, spacing, radius, shadow } from '../../constants/statusTheme';

const PREVIEW_BUTTONS = [
  {
    section: '로딩 화면',
    items: [
      { label: 'Splash Loading 보기', route: ROUTES.STATUS_SPLASH_LOADING, params: {} },
      { label: 'Data Loading 보기', route: ROUTES.STATUS_DATA_LOADING, params: {} },
      { label: 'Skeleton Loading 보기', route: ROUTES.STATUS_SKELETON_LOADING, params: {} },
    ],
  },
  {
    section: '에러 화면',
    items: [
      {
        label: 'Network Error 보기',
        route: ROUTES.STATUS_ERROR,
        params: { requiredAction: REQUIRED_ACTIONS.RETRY },
      },
      {
        label: 'Maintenance 보기',
        route: ROUTES.STATUS_ERROR,
        params: { requiredAction: REQUIRED_ACTIONS.RETRY_LATER },
      },
      {
        label: 'Login Required 보기',
        route: ROUTES.STATUS_ERROR,
        params: { requiredAction: REQUIRED_ACTIONS.RE_LOGIN },
      },
      {
        label: 'Security MFA 보기',
        route: ROUTES.STATUS_ERROR,
        params: { requiredAction: REQUIRED_ACTIONS.MFA_AUTH },
      },
      {
        label: 'Contact Support 보기',
        route: ROUTES.STATUS_ERROR,
        params: { requiredAction: REQUIRED_ACTIONS.CONTACT_SUPPORT },
      },
    ],
  },
  {
    section: '컴포넌트 상태',
    items: [{ label: 'Component States 보기', route: ROUTES.DEV_COMPONENT_STATES, params: {} }],
  },
];

const DevStatePreviewScreen = ({ navigation }) => (
  <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.devBadge}>
          <Text style={styles.devBadgeText}>DEV ONLY</Text>
        </View>
        <Text style={styles.title}>공통 상태 화면 미리보기</Text>
        <Text style={styles.subtitle}>
          RootNavigator의 ENABLE_DEV_STATE_PREVIEW를{'\n'}false로 바꾸면 기존 앱으로 복원됩니다
        </Text>
      </View>

      {PREVIEW_BUTTONS.map(({ section, items }) => (
        <View key={section} style={styles.section}>
          <Text style={styles.sectionTitle}>{section}</Text>
          {items.map(({ label, route, params }) => (
            <Pressable
              key={label}
              onPress={() => navigation.navigate(route, params)}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>{label}</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ))}
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>이 화면은 __DEV__ 환경에서만 표시됩니다</Text>
      </View>
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  devBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  devBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.2,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  button: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.card,
  },
  buttonPressed: {
    backgroundColor: colors.hairline,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  arrow: {
    fontSize: 15,
    color: colors.muted,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
  },
});

export default DevStatePreviewScreen;
