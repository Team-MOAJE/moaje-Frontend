// API-10 송금 결과 분류(순수 함수, React·Redux 비의존).
// 기준: 백엔드 moaje-banking(TransferController, TransferExceptionHandler) 읽기 확인, docs API-10.
//
// 원칙
// - COMPLETED만 송금 완료다. ACCEPTED/PROCESSING은 "처리 중(완료 미확정)", FAILED는 실패, REVERSED는 "송금 후 반전됨"(실패와 구분).
// - 서버가 결과를 확정하지 않았거나 응답을 받지 못한 경우(타임아웃·연결 오류·5xx·응답 형식 오류)는 "결과 확인 불가"다.
//   이때 송금이 실행됐는지 알 수 없으므로 같은 Idempotency-Key와 같은 요청 본문으로만 다시 확인할 수 있다.
// - 응답 message는 서버 문구라 상태 판단에 쓰지 않는다.
import { ASSET_ERROR_TYPE, getAssetErrorType } from './assetResponse';
import { TRANSFER_STATUS } from './bankingApi';

export const TRANSFER_OUTCOME = Object.freeze({
  COMPLETED: 'COMPLETED', // 송금 완료
  IN_PROGRESS: 'IN_PROGRESS', // ACCEPTED/PROCESSING — 처리 중, 완료 미확정
  FAILED: 'FAILED', // 송금 실패
  REVERSED: 'REVERSED', // 송금 후 반전됨
});

// 요청 오류 분류: 서버가 실행하지 않았음이 확실한가.
export const TRANSFER_ERROR_OUTCOME = Object.freeze({
  REJECTED: 'REJECTED', // 요청이 실행되지 않았음이 확실(입력 검증 실패·인증 거부·4xx 확정 거절)
  UNCERTAIN: 'UNCERTAIN', // 실행 여부를 알 수 없음(타임아웃·연결 오류·5xx·응답 형식 오류 등)
  BLOCKED: 'BLOCKED', // 미확정 송금이 있어 새 송금을 보내지 않음(요청 안 함)
});

export const PENDING_TRANSFER_CODE = 'PENDING_TRANSFER_EXISTS';
export const IDEMPOTENCY_KEY_CONFLICT_CODE = 'IDEMPOTENCY_KEY_CONFLICT';
export const REQUEST_TIMEOUT_STATUS = 408;

export const classifyTransferStatus = status => {
  switch (status) {
    case TRANSFER_STATUS.COMPLETED:
      return TRANSFER_OUTCOME.COMPLETED;
    case TRANSFER_STATUS.ACCEPTED:
    case TRANSFER_STATUS.PROCESSING:
      return TRANSFER_OUTCOME.IN_PROGRESS;
    case TRANSFER_STATUS.FAILED:
      return TRANSFER_OUTCOME.FAILED;
    case TRANSFER_STATUS.REVERSED:
      return TRANSFER_OUTCOME.REVERSED;
    default:
      return null; // 알 수 없는 상태는 확정으로 보지 않는다(mapTransferResponse가 이미 거부한다)
  }
};

// 원본 오류(ApiError / 입력 검증 오류) → REJECTED | UNCERTAIN.
// 애매하면 UNCERTAIN이다(미확정으로 취급해 새 키 송금을 막는 쪽이 안전하다).
export const classifyTransferError = error => {
  switch (getAssetErrorType(error)) {
    case ASSET_ERROR_TYPE.INVALID_REQUEST: // 보내기 전 입력 검증 실패
    case ASSET_ERROR_TYPE.CONFIG: // 주소 미설정 — 요청 안 함
    case ASSET_ERROR_TYPE.UNAUTHORIZED: // Gateway 인증 단계 거부
    case ASSET_ERROR_TYPE.FORBIDDEN:
    case ASSET_ERROR_TYPE.NOT_FOUND:
    case ASSET_ERROR_TYPE.BAD_REQUEST:
    case ASSET_ERROR_TYPE.VALIDATION:
      return TRANSFER_ERROR_OUTCOME.REJECTED;
    case ASSET_ERROR_TYPE.CLIENT_ERROR:
      // 같은 키로 다른 내용을 보낸 충돌은 원래 송금이 실행됐을 수 있으므로 확정 거절로 보지 않는다. 408도 마찬가지다.
      if (
        error?.code === IDEMPOTENCY_KEY_CONFLICT_CODE ||
        error?.status === REQUEST_TIMEOUT_STATUS
      ) {
        return TRANSFER_ERROR_OUTCOME.UNCERTAIN;
      }
      return TRANSFER_ERROR_OUTCOME.REJECTED;
    default: // NETWORK, TIMEOUT, SERVER(5xx), INVALID_RESPONSE, CANCELED, UNKNOWN
      return TRANSFER_ERROR_OUTCOME.UNCERTAIN;
  }
};

// 화면 안내(문구는 정적이며 서버 message를 쓰지 않는다). tone: success | progress | failure | reversed | unknown | blocked
const OUTCOME_NOTICE = Object.freeze({
  [TRANSFER_OUTCOME.COMPLETED]: {
    tone: 'success',
    title: '완료',
    message: '송금이 완료됐어요.',
  },
  [TRANSFER_OUTCOME.IN_PROGRESS]: {
    tone: 'progress',
    title: '처리 중',
    message:
      '송금을 처리하고 있어요. 아직 완료되지 않았어요. 잠시 후 "같은 요청 다시 확인"으로 결과를 확인해 주세요.',
  },
  [TRANSFER_OUTCOME.FAILED]: {
    tone: 'failure',
    title: '송금 실패',
    message: '송금이 실패했어요. 출금되지 않았어요.',
  },
  [TRANSFER_OUTCOME.REVERSED]: {
    tone: 'reversed',
    title: '송금 취소됨',
    message: '송금 후 반전(취소)된 거래예요. 출금 내역을 확인해 주세요.',
  },
});

const UNCERTAIN_NOTICE = Object.freeze({
  tone: 'unknown',
  title: '결과를 확인할 수 없어요',
  message:
    '송금이 처리됐는지 확인하지 못했어요. 중복 송금을 막기 위해 새 송금은 보낼 수 없어요. "같은 요청 다시 확인"으로 결과를 확인해 주세요.',
});

const BLOCKED_NOTICE = Object.freeze({
  tone: 'blocked',
  title: '확인이 필요한 송금이 있어요',
  message: '이전 송금의 결과를 먼저 확인해 주세요. 확인 전에는 새 송금을 보낼 수 없어요.',
});

export const describeTransferOutcome = outcome => OUTCOME_NOTICE[outcome] ?? null;
export const describeUncertainTransfer = () => UNCERTAIN_NOTICE;
export const describeBlockedTransfer = () => BLOCKED_NOTICE;

// 미확정 송금(pendingTransfer)을 화면 안내로 바꾼다. lastStatus: ACCEPTED | PROCESSING | UNKNOWN
export const describePendingTransfer = pending => {
  if (!pending) return null;
  return pending.lastStatus === 'UNKNOWN'
    ? UNCERTAIN_NOTICE
    : OUTCOME_NOTICE[TRANSFER_OUTCOME.IN_PROGRESS];
};

// 입금 정보 입력 검증. 계좌번호는 숫자만(앞자리 0 보존을 위해 문자열), 은행 코드는 비어 있지 않은 숫자 문자열.
// 서버는 두 값을 @NotBlank로만 검사한다. 앱이 허용 은행 목록을 만들지 않는다.
export const sanitizeDigits = value =>
  typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';

export const isValidDepositInput = ({ depositBankCode, depositAccountNumber }) =>
  typeof depositBankCode === 'string' &&
  /^[0-9]{1,20}$/.test(depositBankCode) &&
  typeof depositAccountNumber === 'string' &&
  /^[0-9]{1,100}$/.test(depositAccountNumber);
