// 큰 정수(JS 안전 정수 범위 초과)를 잃지 않고 JSON을 파싱하는 작은 도구. 외부 라이브러리 없음.
//
// 서버(Work)의 TSID id(예: 알림 id)는 JSON 숫자로 내려오며 2^53을 넘는다. JSON.parse는 이를 반올림하므로
// 그 값을 경로에 다시 쓰면(API-27) 엉뚱한 알림을 가리키게 된다. 이 모듈은 문자열 리터럴 바깥의 "정수 토큰"
// 중 안전 정수 범위를 넘을 수 있는 것(16자리 이상)을 JSON 문자열로 감싼 뒤 JSON.parse한다.
// 소수·지수 표기 숫자와 15자리 이하 정수는 그대로 숫자로 둔다.
//
// 사용: axios 요청별 transformResponse로만 쓴다(전역 apiClient 변경 없음).
const MIN_PROTECTED_DIGITS = 16;

const isDigit = char => char >= '0' && char <= '9';

// JSON 텍스트에서 16자리 이상 정수 토큰을 따옴표로 감싼다. 문자열 리터럴 안은 건드리지 않는다.
export const quoteLargeIntegers = text => {
  let result = '';
  let index = 0;
  const length = text.length;

  while (index < length) {
    const char = text[index];

    if (char === '"') {
      // 문자열 리터럴 전체를 그대로 복사한다(이스케이프 처리).
      let end = index + 1;
      while (end < length) {
        if (text[end] === '\\') end += 2;
        else if (text[end] === '"') break;
        else end += 1;
      }
      result += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    if (char === '-' || isDigit(char)) {
      let end = index + (char === '-' ? 1 : 0);
      const digitsStart = end;
      while (end < length && isDigit(text[end])) end += 1;
      const digits = end - digitsStart;
      const isInteger = text[end] !== '.' && text[end] !== 'e' && text[end] !== 'E';

      if (isInteger && digits >= MIN_PROTECTED_DIGITS) {
        result += `"${text.slice(index, end)}"`;
        index = end;
        continue;
      }

      // 소수·지수 숫자는 끝까지 그대로 복사한다.
      while (end < length && /[0-9.eE+-]/.test(text[end])) end += 1;
      result += text.slice(index, end);
      index = end;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
};

// quoteLargeIntegers 후 JSON.parse. 파싱에 실패하면 던진다.
export const parseLosslessJson = text => JSON.parse(quoteLargeIntegers(text));

// axios transformResponse 용. 문자열이 아니면(이미 파싱됨 등) 그대로 돌려주고, JSON이 아니면 원문을 유지한다
// (axios 기본 동작과 같게 오류 본문 파싱 실패가 요청 실패 원인을 가리지 않도록 한다).
export const losslessTransformResponse = data => {
  if (typeof data !== 'string' || data === '') return data;
  try {
    return parseLosslessJson(data);
  } catch {
    return data;
  }
};
