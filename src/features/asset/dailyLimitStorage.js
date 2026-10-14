// API-15(일일 사용 가능 금액) 계산 결과의 로컬 보관소.
// 서버에는 이 결과를 다시 조회하는 API가 없으므로(POST /daily-limit 하나뿐), 정상 계산된 결과만 기기에 보관해
// 같은 사용자·같은 날짜에 앱을 다시 실행했을 때 홈에 복원한다.
//
// 키: @asset:dailyLimit:v1:{userId} — 사용자별로 분리된다. userId는 문자열 그대로 쓴다(Number 변환 금지).
// 보관 값: { version, userId, calculatedOn('YYYY-MM-DD', 기기 로컬 날짜), result(서버 응답 필드), input(사용자 입력) }
// 토큰·PIN·계좌번호·전화번호 등은 보관하지 않는다.
//
// 모든 읽기·쓰기·삭제는 userId별 큐로 직렬화한다. 조건부 삭제(purgeStale)는 큐 안에서 현재 값을 다시 읽어 판단하므로
// 느린 만료 삭제가 그 사이 저장된 새 계산 결과를 지우지 않는다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATE_PATTERN, isFiniteNumber } from './assetResponse';

export const DAILY_LIMIT_RECORD_VERSION = 1;

export const dailyLimitStorageKey = userId =>
  `@asset:dailyLimit:v${DAILY_LIMIT_RECORD_VERSION}:${userId}`;

const isUserId = value => typeof value === 'string' && value !== '';
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDateKey = value => typeof value === 'string' && DATE_PATTERN.test(value);

const RESULT_AMOUNT_FIELDS = [
  'currentBalance',
  'expectedIncome',
  'fixedExpenses',
  'eventBuffer',
  'dailyLimit',
];
const INPUT_NUMBER_FIELDS = [
  'daysUntilNextPayday',
  'expectedIncome',
  'fixedExpenses',
  'eventBuffer',
];

// 서버 응답(mapDailyLimitResponse 결과) 형태를 확인하고 필요한 필드만 복사한다. 맞지 않으면 null.
const normalizeResult = result => {
  if (!isPlainObject(result)) return null;
  const normalized = {};
  for (const field of RESULT_AMOUNT_FIELDS) {
    if (!isFiniteNumber(result[field])) return null;
    normalized[field] = result[field];
  }
  if (!Number.isSafeInteger(result.daysUntilNextPayday) || result.daysUntilNextPayday < 1) {
    return null;
  }
  if (!isDateKey(result.snapshotDate)) return null;
  normalized.daysUntilNextPayday = result.daysUntilNextPayday;
  normalized.snapshotDate = result.snapshotDate;
  return normalized;
};

// 사용자 입력은 화면 복원용 보조 값이다. 형식이 틀린 필드는 버리고 나머지만 남긴다(없으면 null).
const normalizeInput = input => {
  if (!isPlainObject(input)) return null;
  const normalized = {};
  for (const field of INPUT_NUMBER_FIELDS) {
    if (Number.isSafeInteger(input[field]) && input[field] >= 0) normalized[field] = input[field];
  }
  return normalized.daysUntilNextPayday >= 1 ? normalized : null;
};

// 보관 값 문자열을 검증된 레코드로 바꾼다. 손상·버전/사용자 불일치면 null(예외 없음).
const parseRecord = (raw, userId) => {
  if (typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (parsed.version !== DAILY_LIMIT_RECORD_VERSION) return null;
  if (parsed.userId !== userId) return null;
  if (!isDateKey(parsed.calculatedOn)) return null;
  const result = normalizeResult(parsed.result);
  if (!result) return null;
  return {
    userId,
    calculatedOn: parsed.calculatedOn,
    result,
    input: normalizeInput(parsed.input),
  };
};

const queues = new Map();

const enqueue = (userId, task) => {
  const tail = queues.get(userId) ?? Promise.resolve();
  const run = tail.then(task, task);
  queues.set(
    userId,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
};

// 정상 계산된 결과를 저장한다. 형식이 틀리면 저장하지 않고 예외를 던진다.
export const saveDailyLimitRecord = (userId, { calculatedOn, result, input }) =>
  enqueue(userId, async () => {
    if (!isUserId(userId) || !isDateKey(calculatedOn)) {
      throw new Error('dailyLimit 기록 형식이 올바르지 않습니다.');
    }
    const normalizedResult = normalizeResult(result);
    if (!normalizedResult) throw new Error('dailyLimit 기록 형식이 올바르지 않습니다.');
    await AsyncStorage.setItem(
      dailyLimitStorageKey(userId),
      JSON.stringify({
        version: DAILY_LIMIT_RECORD_VERSION,
        userId,
        calculatedOn,
        result: normalizedResult,
        input: normalizeInput(input),
      })
    );
  });

// 저장된 레코드 또는 null. 손상된 값은 null로 보되 여기서 지우지 않는다(읽기 자체의 실패는 예외로 전달).
export const loadDailyLimitRecord = userId => {
  if (!isUserId(userId)) return Promise.resolve(null);
  return enqueue(userId, async () => {
    const raw = await AsyncStorage.getItem(dailyLimitStorageKey(userId));
    return parseRecord(raw, userId);
  });
};

// 이 사용자의 기록을 무조건 삭제한다(회원 탈퇴 성공 시).
export const removeDailyLimitRecord = userId => {
  if (!isUserId(userId)) return Promise.resolve();
  return enqueue(userId, () => AsyncStorage.removeItem(dailyLimitStorageKey(userId)));
};

// 오늘(today) 계산분이 아닌 기록만 삭제한다. 큐 안에서 현재 값을 다시 읽으므로 그 사이 저장된 오늘 결과는 지키고,
// 읽을 수 없는(손상) 값은 정리한다.
export const purgeStaleDailyLimitRecord = (userId, today) => {
  if (!isUserId(userId) || !isDateKey(today)) return Promise.resolve();
  return enqueue(userId, async () => {
    const key = dailyLimitStorageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (raw === null || raw === undefined) return;
    const record = parseRecord(raw, userId);
    if (record && record.calculatedOn === today) return;
    await AsyncStorage.removeItem(key);
  });
};

// 회원 탈퇴 성공 직후 호출하는 삭제. 실패해도 예외를 던지지 않아 인증 정리·화면 전환을 막지 않는다.
// 진단 로그에는 사용자 ID·금액 등을 남기지 않는다.
export const removeDailyLimitRecordSafely = async userId => {
  try {
    await removeDailyLimitRecord(userId);
    return true;
  } catch (error) {
    console.warn('[dailyLimit] 회원 탈퇴 후 로컬 계산 기록 삭제에 실패했습니다.', {
      errorName: error?.name ?? 'Error',
    });
    return false;
  }
};
