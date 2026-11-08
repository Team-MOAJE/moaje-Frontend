// 추가 시연 계정 2개(MOAJE 시연 2/3) + Mock 거래 생성·검증 스크립트 (로컬 개발 전용).
// 기존 백엔드 Fixture API(mock-banking :8081)와 Gateway API만 사용한다. 백엔드/앱 코드는 변경하지 않는다.
// 기존 시연 계정(.demo-account.local.json)은 로그인 + GET 으로 읽기만 하며 어떤 쓰기 요청도 보내지 않는다.
// 실행: npm run seed:demo:extra   (상태 파일이 있으면 재사용/이어하기, 같은 fixtureRunId라 중복 생성 없음)
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.SEED_GATEWAY_URL || 'http://localhost:8080';
const MOCK = process.env.SEED_MOCK_BANKING_URL || 'http://localhost:8081';
const FIXTURE_TOKEN = process.env.SEED_FIXTURE_TOKEN || 'moaje-local-fixture-token';
const DIR = dirname(fileURLToPath(import.meta.url));
const EXISTING_FILE = join(DIR, '.demo-account.local.json'); // 읽기 전용
const PERSONAS = ['BALANCED_STUDENT', 'CAFE_AND_DINING', 'COMMUTER', 'STUDY_FOCUSED'];
const MONTHS = 3;
const BANK_CODE = '001';
const PIN = '123456';
const INITIAL_BALANCE = 5_000_000;
// Fixture 규칙(TestFixtureService)에서 계산한 기대값: 월 8건 × 4유형, 월 합계 764,000원
const EXPECTED_PER_ACCOUNT = PERSONAS.length * 8 * MONTHS; // 96
const EXPECTED_MONTH_EXPENSE = 764_000;
const EXTRA_ACCOUNTS = [
  { file: join(DIR, '.demo-account-2.local.json'), userName: 'MOAJE 시연 2', tag: 'demo2' },
  { file: join(DIR, '.demo-account-3.local.json'), userName: 'MOAJE 시연 3', tag: 'demo3' },
];

// 로컬 개발 환경 전용 가드: 원격 주소로 Fixture/계정 생성을 보내지 않는다.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
for (const url of [GATEWAY, MOCK]) {
  if (!LOCAL_HOSTS.has(new URL(url).hostname) && process.env.SEED_ALLOW_REMOTE !== '1') {
    console.error(`[중단] 로컬 주소가 아닌 대상(${new URL(url).hostname})에는 실행하지 않습니다.`);
    process.exit(1);
  }
}

async function http(method, url, { body, headers = {}, allow = [] } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 비JSON 응답 */
  }
  if (!res.ok && !allow.includes(res.status)) {
    throw new Error(
      `${method} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${res.status} ${text.slice(0, 200)}`
    );
  }
  return { status: res.status, json };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const auth = jwt => ({ Authorization: `Bearer ${jwt}` });
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const saveState = (file, state) => {
  // 임시 파일에 쓴 뒤 rename → 중간에 끊겨도 반쯤 쓰인 상태 파일이 남지 않는다.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
};

async function tryLogin(phone) {
  const r = await http('POST', `${GATEWAY}/api/v1/auth/login`, {
    body: { phone_number: phone, pin: PIN, device_info: 'seed-demo-extra-script' },
    allow: [400, 401, 403, 404, 422],
  });
  return r.status === 200 ? r.json.data.access_token : null;
}

async function login(phone) {
  const jwt = await tryLogin(phone);
  if (!jwt) throw new Error('로그인 실패: 상태 파일의 전화번호/PIN으로 인증할 수 없습니다.');
  return jwt;
}

function pickArray(json) {
  if (Array.isArray(json)) return json;
  const key = Object.keys(json || {}).find(k => Array.isArray(json[k]));
  return key ? json[key] : [];
}

async function fetchAllTransactions(jwt, accountId) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const q = cursor != null ? `?lastTransactionId=${cursor}` : '';
    const r = await http('GET', `${GATEWAY}/api/v1/assets/accounts/${accountId}/transactions${q}`, {
      headers: auth(jwt),
    });
    all.push(...pickArray(r.json));
    if (!r.json.hasNext || r.json.nextCursor == null) return { all, pages: page + 1 };
    cursor = r.json.nextCursor;
  }
  throw new Error('거래내역 페이지가 100페이지를 초과했습니다.');
}

// ---- 기존 계정: 읽기 전용 스냅샷 (로그인 + GET 만) ----
async function snapshotExisting() {
  if (!existsSync(EXISTING_FILE)) return null;
  const s = readJson(EXISTING_FILE);
  const jwt = await tryLogin(s.phoneNumber);
  if (!jwt) return { phoneNumber: s.phoneNumber, accountId: s.accountId, error: '로그인 실패' };
  const list = pickArray(
    (await http('GET', `${GATEWAY}/api/v1/assets/accounts`, { headers: auth(jwt) })).json
  );
  const acc = list.find(a => String(a.accountId) === String(s.accountId));
  const { all } = await fetchAllTransactions(jwt, s.accountId);
  return {
    phoneNumber: s.phoneNumber,
    pin: s.pin,
    accountId: String(s.accountId),
    balance: acc ? acc.balance : null,
    transactionCount: all.length,
  };
}

// ---- 상태 계획 / 등록 / 계좌 생성 (단계별 상태 파일 기록으로 이어하기 가능) ----
function usedPhones() {
  const phones = new Set();
  for (const f of [EXISTING_FILE, ...EXTRA_ACCOUNTS.map(a => a.file)]) {
    if (existsSync(f)) {
      try {
        phones.add(readJson(f).phoneNumber);
      } catch {
        /* 손상된 파일은 무시 */
      }
    }
  }
  return phones;
}

function newPhone(used) {
  for (;;) {
    const p = `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    if (!used.has(p)) return p;
  }
}

function planState(def) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return {
    stage: 'planned', // planned → registered → account_created → seeded
    phoneNumber: newPhone(usedPhones()),
    pin: PIN,
    userName: def.userName,
    ownerCi: `TEST-CI-${def.tag.toUpperCase()}-${suffix}`,
    productName: `Demo Account ${def.tag}-${suffix}`,
    runIdPrefix: `${def.tag}-${suffix}`,
    accountId: null,
  };
}

async function ensureRegistered(def, state) {
  if (state.stage !== 'planned') return;
  // 이전 실행이 등록 직후 중단됐을 수 있으므로 먼저 로그인으로 복구를 시도한다.
  if (await tryLogin(state.phoneNumber)) {
    state.stage = 'registered';
    saveState(def.file, state);
    console.log(`[${def.userName}] 이미 등록된 계정 → 로그인으로 복구`);
    return;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const r = await http('POST', `${GATEWAY}/api/v1/auth/register`, {
      body: {
        phone_number: state.phoneNumber,
        name: state.userName,
        pin: PIN,
        pin_confirm: PIN,
        terms_agreed: true,
        privacy_agreed: true,
        terms_version: 'local-test-v1',
        privacy_version: 'local-test-v1',
      },
      allow: [409],
    });
    if (r.status !== 409) {
      state.stage = 'registered';
      saveState(def.file, state);
      return;
    }
    // 번호 중복: 다른 사용자의 번호이므로(로그인 불가) 새 번호를 상태 파일에 먼저 기록한 뒤 재시도
    state.phoneNumber = newPhone(usedPhones());
    saveState(def.file, state);
  }
  throw new Error('전화번호 중복으로 5회 내에 등록하지 못했습니다.');
}

async function ensureBankAccount(def, state, jwt) {
  if (state.accountId) return;
  // 계좌 중복 생성 방지: 이미 Asset에 보이는 계좌가 있으면 그것을 채택한다.
  const list = pickArray(
    (await http('GET', `${GATEWAY}/api/v1/assets/accounts`, { headers: auth(jwt) })).json
  );
  const existing = list.find(a => a.bankCode === BANK_CODE);
  if (existing) {
    state.accountId = String(existing.accountId);
  } else {
    const acc = await http('POST', `${GATEWAY}/api/v1/banking/accounts`, {
      headers: auth(jwt),
      body: {
        ci: state.ownerCi,
        userName: state.userName,
        phoneNumber: state.phoneNumber,
        bankCode: BANK_CODE,
        bankName: '테스트 은행',
        productName: state.productName,
        initialBalance: INITIAL_BALANCE,
      },
    });
    state.accountId = String(acc.json.accountId);
  }
  state.stage = 'account_created';
  saveState(def.file, state);
}

async function runFixtures(state) {
  let created = 0;
  let skipped = 0;
  let months = [];
  for (const persona of PERSONAS) {
    const r = await http('POST', `${MOCK}/internal/test-fixtures/personas`, {
      headers: { 'X-Fixture-Token': FIXTURE_TOKEN },
      body: {
        fixtureRunId: `${state.runIdPrefix}-${persona}`,
        ownerCi: state.ownerCi,
        bankCode: BANK_CODE,
        productName: state.productName,
        persona,
        months: MONTHS,
      },
    });
    created += r.json.createdTransactionCount;
    skipped += r.json.skippedTransactionCount;
    months = r.json.months;
  }
  return { created, skipped, months };
}

async function waitAssetAndRefresh(jwt, accountId) {
  let ready = false;
  for (let i = 0; i < 20 && !ready; i += 1) {
    const d = await http('GET', `${GATEWAY}/api/v1/assets/accounts/${accountId}/detail`, {
      headers: auth(jwt),
      allow: [404, 500, 400],
    });
    ready = d.status === 200;
    if (!ready) await sleep(1000);
  }
  if (!ready) throw new Error('Asset 계좌가 20초 내에 생성되지 않았습니다.');
  // cashflow 집계는 캐시되므로 모든 Fixture 실행 후 본인 계좌만 refresh 한다.
  await http('POST', `${GATEWAY}/api/v1/assets/accounts/${accountId}/refresh`, {
    headers: auth(jwt),
  });
}

// 새로고침 직후 Asset 이 거래를 다 가져오기까지 짧게 폴링
async function fetchWhenSynced(jwt, accountId, expected) {
  let result;
  for (let i = 0; i < 15; i += 1) {
    result = await fetchAllTransactions(jwt, accountId);
    const withdrawals = result.all.filter(t => t.type === 'WITHDRAW' || t.type === 'WITHDRAWAL');
    if (withdrawals.length >= expected) return result;
    await sleep(1500);
  }
  return result;
}

async function verifyAccount(def, state, jwt, fx, others) {
  const checks = [];
  const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

  const me = await http('GET', `${GATEWAY}/api/v1/auth/me`, { headers: auth(jwt) });
  check(
    'GET /auth/me',
    me.status === 200 && me.json?.data?.name === state.userName,
    `name=${me.json?.data?.name}`
  );

  const list = pickArray(
    (await http('GET', `${GATEWAY}/api/v1/assets/accounts`, { headers: auth(jwt) })).json
  );
  const ids = list.map(a => String(a.accountId));
  check(
    '본인 계좌만 조회',
    ids.includes(state.accountId) && ids.length === 1,
    `계좌 ${ids.length}개`
  );
  check(
    '타 계정 accountId 미노출',
    others.every(o => !ids.includes(String(o.accountId))),
    ''
  );

  const detail = (
    await http('GET', `${GATEWAY}/api/v1/assets/accounts/${state.accountId}/detail`, {
      headers: auth(jwt),
    })
  ).json;
  const { all, pages } = await fetchWhenSynced(jwt, state.accountId, EXPECTED_PER_ACCOUNT);
  const withdrawals = all.filter(t => t.type === 'WITHDRAW' || t.type === 'WITHDRAWAL');
  const uniqueIds = new Set(all.map(t => String(t.transactionId)));
  const sum = withdrawals.reduce((s, t) => s + Number(t.amount), 0);
  const expectedSum = EXPECTED_MONTH_EXPENSE * MONTHS;
  check(
    '거래 건수 96건 (페이지 순회)',
    all.length === EXPECTED_PER_ACCOUNT,
    `${all.length}건/${pages}페이지`
  );
  check('거래 ID 중복 없음', uniqueIds.size === all.length, `고유 ${uniqueIds.size}`);
  check('거래 합계', sum === expectedSum, `${sum} (기대 ${expectedSum})`);
  check(
    '잔액 = 초기잔액 - 거래합계',
    Number(detail.balance) === INITIAL_BALANCE - sum,
    `잔액 ${detail.balance} (기대 ${INITIAL_BALANCE - sum})`
  );

  const perMonth = {};
  for (const t of withdrawals) {
    const ym = String(t.createdAt).slice(0, 7);
    perMonth[ym] = perMonth[ym] || { count: 0, sum: 0 };
    perMonth[ym].count += 1;
    perMonth[ym].sum += Number(t.amount);
  }

  const cashflow = [];
  for (const ym of fx.months) {
    let monthly;
    let cat;
    for (let i = 0; i < 5; i += 1) {
      monthly = (
        await http('GET', `${GATEWAY}/api/v1/assets/cashflow/monthly?yearMonth=${ym}`, {
          headers: auth(jwt),
        })
      ).json;
      cat = (
        await http('GET', `${GATEWAY}/api/v1/assets/cashflow/category?yearMonth=${ym}`, {
          headers: auth(jwt),
        })
      ).json;
      if (monthly.expenseAmount > 0) break;
      await sleep(1500);
    }
    const catSum = cat.categories.reduce((s, c) => s + Number(c.amount), 0);
    check(
      `${ym} 월별=카테고리 합계, 기대 ${EXPECTED_MONTH_EXPENSE}`,
      Number(monthly.expenseAmount) === catSum && catSum === EXPECTED_MONTH_EXPENSE,
      `월별 ${monthly.expenseAmount} / 카테고리 ${catSum}`
    );
    check(
      `${ym} 거래목록 합계=월별 지출`,
      (perMonth[ym]?.sum ?? 0) === Number(monthly.expenseAmount),
      `거래 ${perMonth[ym]?.count ?? 0}건`
    );
    cashflow.push({
      yearMonth: ym,
      count: perMonth[ym]?.count ?? 0,
      expense: monthly.expenseAmount,
      categories: Object.fromEntries(
        cat.categories.filter(c => Number(c.amount) > 0).map(c => [c.category, c.amount])
      ),
    });
  }

  // 계정 간 접근 차단: 다른 계정의 accountId 는 detail/transactions 모두 200 이면 안 된다.
  for (const o of others) {
    for (const path of ['detail', 'transactions']) {
      const r = await http('GET', `${GATEWAY}/api/v1/assets/accounts/${o.accountId}/${path}`, {
        headers: auth(jwt),
        allow: [400, 401, 403, 404, 500],
      });
      check(`타 계정(${o.label}) ${path} 접근 차단`, r.status !== 200, `HTTP ${r.status}`);
    }
  }

  return { balance: detail.balance, total: all.length, cashflow, checks };
}

async function processAccount(def, others) {
  let state;
  let reused = false;
  if (existsSync(def.file)) {
    state = readJson(def.file);
    reused = true;
    console.log(`\n[${def.userName}] 저장된 상태 파일 재사용 (stage=${state.stage ?? 'seeded'})`);
  } else {
    state = planState(def);
    saveState(def.file, state); // 등록 요청 전에 전화번호·식별자를 먼저 기록
    console.log(`\n[${def.userName}] 새 계정 계획을 상태 파일에 기록`);
  }
  if (!state.stage) state.stage = state.accountId ? 'account_created' : 'registered';

  await ensureRegistered(def, state);
  const jwt = await login(state.phoneNumber);
  await ensureBankAccount(def, state, jwt);

  const fx = await runFixtures(state);
  console.log(`[Fixture] created=${fx.created} skipped=${fx.skipped}`);
  await waitAssetAndRefresh(jwt, state.accountId);
  if (state.stage !== 'seeded') {
    state.stage = 'seeded';
    saveState(def.file, state);
  }
  const result = await verifyAccount(def, state, jwt, fx, others);
  return { def, state, reused, fx, result };
}

async function main() {
  const before = await snapshotExisting();
  console.log(
    '[기존 계정 작업 전]',
    before ? JSON.stringify({ ...before, pin: undefined }) : '상태 파일 없음'
  );

  const outputs = [];
  for (let i = 0; i < EXTRA_ACCOUNTS.length; i += 1) {
    const def = EXTRA_ACCOUNTS[i];
    // 교차 접근 검증 대상: 기존 계정 + 다른 신규 계정(이미 계좌가 있는 경우)
    const others = [];
    if (before?.accountId) others.push({ label: '기존 계정', accountId: before.accountId });
    EXTRA_ACCOUNTS.forEach((o, j) => {
      if (j !== i && existsSync(o.file)) {
        const s = readJson(o.file);
        if (s.accountId) others.push({ label: o.userName, accountId: s.accountId });
      }
    });
    outputs.push(await processAccount(def, others));
  }

  // 먼저 만든 계정은 나중에 생긴 계정 accountId 에 대한 교차 접근도 확인한다.
  const first = outputs[0];
  const second = outputs[1];
  if (first && second) {
    const jwt = await login(first.state.phoneNumber);
    for (const path of ['detail', 'transactions']) {
      const r = await http(
        'GET',
        `${GATEWAY}/api/v1/assets/accounts/${second.state.accountId}/${path}`,
        {
          headers: auth(jwt),
          allow: [400, 401, 403, 404, 500],
        }
      );
      first.result.checks.push({
        name: `타 계정(${second.def.userName}) ${path} 접근 차단`,
        pass: r.status !== 200,
        detail: `HTTP ${r.status}`,
      });
    }
  }

  // 멱등성: 같은 Fixture 를 한 번 더 호출하면 모두 skipped, 건수 그대로여야 한다.
  for (const o of outputs) {
    const again = await runFixtures(o.state);
    const jwt = await login(o.state.phoneNumber);
    const { all } = await fetchAllTransactions(jwt, o.state.accountId);
    o.result.checks.push({
      name: '재실행 시 중복 거래 없음',
      pass:
        again.created === 0 &&
        again.skipped === EXPECTED_PER_ACCOUNT &&
        all.length === EXPECTED_PER_ACCOUNT,
      detail: `created=${again.created} skipped=${again.skipped} 거래 ${all.length}건`,
    });
  }

  const after = await snapshotExisting();
  const existingSame =
    !!before &&
    !!after &&
    before.balance === after.balance &&
    before.transactionCount === after.transactionCount;

  let allPass = existingSame;
  for (const o of outputs) {
    console.log(`\n===== ${o.def.userName} (${o.reused ? '재사용' : '신규'}) =====`);
    console.log(`잔액=${o.result.balance} 전체거래=${o.result.total}건`);
    for (const c of o.result.cashflow) console.log('[월별]', JSON.stringify(c));
    for (const c of o.result.checks) {
      console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name} ${c.detail}`);
      if (!c.pass) allPass = false;
    }
  }
  console.log(
    '\n[기존 계정 작업 후]',
    after ? JSON.stringify({ ...after, pin: undefined }) : '상태 파일 없음'
  );
  console.log(`${existingSame ? 'PASS' : 'FAIL'} 기존 계정 잔액·거래 건수 변동 없음`);

  console.log('\n[로그인 정보]');
  if (before)
    console.log(
      `기존 | 전화번호=${before.phoneNumber} PIN=${before.pin} accountId=${before.accountId} 잔액=${after?.balance} 거래=${after?.transactionCount}`
    );
  for (const o of outputs) {
    console.log(
      `${o.def.userName} | 전화번호=${o.state.phoneNumber} PIN=${o.state.pin} accountId=${o.state.accountId} 잔액=${o.result.balance} 거래=${o.result.total}`
    );
  }
  console.log(`\n[결과] ${allPass ? '모든 검증 통과' : '불일치 있음 - 위 FAIL 항목 확인'}`);
  if (!allPass) process.exitCode = 1;
}

main().catch(e => {
  console.error('[실패]', e.message);
  process.exitCode = 1;
});
