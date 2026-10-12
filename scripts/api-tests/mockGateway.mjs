// 테스트용 모의 Gateway (node:http). 실제 서버 데이터를 변경하지 않는다.
// 응답 형태는 명세 PDF와 로컬 Gateway 실측값을 따른다:
// - 토큰 없음 → 401 {"code":"UNAUTHENTICATED"}, 무효 토큰 → 401 {"code":"INVALID_TOKEN"}
// - Auth → envelope, Banking·Asset·Work → 객체/배열 직접 반환
import http from 'node:http';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const authEnvelope = (
  data,
  { success = true, status = 200, code, message, error } = {}
) => ({
  success,
  status,
  code: code ?? (success ? 'AUTH-200-000' : 'AUTH-400-000'),
  message: message ?? (success ? '성공' : '실패'),
  data: success ? data : null,
  error: success ? null : (error ?? { reason: 'test', details: [], requiredAction: 'NONE' }),
  traceId: 'trace-envelope',
  timestamp: '2026-10-12T00:00:00Z',
});

export class MockGateway {
  constructor() {
    this.server = http.createServer((req, res) => this.#handle(req, res));
    this.reset();
  }

  reset() {
    this.requests = [];
    this.refreshCount = 0;
    this.validTokens = new Set();
    this.tokenSeq = 0;
    // refresh 동작: 'ok' | 'reject' | 'network'
    this.refreshMode = 'ok';
    this.refreshDelay = 50;
    this.rotateRefreshToken = true;
    // 설정하면 /refresh 응답을 대신 만든다: ({ record, gateway }) => { status, body, ... }
    // (Refresh Token 폐기·회전을 서버처럼 모사하는 테스트용. 기본 null = 기존 동작)
    this.refreshOverride = null;
    // 새 토큰도 거부(무한 재시도 방지 검증용)
    this.rejectAllTokens = false;
    // path → (ctx) => { status, body, headers, delay, rawBody }
    this.routes = new Map();
  }

  route(method, path, handler) {
    this.routes.set(`${method.toUpperCase()} ${path}`, handler);
  }

  requestsTo(path) {
    return this.requests.filter(r => r.path === path);
  }

  async listen() {
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.baseURL = `http://127.0.0.1:${this.server.address().port}`;
    return this.baseURL;
  }

  async close() {
    this.server.closeAllConnections?.();
    await new Promise(resolve => this.server.close(resolve));
  }

  async #handle(req, res) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawText = Buffer.concat(chunks).toString('utf8');
    const path = req.url.split('?')[0];
    const record = {
      method: req.method,
      path,
      headers: { ...req.headers },
      body: rawText ? JSON.parse(rawText) : undefined,
    };
    this.requests.push(record);

    const send = async ({
      status = 200,
      body,
      headers = {},
      delay = 0,
      rawBody,
      destroy = false,
    }) => {
      if (delay) await sleep(delay);
      if (destroy) {
        req.socket.destroy(); // 연결 끊김 모사
        return;
      }
      if (res.destroyed) return;
      const payload = rawBody ?? (body === undefined ? '' : JSON.stringify(body));
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'X-Trace-Id': 'trace-header',
        ...headers,
      });
      res.end(payload);
    };

    if (req.method === 'POST' && path === '/api/v1/auth/refresh') {
      this.refreshCount += 1;
      await sleep(this.refreshDelay);

      if (this.refreshOverride) {
        return send((await this.refreshOverride({ record, gateway: this })) ?? {});
      }

      if (this.refreshMode === 'network') {
        req.socket.destroy();
        return;
      }

      if (this.refreshMode === 'reject') {
        return send({
          status: 401,
          body: authEnvelope(null, {
            success: false,
            status: 401,
            code: 'AUTH-401-005',
            message: '다시 로그인해 주세요.',
            error: { reason: 'Invalid refresh token', details: [], requiredAction: 'RE_LOGIN' },
          }),
        });
      }

      this.tokenSeq += 1;
      const accessToken = `access-${this.tokenSeq}`;
      this.validTokens.add(accessToken);
      return send({
        body: authEnvelope(
          {
            access_token: accessToken,
            refresh_token: this.rotateRefreshToken ? `refresh-${this.tokenSeq}` : null,
            token_type: 'bearer',
            expires_in: 1800,
            onboarding_completed: null,
          },
          { code: 'AUTH-200-002' }
        ),
      });
    }

    const handler = this.routes.get(`${req.method} ${path}`);

    if (!handler) {
      return send({ status: 401, body: { code: 'UNAUTHENTICATED' } });
    }

    const result = (await handler({ record, gateway: this })) ?? {};

    if (!result.public) {
      // 응답 직전(지연 이후)에 토큰을 검사해 "뒤늦은 401"을 재현한다.
      if (result.delay) {
        await sleep(result.delay);
        result.delay = 0;
      }
      const auth = req.headers.authorization;
      if (!auth) {
        return send({ status: 401, body: { code: 'UNAUTHENTICATED' } });
      }
      const token = auth.replace(/^Bearer /, '');
      if (this.rejectAllTokens || !this.validTokens.has(token)) {
        return send({ status: 401, body: { code: 'INVALID_TOKEN' } });
      }
    }

    return send(result);
  }
}
