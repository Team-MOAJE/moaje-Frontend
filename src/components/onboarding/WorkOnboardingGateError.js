import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { describeErrorType } from '../../features/onboarding/workOnboardingScreenLogic';
import { GATE_ERROR_INVALID_USER } from '../../features/onboarding/useOnboardingGate';
import WorkOnboardingStatePanel, { PanelButton } from './WorkOnboardingStatePanel';

// 서버 온보딩 상태(API-34)를 확인하지 못했을 때의 안내. 로컬 결과로 대체하지 않는다.
// 재시도 중(isRetrying)에는 버튼이 로딩 표시로 바뀌고 다시 눌러도 onRetry가 호출되지 않는다.
// 부모가 checking 동안 이 화면을 유지하고 isRetrying={isChecking}을 넘길 때만 로딩이 보인다.
export const describeGateError = errorType =>
  errorType === GATE_ERROR_INVALID_USER
    ? '사용자 정보를 확인할 수 없어요. 다시 로그인해주세요.'
    : describeErrorType(errorType);

export default function WorkOnboardingGateError({ errorType, onRetry, isRetrying = false }) {
  const handleRetry = () => {
    if (isRetrying) return; // 중복 재시도 방지
    onRetry?.();
  };

  return (
    <View style={styles.container}>
      <WorkOnboardingStatePanel
        tone="error"
        title="온보딩 상태를 확인하지 못했어요"
        message={`${describeGateError(errorType)}\n서버 상태를 확인하기 전에는 진행할 수 없어요.`}
      >
        {errorType !== GATE_ERROR_INVALID_USER && (
          <PanelButton label="다시 시도" loading={isRetrying} onPress={handleRetry} />
        )}
      </WorkOnboardingStatePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
});
