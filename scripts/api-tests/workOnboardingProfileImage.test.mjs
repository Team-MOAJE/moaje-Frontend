// 결과 화면 장식 이미지 저장(사용자별 AsyncStorage) 테스트. 서버 호출 없음, 메모리 AsyncStorage 스텁 사용.
// 이미지 선택은 서버 프로필과 무관하며, 제출 성공이 확인된 경우에만 새로 뽑는다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/workOnboardingProfileImage.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { __store, __control, __resetControl } from './stubs/asyncStorage.mjs';

const storageModule =
  await import('../../src/features/onboarding/adapters/workOnboardingProfileImageStorage.js');
const logic = await import('../../src/features/onboarding/workOnboardingScreenLogic.js');
const { SUBMIT_ERROR_KIND, WorkOnboardingSubmitError } =
  await import('../../src/features/onboarding/adapters/workOnboardingRepository.js');

const { getWorkOnboardingProfileImageStorage, workProfileImageKey, pickRandomItem } = storageModule;
const { RESULT_STATUS, SUBMIT_STATE, loadProfileImageKey, runSubmission } = logic;

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
const UID_A = '9007199254740993'; // Number로 바꾸면 정밀도가 깨지는 값
const UID_B = '9007199254740995';
const at = index => () => (index + 0.5) / KEYS.length; // 결정적 random

beforeEach(() => {
  __store.clear();
  __resetControl();
});

// ── 저장소 ───────────────────────────────────────────────────

test('저장 키는 전용 키이며 userId별로 다르다', () => {
  assert.equal(workProfileImageKey(UID_A), `@financialOnboarding:profileImage:v1:${UID_A}`);
  assert.notEqual(workProfileImageKey(UID_A), workProfileImageKey(UID_B));
});

test('assignNew → load: 저장하고 복원한다(저장소를 새로 얻어도 유지 = 앱 재실행)', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  assert.equal(await storage.load(KEYS), null);
  assert.equal(await storage.assignNew(KEYS, at(2)), 'c');
  assert.equal(await storage.load(KEYS), 'c');
  assert.deepEqual(Object.keys(JSON.parse(__store.get(workProfileImageKey(UID_A)))).sort(), [
    'imageKey',
    'savedAt',
    'version',
  ]);
});

test('사용자 A/B 이미지가 섞이지 않는다(큰 정수 userId)', async () => {
  await getWorkOnboardingProfileImageStorage(UID_A).assignNew(KEYS, at(0));
  await getWorkOnboardingProfileImageStorage(UID_B).assignNew(KEYS, at(5));
  assert.equal(await getWorkOnboardingProfileImageStorage(UID_A).load(KEYS), 'a');
  assert.equal(await getWorkOnboardingProfileImageStorage(UID_B).load(KEYS), 'f');
  assert.equal(__store.size, 2);
});

test('잘못된 userId는 저장소를 만들지 못한다', () => {
  for (const bad of [123, '', 'abc', '12.5', null, undefined]) {
    assert.throws(() => getWorkOnboardingProfileImageStorage(bad));
  }
});

test('손상/미지원/알 수 없는 값은 null이며 삭제하지 않는다', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  const key = workProfileImageKey(UID_A);
  for (const raw of [
    '{not json',
    JSON.stringify({ version: 2, imageKey: 'a' }),
    JSON.stringify({ version: 1, imageKey: 'zzz' }),
    JSON.stringify({ version: 1, imageKey: 3 }),
  ]) {
    __store.set(key, raw);
    assert.equal(await storage.load(KEYS), null);
    assert.equal(__store.get(key), raw);
  }
  assert.ok(!__control.log.some(entry => entry.startsWith('remove:')));
});

test('assignNew 저장 실패 시 오류가 전달되고 기존 값은 그대로', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  await storage.assignNew(KEYS, at(1));
  __control.fail.set = 1;
  await assert.rejects(storage.assignNew(KEYS, at(4)));
  assert.equal(await storage.load(KEYS), 'b');
});

test('ensure는 값이 없을 때만 1회 저장하고 기존 값을 덮어쓰지 않는다', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  assert.equal(await storage.ensure(KEYS, at(3)), 'd');
  assert.equal(await storage.ensure(KEYS, at(0)), 'd');
  assert.equal(await storage.load(KEYS), 'd');
});

test('동시 ensure 호출도 한 값으로 수렴한다(직렬화)', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  const results = await Promise.all([
    storage.ensure(KEYS, at(1)),
    storage.ensure(KEYS, at(4)),
    storage.ensure(KEYS, at(2)),
  ]);
  assert.deepEqual(new Set(results).size, 1);
  assert.equal(await storage.load(KEYS), results[0]);
});

test('다른 AsyncStorage 키는 읽기/쓰기/삭제되지 않는다', async () => {
  const others = {
    '@financialOnboarding:draftServer:v1:1': 'draft',
    '@financialOnboarding:draft:v1:1': 'local-draft',
    '@financialOnboarding:result:v1:1': 'local-result',
  };
  for (const [k, v] of Object.entries(others)) __store.set(k, v);
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  await storage.assignNew(KEYS, at(0));
  await storage.ensure(KEYS, at(1));
  await storage.load(KEYS);
  for (const [k, v] of Object.entries(others)) assert.equal(__store.get(k), v);
  assert.ok(__control.log.every(entry => entry.includes(workProfileImageKey(UID_A))));
});

test('pickRandomItem: 경계값/빈 배열/6개 전체 도달', () => {
  assert.equal(
    pickRandomItem(KEYS, () => 0),
    'a'
  );
  assert.equal(
    pickRandomItem(KEYS, () => 1),
    'f'
  );
  assert.equal(
    pickRandomItem([], () => 0.5),
    null
  );
  assert.equal(new Set(KEYS.map((_, i) => pickRandomItem(KEYS, at(i)))).size, 6);
  assert.equal(logic.pickRandomItem, pickRandomItem);
});

// ── 제출 완료 시 새 이미지 ───────────────────────────────────

const makeActions = () => ({
  prepareSubmission: () => ({ ok: true, payload: [], questions: [] }),
  flushDraft: async () => {},
});

const makeRepository = (userId, submit) => {
  const calls = { cleared: 0, submitted: 0 };
  return {
    calls,
    repository: {
      userId,
      draft: {
        clear: async () => {
          calls.cleared += 1;
        },
      },
      profileImage: getWorkOnboardingProfileImageStorage(userId),
      submitAnswers: async () => {
        calls.submitted += 1;
        return submit();
      },
    },
  };
};

const saved = confirmedBy => async () => ({ status: 'SAVED', confirmedBy });

test('최초 제출 완료(RESPONSE) → 이미지 선택·저장', async () => {
  const { repository } = makeRepository(UID_A, saved('RESPONSE'));
  const result = await runSubmission({
    actions: makeActions(),
    repository,
    imageKeys: KEYS,
    random: at(2),
  });
  assert.equal(result.state, SUBMIT_STATE.COMPLETED);
  assert.equal(result.imageSaved, 'saved');
  assert.equal(await repository.profileImage.load(KEYS), 'c');
});

test('응답 유실 후 RECONCILE 확정도 완료로 보고 이미지를 저장한다', async () => {
  const { repository } = makeRepository(UID_A, saved('RECONCILE'));
  await runSubmission({ actions: makeActions(), repository, imageKeys: KEYS, random: at(5) });
  assert.equal(await repository.profileImage.load(KEYS), 'f');
});

test('재검사 정상 완료 → 새 이미지로 교체', async () => {
  await getWorkOnboardingProfileImageStorage(UID_A).assignNew(KEYS, at(0));
  const { repository } = makeRepository(UID_A, saved('RESPONSE'));
  await runSubmission({ actions: makeActions(), repository, imageKeys: KEYS, random: at(4) });
  assert.equal(await repository.profileImage.load(KEYS), 'e');
});

test('제출 실패/미확인/진행 중/검증 실패에서는 기존 이미지 유지', async () => {
  await getWorkOnboardingProfileImageStorage(UID_A).assignNew(KEYS, at(1));
  const failures = [
    () => {
      throw new WorkOnboardingSubmitError(SUBMIT_ERROR_KIND.SAVE_UNCONFIRMED, 'x', {
        reason: 'CHECK_FAILED',
      });
    },
    () => {
      throw new WorkOnboardingSubmitError(SUBMIT_ERROR_KIND.NOT_COMPLETED, 'x');
    },
    () => {
      throw new WorkOnboardingSubmitError(SUBMIT_ERROR_KIND.IN_PROGRESS, 'x');
    },
    () => {
      throw new Error('server 500');
    },
  ];
  for (const fail of failures) {
    const { repository } = makeRepository(UID_A, fail);
    const result = await runSubmission({
      actions: makeActions(),
      repository,
      imageKeys: KEYS,
      random: at(5),
    });
    assert.notEqual(result.state, SUBMIT_STATE.COMPLETED);
    assert.equal(await repository.profileImage.load(KEYS), 'b');
  }

  const { repository } = makeRepository(UID_A, saved('RESPONSE'));
  const invalid = await runSubmission({
    actions: { ...makeActions(), prepareSubmission: () => ({ ok: false, issue: 'x' }) },
    repository,
    imageKeys: KEYS,
    random: at(5),
  });
  assert.equal(invalid.state, SUBMIT_STATE.SUBMIT_ERROR);
  assert.equal(await repository.profileImage.load(KEYS), 'b');
});

test('재검사 시작/질문 로드만으로는 이미지가 변하지 않는다(저장 호출 자체가 없음)', async () => {
  await getWorkOnboardingProfileImageStorage(UID_A).assignNew(KEYS, at(3));
  __control.log.length = 0;
  const repository = { profileImage: getWorkOnboardingProfileImageStorage(UID_A) };
  // 서버 완료 상태(READY)로 결과를 보는 것은 저장값을 읽기만 한다
  const view = await loadProfileImageKey({
    repository,
    status: RESULT_STATUS.READY,
    imageKeys: KEYS,
    random: at(0),
  });
  assert.equal(view.imageKey, 'd');
  assert.ok(__control.log.every(entry => entry.startsWith('get:')));
});

test('이미지 저장 실패 → 제출은 완료, imageSaved=failed, 기존 이미지 유지', async () => {
  await getWorkOnboardingProfileImageStorage(UID_A).assignNew(KEYS, at(1));
  const { repository, calls } = makeRepository(UID_A, saved('RESPONSE'));
  __control.fail.set = 1;
  const result = await runSubmission({
    actions: makeActions(),
    repository,
    imageKeys: KEYS,
    random: at(4),
  });
  assert.equal(result.state, SUBMIT_STATE.COMPLETED);
  assert.equal(result.imageSaved, 'failed');
  assert.equal(result.draftCleanup, 'cleared');
  assert.equal(calls.cleared, 1);
  assert.equal(await repository.profileImage.load(KEYS), 'b');
});

test('Draft 정리 실패와 이미지 저장은 서로 독립', async () => {
  const { repository } = makeRepository(UID_A, saved('RESPONSE'));
  repository.draft.clear = async () => {
    throw new Error('clear failed');
  };
  const result = await runSubmission({
    actions: makeActions(),
    repository,
    imageKeys: KEYS,
    random: at(2),
  });
  assert.equal(result.draftCleanup, 'failed');
  assert.equal(result.imageSaved, 'saved');
});

// ── 결과 화면 로딩 ───────────────────────────────────────────

test('결과: 저장값이 있으면 그대로, 서버 완료 상태만으로 새로 뽑지 않는다', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  await storage.assignNew(KEYS, at(2));
  for (let i = 0; i < 3; i += 1) {
    const out = await loadProfileImageKey({
      repository: { profileImage: storage },
      status: RESULT_STATUS.READY,
      imageKeys: KEYS,
      random: at(5),
    });
    assert.equal(out.imageKey, 'c');
  }
});

test('결과: 기존 완료자(저장값 없음)는 1회 저장 후 고정', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  const first = await loadProfileImageKey({
    repository: { profileImage: storage },
    status: RESULT_STATUS.READY,
    imageKeys: KEYS,
    random: at(1),
  });
  const second = await loadProfileImageKey({
    repository: { profileImage: storage },
    status: RESULT_STATUS.READY,
    imageKeys: KEYS,
    random: at(4),
  });
  assert.equal(first.imageKey, 'b');
  assert.equal(second.imageKey, 'b');
});

test('결과: 미완료/빈 결과/오류에서는 선택·저장하지 않는다', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  for (const status of [RESULT_STATUS.NOT_COMPLETED, RESULT_STATUS.EMPTY, RESULT_STATUS.ERROR]) {
    const out = await loadProfileImageKey({
      repository: { profileImage: storage },
      status,
      imageKeys: KEYS,
    });
    assert.equal(out.imageKey, null);
  }
  assert.equal(__store.size, 0);
  assert.equal(__control.log.length, 0);
});

test('결과: 저장소 읽기/쓰기 실패 시 임의 랜덤 대신 null(중립 장면)', async () => {
  const storage = getWorkOnboardingProfileImageStorage(UID_A);
  __control.fail.get = 1;
  assert.deepEqual(
    await loadProfileImageKey({
      repository: { profileImage: storage },
      status: RESULT_STATUS.READY,
      imageKeys: KEYS,
    }),
    { imageKey: null, failed: true }
  );
  __resetControl();
  __control.fail.set = 1;
  const out = await loadProfileImageKey({
    repository: { profileImage: storage },
    status: RESULT_STATUS.READY,
    imageKeys: KEYS,
    random: at(2),
  });
  assert.equal(out.imageKey, null);
  assert.equal(__store.size, 0);
});

// ── 정적 분석 ────────────────────────────────────────────────

const readSource = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('[정적 분석] 저장소는 삭제하지 않고 전용 키만 쓴다', () => {
  const src = stripComments(
    readSource('src/features/onboarding/adapters/workOnboardingProfileImageStorage.js')
  );
  assert.doesNotMatch(src, /removeItem|clear\(|multiRemove|getAllKeys/);
  assert.doesNotMatch(src, /Number\(|parseInt|futureProfileAssets/);
  assert.match(src, /@financialOnboarding:profileImage:v/);
});

test('[정적 분석] 결과 화면은 랜덤 선택을 직접 하지 않고 저장값만 읽는다', () => {
  const screen = stripComments(
    readSource('src/screens/onboarding/WorkFinancialOnboardingResultScreen.js')
  );
  assert.doesNotMatch(screen, /Math\.random|pickRandomItem/);
  assert.match(screen, /loadProfileImageKey\(/);
  assert.match(screen, /imageSource=\{FUTURE_PROFILE_IMAGES\[imageKey\] \?\? null\}/);
  assert.doesNotMatch(
    screen,
    /futureProfileConfig|buildFinancialOnboardingResultViewModel|successImage|success_image|PROFILE_SCORES|AsyncStorage/
  );
});

test('[정적 분석] 질문 화면은 이미지 키 목록만 넘기고, Repository 제출 로직은 이미지와 무관', () => {
  const screen = stripComments(
    readSource('src/screens/onboarding/WorkFinancialOnboardingScreen.js')
  );
  assert.match(screen, /imageKeys: Object\.keys\(FUTURE_PROFILE_IMAGES\)/);
  const repo = stripComments(
    readSource('src/features/onboarding/adapters/workOnboardingRepository.js')
  );
  assert.match(repo, /profileImage,/);
  assert.doesNotMatch(repo, /profileImage\.(assignNew|ensure)/);
});

test('[정적 분석] 이미지 파일 6개 존재', () => {
  const assets = readSource('src/constants/futureProfileAssets.js');
  const files = [
    ...assets.matchAll(/require\('\.\.\/\.\.\/(assets\/future-profile\/[^']+)'\)/g),
  ].map(m => m[1]);
  assert.equal(files.length, 6);
  for (const file of files) assert.ok(existsSync(new URL(`../../${file}`, import.meta.url)), file);
});
