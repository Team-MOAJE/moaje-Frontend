import { Alert } from 'react-native';
import { clearTokens } from './tokenService';
import { REQUIRED_ACTIONS } from '../constants/requiredActions';
import { ROUTES } from '../constants/routes';

export const handleRequiredAction = (requiredAction, navigation, message) => {
  const displayMessage = message || '오류가 발생했습니다.';

  switch (requiredAction) {
    case REQUIRED_ACTIONS.NONE:
    case undefined:
    case null:
      Alert.alert('알림', displayMessage);
      break;

    case REQUIRED_ACTIONS.RE_LOGIN:
      clearTokens().then(() => {
        if (navigation) {
          navigation.reset({
            index: 0,
            routes: [{ name: ROUTES.LOGIN }],
          });
        }
      });
      break;

    case REQUIRED_ACTIONS.REFRESH_TOKEN:
      handleRequiredAction(REQUIRED_ACTIONS.RE_LOGIN, navigation, displayMessage);
      break;

    case REQUIRED_ACTIONS.MFA_AUTH:
      if (navigation) {
        navigation.navigate(ROUTES.MFA_SCREEN);
      }
      break;

    case REQUIRED_ACTIONS.RETRY:
      return { retryable: true, message: displayMessage };

    case REQUIRED_ACTIONS.RETRY_LATER:
      Alert.alert('서비스 지연', '잠시 후 다시 시도해주세요.\n불편을 드려 죄송합니다.');
      break;

    // 고객센터 기능은 제공하지 않는다 — 서버가 CONTACT_SUPPORT를 내려와도 일반 오류 안내로 처리한다.
    case REQUIRED_ACTIONS.CONTACT_SUPPORT:
    default:
      Alert.alert('오류', displayMessage);
  }
};
