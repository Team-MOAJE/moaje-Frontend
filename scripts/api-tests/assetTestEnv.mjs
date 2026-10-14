// Banking·Asset API 테스트 공통 환경 (모의 Gateway, 실제 서버 호출 없음). 각 테스트 파일이 맨 위에서 import한다.
// 토큰·id는 모의 서버 전용 가짜 값이다.
import { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { MockGateway } from './mockGateway.mjs';

// ── 실제 서버 미호출 검증용 감시 ─────────────────────────────
export const everRequested = [];

const hostOf = target => {
  if (typeof target === 'string') return new URL(target).hostname;
  if (target instanceof URL) return target.hostname;
  return target?.hostname ?? target?.host ?? null;
};

const installRequestSpy = (mod, protocol) => {
  const original = mod.request;
  mod.request = function spiedRequest(...args) {
    everRequested.push({ protocol, host: hostOf(args[0]) });
    return original.apply(this, args);
  };
};

installRequestSpy(http, 'http');
installRequestSpy(https, 'https');

// ── 환경 ─────────────────────────────────────────────────────
export const gateway = new MockGateway();
const baseURL = await gateway.listen();

process.env.EXPO_PUBLIC_API_BASE_URL = baseURL;
process.env.EXPO_PUBLIC_API_TIMEOUT = '300';

export const tokenService = await import('../../src/services/tokenService.js');

after(async () => {
  await gateway.close();
});

beforeEach(async () => {
  gateway.reset();
  await tokenService.clearTokens();
  gateway.validTokens.add('valid');
  await tokenService.setTokens('valid', 'refresh-0');
});

// JS Number로는 정확히 표현할 수 없는 크기의 TSID id (19자리). Number(...)는 반올림된다.
export const BIG_ACCOUNT_ID = '1234567890123456789';
export const BIG_TX_ID = '1234567890123456701';
export const BIG_CURSOR = '1234567890123456650';

export const rejectionOf = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('요청이 실패해야 하는데 성공했습니다.');
};

export const jsonRoute =
  (body, extra = {}) =>
  () => ({ body, ...extra });

// 큰 정수 리터럴을 보존한 원문 응답(JSON.stringify는 큰 수를 잃으므로 문자열로 조립한다).
export const rawJsonRoute =
  (rawBody, extra = {}) =>
  () => ({ rawBody, ...extra });
