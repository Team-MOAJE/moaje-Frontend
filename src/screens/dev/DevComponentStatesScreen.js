import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/status/StatusButton';
import StatusChip from '../../components/status/StatusChip';
import { colors, spacing, radius, shadow } from '../../constants/statusTheme';

const CHIP_KEYS = ['RETRY', 'RETRY_LATER', 'RE_LOGIN', 'MFA_AUTH', 'CONTACT_SUPPORT'];

const SectionCard = ({ title, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const DevComponentStatesScreen = ({ navigation }) => {
  const [primaryLoading, setPrimaryLoading] = useState(false);

  const handleLoadingDemo = () => {
    setPrimaryLoading(true);
    setTimeout(() => setPrimaryLoading(false), 2000);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={12}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Component States</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Primary Button */}
        <SectionCard title="Primary Button">
          <View style={styles.row}>
            <Text style={styles.stateLabel}>Default</Text>
            <View style={styles.buttonWrap}>
              <PrimaryButton label="다시 시도하기" onPress={() => {}} />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.stateLabel}>Loading (탭해서 확인)</Text>
            <View style={styles.buttonWrap}>
              <PrimaryButton
                label="다시 시도하기"
                onPress={handleLoadingDemo}
                loading={primaryLoading}
                loadingLabel="다시 시도 중"
              />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.stateLabel}>Disabled</Text>
            <View style={styles.buttonWrap}>
              <PrimaryButton label="다시 시도하기" onPress={() => {}} disabled />
            </View>
          </View>
        </SectionCard>

        {/* Secondary Button */}
        <SectionCard title="Secondary Button">
          <View style={styles.row}>
            <Text style={styles.stateLabel}>Default</Text>
            <View style={styles.buttonWrap}>
              <SecondaryButton label="홈으로 가기" onPress={() => {}} />
            </View>
          </View>
        </SectionCard>

        {/* Error Status Chip */}
        <SectionCard title="Error Status Chip">
          <View style={styles.chipGrid}>
            {CHIP_KEYS.map(key => (
              <StatusChip key={key} chipKey={key} />
            ))}
          </View>
        </SectionCard>

        <View style={styles.footer}>
          <Text style={styles.footerText}>DEV ONLY — 배포 빌드에서는 접근 불가</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backBtnPressed: {
    backgroundColor: colors.hairline,
  },
  backIcon: {
    fontSize: 18,
    color: colors.forest,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  headerPlaceholder: {
    width: 36,
  },
  scroll: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  row: {
    gap: spacing.sm,
  },
  stateLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  buttonWrap: {
    width: '100%',
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
  },
});

export default DevComponentStatesScreen;
