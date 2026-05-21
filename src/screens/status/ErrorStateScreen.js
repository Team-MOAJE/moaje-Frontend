import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import StatusLayout from '../../components/status/StatusLayout';
import ErrorStateCard from '../../components/status/ErrorStateCard';
import { spacing } from '../../constants/statusTheme';
import { STATUS_SCREEN_CONFIGS, FALLBACK_ERROR_CONFIG } from '../../constants/statusScreenConfigs';
import { logoutUser } from '../../features/auth/authApi';
import { REQUIRED_ACTIONS } from '../../constants/requiredActions';
import { ROUTES } from '../../constants/routes';

// route.params: { requiredAction: REQUIRED_ACTIONS.RETRY | RETRY_LATER | RE_LOGIN | MFA_AUTH | CONTACT_SUPPORT }
const ErrorStateScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { requiredAction } = route?.params || {};
  const config = STATUS_SCREEN_CONFIGS[requiredAction] ?? FALLBACK_ERROR_CONFIG;

  const [loading, setLoading] = useState(false);

  const handlePrimary = async () => {
    setLoading(true);
    try {
      switch (requiredAction) {
        case REQUIRED_ACTIONS.RE_LOGIN:
          await dispatch(logoutUser());
          // RootNavigator가 isAuthenticated=false를 감지해 AuthNavigator로 자동 전환
          break;
        case REQUIRED_ACTIONS.MFA_AUTH:
          navigation.navigate(ROUTES.MFA_SCREEN);
          break;
        case REQUIRED_ACTIONS.CONTACT_SUPPORT:
          navigation.navigate(ROUTES.SUPPORT_SCREEN);
          break;
        default:
          if (navigation.canGoBack()) navigation.goBack();
          break;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSecondary = () => {
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
