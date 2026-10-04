import { REQUIRED_ACTIONS } from './requiredActions';

// 4가지 에러 상태 화면의 텍스트·아이콘·칩 config
// ErrorStateScreen에서 requiredAction으로 조회해 사용
export const STATUS_SCREEN_CONFIGS = {
  [REQUIRED_ACTIONS.RETRY]: {
    layoutTitle: '연결 오류',
    iconName: 'cloud-offline-outline',
    chipKey: 'RETRY',
    title: '연결이 잠시 불안정해요',
    description: '네트워크 상태를 확인한 뒤 다시 시도해줘',
    primaryLabel: '다시 시도하기',
    secondaryLabel: '홈으로 가기',
  },
  [REQUIRED_ACTIONS.RETRY_LATER]: {
    layoutTitle: '서비스 점검',
    iconName: 'construct-outline',
    chipKey: 'RETRY_LATER',
    title: '지금은 잠시 쉬어가는 중이에요',
    description: '서비스가 안정화되면 다시 이용할 수 있어요',
    primaryLabel: '나중에 다시 시도하기',
    secondaryLabel: '홈으로 가기',
  },
  [REQUIRED_ACTIONS.RE_LOGIN]: {
    layoutTitle: '로그인 필요',
    iconName: 'lock-closed-outline',
    chipKey: 'RE_LOGIN',
    title: '다시 로그인이 필요해요',
    description: '안전한 이용을 위해 로그인 화면으로 이동할게요',
    primaryLabel: '로그인하러 가기',
    secondaryLabel: '취소',
  },
  [REQUIRED_ACTIONS.MFA_AUTH]: {
    layoutTitle: '안전 확인',
    iconName: 'shield-checkmark-outline',
    chipKey: 'MFA_AUTH',
    title: '안전 확인이 필요해요',
    description: '소중한 자산을 지키기 위해 본인 확인을 한 번 더 진행할게요',
    primaryLabel: '본인 확인하기',
    secondaryLabel: '송금 취소',
  },
};

// fallback config (requiredAction 값이 매핑되지 않을 때)
export const FALLBACK_ERROR_CONFIG = {
  layoutTitle: '오류',
  iconName: 'alert-circle-outline',
  chipKey: 'RETRY',
  title: '문제가 발생했어요',
  description: '잠시 후 다시 시도해 주세요',
  primaryLabel: '다시 시도하기',
  secondaryLabel: '홈으로 가기',
};
