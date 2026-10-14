// expo-clipboard 메모리 스텁 (테스트 전용). 실제 클립보드/네이티브 모듈을 쓰지 않는다.
// __clipboard.value: 마지막으로 복사된 문자열, calls: setStringAsync 호출 기록, failNext: 다음 호출을 실패시킨다.
export const __clipboard = { value: null, calls: [], failNext: false, resolveWith: true };

export const __resetClipboard = () => {
  __clipboard.value = null;
  __clipboard.calls = [];
  __clipboard.failNext = false;
  __clipboard.resolveWith = true;
};

export const setStringAsync = async text => {
  __clipboard.calls.push(text);
  if (__clipboard.failNext) {
    __clipboard.failNext = false;
    throw new Error('clipboard unavailable');
  }
  __clipboard.value = text;
  return __clipboard.resolveWith;
};
