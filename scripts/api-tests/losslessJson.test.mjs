// 큰 정수를 잃지 않는 JSON 파서 단위 테스트 (네트워크·서버 없음)
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/losslessJson.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  losslessTransformResponse,
  parseLosslessJson,
  quoteLargeIntegers,
} from '../../src/utils/losslessJson.js';

const BIG = '123456789012345678'; // Number(BIG) === 123456789012345680

test('기본 JSON.parse는 큰 정수를 반올림한다(이 도구가 필요한 이유)', () => {
  assert.notEqual(String(JSON.parse(`{"id":${BIG}}`).id), BIG);
});

test('16자리 이상 정수는 문자열로, 그보다 작은 정수는 숫자로 보존', () => {
  const parsed = parseLosslessJson(
    `{"id":${BIG},"small":123,"edge":1234567890123456,"neg":-${BIG}}`
  );
  assert.equal(parsed.id, BIG);
  assert.equal(parsed.small, 123);
  assert.equal(parsed.edge, '1234567890123456');
  assert.equal(parsed.neg, `-${BIG}`);
});

test('소수·지수 숫자와 문자열 안의 숫자는 건드리지 않는다', () => {
  const parsed = parseLosslessJson(
    `{"d":1234567890123456.5,"e":12345678901234567e2,"s":"id ${BIG} \\" ${BIG}","f":0.5}`
  );
  assert.equal(parsed.d, 1234567890123456.5);
  assert.equal(parsed.e, 12345678901234567e2);
  assert.equal(parsed.s, `id ${BIG} " ${BIG}`);
  assert.equal(parsed.f, 0.5);
});

test('배열·중첩 객체 안의 큰 정수도 보존', () => {
  const parsed = parseLosslessJson(`{"alerts":[{"id":${BIG}},{"id":9007199254740993}],"total":2}`);
  assert.equal(parsed.alerts[0].id, BIG);
  assert.equal(parsed.alerts[1].id, '9007199254740993');
  assert.equal(parsed.total, 2);
});

test('quoteLargeIntegers: 문자열 이스케이프(\\\\) 뒤의 따옴표를 올바르게 처리', () => {
  const text = `{"a":"x\\\\","id":${BIG}}`;
  assert.equal(parseLosslessJson(text).id, BIG);
  assert.equal(quoteLargeIntegers('[1,2]'), '[1,2]');
});

test('losslessTransformResponse: 문자열이 아니면 그대로, 빈 문자열/JSON 아님은 원문 유지', () => {
  const object = { a: 1 };
  assert.equal(losslessTransformResponse(object), object);
  assert.equal(losslessTransformResponse(''), '');
  assert.equal(losslessTransformResponse('<html>'), '<html>');
  assert.equal(losslessTransformResponse(undefined), undefined);
  assert.deepEqual(losslessTransformResponse('{"code":"VALIDATION_ERROR"}'), {
    code: 'VALIDATION_ERROR',
  });
});
