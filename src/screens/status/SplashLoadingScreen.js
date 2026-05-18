import React from 'react';
import { View, StyleSheet } from 'react-native';
import StatusLayout from '../../components/status/StatusLayout';
import LoadingStateCard from '../../components/status/LoadingStateCard';
import { colors, spacing } from '../../constants/statusTheme';

const SplashLoadingScreen = () => (
  <StatusLayout>
    <View style={styles.center}>
      <LoadingStateCard
        loadingType="plant"
        title="모아제"
        description="오늘의 가용금액을 계산하고 있어요"
        subDescription="내 계좌와 이체 기록을 안전하게 확인하는 중이에요"
      />
    </View>
  </StatusLayout>
);

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
});

export default SplashLoadingScreen;
