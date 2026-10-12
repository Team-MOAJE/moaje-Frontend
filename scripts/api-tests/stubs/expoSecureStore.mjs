// expo-secure-store 메모리 스텁 (테스트 전용)
// 경합 테스트용 제어 훅: 지연(delay)·실패(fail)·정지(stall)·호출 순서 기록(log)
export const __store = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const createControl = () => ({
  // 연산별 지연(ms)
  delay: { set: 0, get: 0, delete: 0 },
  // 연산별 앞으로 실패할 횟수(Infinity = 계속 실패)
  fail: { set: 0, get: 0, delete: 0 },
  // 연산별 정지 게이트(Promise). resolve되기 전까지 해당 연산이 멈춘다(네이티브 호출 정지 모사).
  stall: { set: null, get: null, delete: null },
  // 'op:key:start|end|fail' 기록
  log: [],
});

export const __control = createControl();

export const __resetControl = () => {
  Object.assign(__control, createControl());
};

// stall 게이트 생성 도우미: { gate, release }
export const __createGate = () => {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  return { gate, release };
};

const run = async (op, key, action) => {
  __control.log.push(`${op}:${key}:start`);

  const gate = __control.stall[op];
  if (gate) await gate;

  const delay = __control.delay[op];
  if (delay) await sleep(delay);

  if (__control.fail[op] > 0) {
    __control.fail[op] -= 1;
    __control.log.push(`${op}:${key}:fail`);
    throw new Error(`SecureStore stub: ${op} failed`);
  }

  const result = action();
  __control.log.push(`${op}:${key}:end`);
  return result;
};

export const getItemAsync = key =>
  run('get', key, () => (__store.has(key) ? __store.get(key) : null));

export const setItemAsync = (key, value) =>
  run('set', key, () => {
    if (typeof value !== 'string') {
      throw new Error(`SecureStore stub: value for ${key} must be a string`);
    }
    __store.set(key, value);
  });

export const deleteItemAsync = key =>
  run('delete', key, () => {
    __store.delete(key);
  });
