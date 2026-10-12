import { v4 as uuidv4 } from 'uuid';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 새 송금 의도마다 한 번 호출한다. 같은 송금의 재시도에는 처음 받은 키를 그대로 다시 전달한다.
export const generateIdempotencyKey = () => uuidv4();

// 클라이언트가 직접 생성한 키(UUID v4)인지 확인용. 키 교체 판단에는 사용하지 않는다.
export const isValidIdempotencyKey = value =>
  typeof value === 'string' && UUID_V4_PATTERN.test(value);

// 명세(API-10)상 Idempotency-Key는 "문자열"이다. 이미 전달된 비어 있지 않은 문자열 키는
// UUID 형식이 아니어도 그대로 유지하고, 키가 없을 때만 새로 만든다.
export const ensureIdempotencyKey = existingKey =>
  typeof existingKey === 'string' && existingKey.trim() !== ''
    ? existingKey
    : generateIdempotencyKey();
