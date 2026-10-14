import * as Clipboard from 'expo-clipboard';

// 텍스트를 클립보드에 복사한다. 성공하면 true, 값이 없거나 복사에 실패하면 false(예외를 던지지 않는다).
// 복사할 값은 호출부가 결정한다(계좌번호는 getCopyableAccountNumber의 서버 원문). 이 함수는 값을 변형하거나 기록하지 않는다.
export const copyTextToClipboard = async text => {
  if (typeof text !== 'string' || text === '') return false;
  try {
    const result = await Clipboard.setStringAsync(text);
    return result !== false;
  } catch {
    return false;
  }
};
