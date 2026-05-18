import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import StatusLayout from '../../components/status/StatusLayout';
import ErrorStateCard from '../../components/status/ErrorStateCard';
import { spacing } from '../../constants/statusTheme';
import { STATUS_SCREEN_CONFIGS, FALLBACK_ERROR_CONFIG } from '../../constants/statusScreenConfigs';

// route.params: { requiredAction: REQUIRED_ACTIONS.RETRY | RETRY_LATER | RE_LOGIN | MFA_AUTH | CONTACT_SUPPORT }
const ErrorStateScreen = ({ navigation, route }) => {
  const { requiredAction } = route?.params || {};
  const config = STATUS_SCREEN_CONFIGS[requiredAction] ?? FALLBACK_ERROR_CONFIG;

  const [loading, setLoading] = useState(false);

  // 디자인 구현 전용: 실제 API·인증 로직 없음
  const handlePrimary = () => {
    console.log('[ErrorStateScreen] primaryPress:', requiredAction);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // RE_LOGIN: 실제 연결 시 navigation.navigate(ROUTES.LOGIN) + dispatch(logout()) 처리 필요
      // 나머지: retry / goHome 등 각 화면 맥락에 맞게 연결 필요
      if (navigation.canGoBack()) navigation.goBack();
    }, 1200);
  };

  const handleSecondary = () => {
    console.log('[ErrorStateScreen] secondaryPress:', requiredAction);
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <StatusLayout
      title={config.layoutTitle}
      showBack
      onBack={() => navigation.canGoBack() && navigation.goBack()}
    >
      <View style={styles.body}>
        <ErrorStateCard
          iconName={config.iconName}
          chipKey={config.chipKey}
          title={config.title}
          description={config.description}
          primaryLabel={config.primaryLabel}
          secondaryLabel={config.secondaryLabel}
          onPrimaryPress={handlePrimary}
          onSecondaryPress={handleSecondary}
          loading={loading}
        />
      </View>
    </StatusLayout>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
});

export default ErrorStateScreen;
