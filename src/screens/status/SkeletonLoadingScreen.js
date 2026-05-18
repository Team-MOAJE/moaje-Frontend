import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingStateCard from '../../components/status/LoadingStateCard';
import { colors, spacing } from '../../constants/statusTheme';

const SkeletonLoadingScreen = () => (
  <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <LoadingStateCard loadingType="skeleton" />
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});

export default SkeletonLoadingScreen;
