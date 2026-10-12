// @react-native-async-storage/async-storage 메모리 스텁 (테스트 전용)
export const __store = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const createControl = () => ({
  delay: { set: 0, get: 0, remove: 0 },
  fail: { set: 0, get: 0, remove: 0 }, // 앞으로 실패할 횟수(Infinity = 계속 실패)
  log: [],
});

export const __control = createControl();

export const __resetControl = () => {
  Object.assign(__control, createControl());
};

const run = async (op, key, action) => {
  __control.log.push(`${op}:${key}:start`);

  if (__control.delay[op]) await sleep(__control.delay[op]);

  if (__control.fail[op] > 0) {
    __control.fail[op] -= 1;
    __control.log.push(`${op}:${key}:fail`);
    throw new Error(`AsyncStorage stub: ${op} failed`);
  }

  const result = action();
  __control.log.push(`${op}:${key}:end`);
  return result;
};

const AsyncStorage = {
  getItem: key => run('get', key, () => (__store.has(key) ? __store.get(key) : null)),
  setItem: (key, value) =>
    run('set', key, () => {
      __store.set(key, String(value));
    }),
  removeItem: key =>
    run('remove', key, () => {
      __store.delete(key);
    }),
};

export default AsyncStorage;
