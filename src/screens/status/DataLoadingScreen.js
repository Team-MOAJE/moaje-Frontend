import React from 'react';
import { View, StyleSheet } from 'react-native';
import StatusLayout from '../../components/status/StatusLayout';
import LoadingStateCard from '../../components/status/LoadingStateCard';
import { colors, spacing } from '../../constants/statusTheme';

const DataLoadingScreen = ({ navigation }) => {
  const canGoBack = navigation.canGoBack();

  return (
    <StatusLayout
      title="불러오는 중"
      showBack={canGoBack}
      onBack={() => canGoBack && navigation.goBack()}
    >
      <View style={styles.body}>
        <LoadingStateCard loadingType="data" />
      </View>
    </StatusLayout>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
});

export default DataLoadingScreen;
