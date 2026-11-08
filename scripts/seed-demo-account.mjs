// 시연용 계정 + Mock 거래 생성 스크립트 (로컬 개발 전용).
// 기존 백엔드 Fixture API(mock-banking :8081)만 사용한다. 백엔드/앱 코드는 변경하지 않는다.
// 실행: npm run seed:demo            (저장된 계정이 있으면 재사용, 같은 fixtureRunId라 중복 생성 없음)
//       npm run seed:demo -- --new   (새 계정 생성)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.SEED_GATEWAY_URL || 'http://localhost:8080';
const MOCK = process.env.SEED_MOCK_BANKING_URL || 'http://localhost:8081';
const FIXTURE_TOKEN = process.env.SEED_FIXTURE_TOKEN || 'moaje-local-fixture-token';
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '.demo-account.local.json');
const PERSONAS = ['BALANCED_STUDENT', 'CAFE_AND_DINING', 'COMMUTER', 'STUDY_FOCUSED'];
const MONTHS = 3;
const BANK_CODE = '001';
const PIN = '123456';

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

async function login(phone) {
  const r = await http('POST', `${GATEWAY}/api/v1/auth/login`, {
    body: { phone_number: phone, pin: PIN, device_info: 'seed-demo-script' },
  });
  return r.json.data.access_token;
}

async function createAccountState() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const phone = `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const state = {
    phoneNumber: phone,
    pin: PIN,
    userName: 'MOAJE 시연',
    ownerCi: `TEST-CI-DEMO-${suffix}`,
    productName: `Demo Account ${suffix}`,
    runIdPrefix: `demo-${suffix}`,
    accountId: null,
  };
  await http('POST', `${GATEWAY}/api/v1/auth/register`, {
    body: {
      phone_number: phone,
      name: state.userName,
      pin: PIN,
      pin_confirm: PIN,
      terms_agreed: true,
      privacy_agreed: true,
      terms_version: 'local-test-v1',
      privacy_version: 'local-test-v1',
    },
  });
  const jwt = await login(phone);
  const acc = await http('POST', `${GATEWAY}/api/v1/banking/accounts`, {
    headers: auth(jwt),
    body: {
      ci: state.ownerCi,
      userName: state.userName,
      phoneNumber: phone,
      bankCode: BANK_CODE,
      bankName: '테스트 은행',
      productName: state.productName,
      initialBalance: 5_000_000,
    },
  });
  state.accountId = String(acc.json.accountId);
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
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

async function main() {
  const forceNew = process.argv.includes('--new');
  let state;
  let reused = false;
  if (!forceNew && existsSync(STATE_FILE)) {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    reused = true;
    console.log('[계정] 저장된 시연 계정 재사용');
  } else {
    state = await createAccountState();
    console.log('[계정] 새 시연 계정 생성');
  }
  const jwt = await login(state.phoneNumber); // 실패 시 새 계정을 임의 생성하지 않고 중단

  let created = 0;
  let skipped = 0;
  let fixtureMonths = [];
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
    fixtureMonths = r.json.months;
    console.log(
      `[Fixture] ${persona}: created=${r.json.createdTransactionCount} skipped=${r.json.skippedTransactionCount}`
    );
  }

  let ready = false;
  for (let i = 0; i < 20 && !ready; i += 1) {
    const d = await http('GET', `${GATEWAY}/api/v1/assets/accounts/${state.accountId}/detail`, {
      headers: auth(jwt),
      allow: [404, 500, 400],
    });
    ready = d.status === 200;
    if (!ready) await sleep(1000);
  }
  if (!ready) throw new Error('Asset 계좌가 20초 내에 생성되지 않았습니다.');
  // cashflow 집계는 캐시되므로 모든 Fixture 실행 후 refresh, 그 다음에 조회한다.
  await http('POST', `${GATEWAY}/api/v1/assets/accounts/${state.accountId}/refresh`, {
    headers: auth(jwt),
  });

  const list = await http('GET', `${GATEWAY}/api/v1/assets/accounts`, { headers: auth(jwt) });
  const accounts = pickArray(list.json);
  const found = accounts.some(a => String(a.accountId) === state.accountId);

  const { all, pages } = await fetchAllTransactions(jwt, state.accountId);
  console.log(
    `\n[거래내역] 계좌목록 포함=${found}, 전체 ${all.length}건 (${pages}페이지 순회), Fixture 응답 created 합계=${created} skipped 합계=${skipped}`
  );
  if (all[0]) console.log('[거래 샘플 키]', Object.keys(all[0]).join(', '));

  const report = [];
  let ok = found && all.length > 0;
  for (const ym of fixtureMonths) {
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
    const match = Number(monthly.expenseAmount) === catSum && catSum > 0;
    ok = ok && match;
    report.push({
      yearMonth: ym,
      expense: monthly.expenseAmount,
      income: monthly.incomeAmount,
      categorySum: catSum,
      match,
      categories: Object.fromEntries(
        cat.categories.filter(c => Number(c.amount) > 0).map(c => [c.category, c.amount])
      ),
    });
  }
  console.log('\n[월별/카테고리 집계]');
  for (const r of report) console.log(JSON.stringify(r));

  console.log(
    '\n[로그인 정보]',
    `전화번호=${state.phoneNumber} PIN=${state.pin} accountId=${state.accountId} (${reused ? '재사용' : '신규'})`
  );
  console.log(
    `[결과] 전체 거래 ${all.length}건 (Fixture created ${created}, skipped ${skipped}), 검증 ${ok ? '통과' : '불일치 있음 - 위 출력 확인'}`
  );
  if (!ok) process.exitCode = 1;
}

main().catch(e => {
  console.error('[실패]', e.message);
  process.exitCode = 1;
});
