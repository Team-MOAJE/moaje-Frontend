// 미래 자금 시뮬레이션 화면 로직(API-39~41) 단위 테스트. 서버 호출 없음(함수 주입), 순수 로직만 검증한다.
// 실행: node --import ./scripts/api-tests/loader.mjs --test scripts/api-tests/simulatorScreenLogic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.EXPO_PUBLIC_API_BASE_URL ??= 'http://127.0.0.1:1';

const { API_ERROR_KIND, createApiError } = await import('../../src/services/apiResponse.js');
const { ASSET_SOURCE, SIMULATOR_ERROR_TYPE } =
  await import('../../src/features/work/simulatorApi.js');
const logic = await import('../../src/features/work/simulatorScreenLogic.js');
const {
  ADJUST_DIRECTION,
  AMOUNT_INPUT_ERROR,
  BASELINE_UNIT,
  MAX_AMOUNT_DIGITS,
  MONTHS_SAVED_KIND,
  MONTHS_VIEW_KIND,
  SIMULATOR_ERROR_POLICY,
  SIMULATOR_FIELDS,
  SIMULATOR_STATUS,
  SUBMIT_REJECT,
  buildAdjustmentViewModel,
  buildBaselineViewModel,
  buildSimulationViewModel,
  canRetrySimulatorError,
  createSimulatorSession,
  describeFieldError,
  describeMonthsSaved,
  describeMonthsToGoal,
  describeSimulatorError,
  inputsKey,
  normalizeAmountInput,
  ratioToPercentText,
  runRequest,
  validateAdjustForm,
  validateSimulatorForm,
} = logic;

const UID = '123456789012345678';
const OTHER_UID = '223456789012345678';

// ── 픽스처 (simulatorApi 모델 = camelCase) ───────────────────

const baselineFixture = (overrides = {}) => ({
  key: 'living_base_monthly',
  label: '월 기본 생활비 (주거·여가 제외)',
  amount: '700000',
  kind: 'ASSUMPTION',
  source: '모아제 가정',
  asOf: '-',
  scope: '식비·통신·교통·생필품을 묶은 가정값이며 공표 통계가 아니다.',
  url: '',
  ...overrides,
});

const simulationFixture = (overrides = {}) => ({
  target: {
    deposit: '10000000',
    moveInCost: '1000000',
    emergencyFund: '3600000',
    total: '14600000',
  },
  cashflow: {
    income: '2500000',
    housing: '500000',
    living: '500000',
    leisure: '200000',
    expense: '1200000',
    savable: '1300000',
  },
  currentAsset: '1000000',
  gap: '13600000',
  monthsToGoal: 11,
  progressRate: '0.0685',
  assetSource: ASSET_SOURCE.ASSET_SERVICE,
  assumedKeys: ['emergency_months'],
  baselines: [
    baselineFixture(),
    baselineFixture({ key: 'emergency_months', label: '비상금 개월 수', amount: '3' }),
  ],
  advice: ['지금 속도면 약 11개월 뒤에 목표에 도달해요.', '1개 항목은 가정값으로 계산했어요.'],
  ...overrides,
});

const adjustmentFixture = (overrides = {}) => ({
  monthlyDelta: '-100000',
  baseMonthlySavable: '1300000',
  adjustedMonthlySavable: '1400000',
  baseMonthsToGoal: 11,
  adjustedMonthsToGoal: 10,
  monthsSaved: 1,
  message: '달성 시점이 1개월 앞당겨져요.',
  ...overrides,
});

const apiError = (kind, status) => createApiError({ kind, status, message: 'x' });
const httpError = status =>
  apiError(status >= 500 ? API_ERROR_KIND.HTTP_5XX : API_ERROR_KIND.HTTP_4XX, status);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise(resolve => setImmediate(resolve));

// 호출 기록 + 즉시 응답 stub. handlers로 요청별 동작을 바꾼다(기본: 성공).
const createHarness = (handlers = {}) => {
  const calls = { baselines: 0, simulate: [], adjust: [] };
  const deps = {
    fetchBaselines: async () => {
      calls.baselines += 1;
      return handlers.baselines ? handlers.baselines() : [baselineFixture()];
    },
    runSimulation: async (userId, inputs) => {
      calls.simulate.push({ userId, inputs });
      return handlers.simulate ? handlers.simulate(userId, inputs) : simulationFixture();
    },
    runAdjustment: async (userId, inputs, monthlyDelta) => {
      calls.adjust.push({ userId, inputs, monthlyDelta });
      return handlers.adjust ? handlers.adjust(userId, inputs, monthlyDelta) : adjustmentFixture();
    },
  };
  return { calls, deps };
};

const newSession = (handlers, { user = UID } = {}) => {
  const harness = createHarness(handlers);
  const session = createSimulatorSession(harness.deps);
  if (user) session.setUser(user);
  return { ...harness, session };
};

const fill = (session, values) => {
  for (const [key, text] of Object.entries(values)) session.setField(key, text);
};

// ── 입력 정규화 / 검증 ───────────────────────────────────────

test('normalizeAmountInput: 허용 — 앞뒤 공백 제거, 올바른 천 단위 쉼표 제거, 0', () => {
  const cases = [
    [' 1000 ', '1000'],
    ['\t2500000\n', '2500000'],
    ['1,000', '1000'],
    ['12,345,678', '12345678'],
    ['999,999,999,999,999', '999999999999999'],
    ['0', '0'],
    ['7', '7'],
    ['123456789012345', '123456789012345'],
  ];
  for (const [text, value] of cases) {
    assert.deepEqual(normalizeAmountInput(text), { ok: true, value }, JSON.stringify(text));
  }
});

test('normalizeAmountInput: 빈 값(undefined·null·공백만)은 empty — 0으로 채우지 않음', () => {
  for (const text of [undefined, null, '', '   ', '\n']) {
    assert.deepEqual(normalizeAmountInput(text), { empty: true });
  }
});

test('normalizeAmountInput: 내부 공백·잘못된 쉼표는 자동 변환하지 않고 입력 오류', () => {
  const badFormat = [
    '1 2',
    '1 000',
    '1,2',
    '1,00',
    '1,0000',
    ',100',
    '1,000,',
    '1,,000',
    '0,100',
    '12,34',
    '1, 000',
    '1,000 000',
    '1\t2',
    '1\n2',
  ];
  for (const text of badFormat) {
    assert.deepEqual(
      normalizeAmountInput(text),
      { ok: false, error: AMOUNT_INPUT_ERROR.BAD_FORMAT },
      JSON.stringify(text)
    );
  }
});

test('normalizeAmountInput: 음수·소수·지수·문자·부호는 NOT_DIGITS, 선행 0은 LEADING_ZERO, 길이 초과는 TOO_LONG', () => {
  for (const text of ['-1', '+1', '1.5', '1e6', '12abc', 'abc', '₩100', '1원']) {
    assert.deepEqual(
      normalizeAmountInput(text),
      { ok: false, error: AMOUNT_INPUT_ERROR.NOT_DIGITS },
      text
    );
  }
  for (const text of ['01', '007', '00']) {
    assert.deepEqual(normalizeAmountInput(text), {
      ok: false,
      error: AMOUNT_INPUT_ERROR.LEADING_ZERO,
    });
  }
  assert.equal(MAX_AMOUNT_DIGITS, 15);
  assert.deepEqual(normalizeAmountInput('1234567890123456'), {
    ok: false,
    error: AMOUNT_INPUT_ERROR.TOO_LONG,
  });
  // 쉼표를 뺀 자릿수 기준이다.
  assert.deepEqual(normalizeAmountInput('1,234,567,890,123,456'), {
    ok: false,
    error: AMOUNT_INPUT_ERROR.TOO_LONG,
  });
  assert.deepEqual(normalizeAmountInput(100), { ok: false, error: AMOUNT_INPUT_ERROR.BAD_FORMAT });
});

test('describeFieldError: 모든 오류 코드에 문구가 있고 입력값을 싣지 않음', () => {
  for (const code of [
    ...Object.values(AMOUNT_INPUT_ERROR),
    'EMPTY',
    'ZERO',
    'BAD_DIRECTION',
    'UNKNOWN_CODE',
  ]) {
    const message = describeFieldError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('validateSimulatorForm: 7개 필드 순서와 키, 빈 폼은 inputs {}', () => {
  assert.deepEqual(
    SIMULATOR_FIELDS.map(field => field.key),
    [
      'monthlyIncome',
      'monthlyHousing',
      'monthlyLiving',
      'monthlyLeisure',
      'deposit',
      'moveInCost',
      'currentAsset',
    ]
  );
  assert.deepEqual(validateSimulatorForm({}), { ok: true, inputs: {}, fieldErrors: {} });
  assert.deepEqual(validateSimulatorForm(undefined), { ok: true, inputs: {}, fieldErrors: {} });
});

test('validateSimulatorForm: 빈 항목은 생략, 명시한 "0"은 전송, currentAsset 미입력은 생략, 쉼표는 제거한 문자열', () => {
  const result = validateSimulatorForm({
    monthlyIncome: '2,500,000',
    monthlyHousing: '',
    monthlyLiving: '   ',
    deposit: '0',
    moveInCost: ' 1000000 ',
    currentAsset: '',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.inputs, {
    monthlyIncome: '2500000',
    deposit: '0',
    moveInCost: '1000000',
  });
  assert.equal('currentAsset' in result.inputs, false);
  assert.equal('monthlyHousing' in result.inputs, false);
  assert.ok(Object.values(result.inputs).every(value => typeof value === 'string'));
});

test('validateSimulatorForm: 큰 정수 문자열을 정밀도 손실 없이 보존 (Number 변환 없음)', () => {
  const big = '123456789012345';
  const { inputs } = validateSimulatorForm({ currentAsset: big, deposit: '999,999,999,999,999' });
  assert.equal(inputs.currentAsset, big);
  // 쉼표만 제거한 문자열이며 숫자로 변환하지 않는다.
  assert.equal(inputs.deposit, '999999999999999');
  assert.equal(typeof inputs.deposit, 'string');
});

test('validateSimulatorForm: 잘못된 필드는 필드별 오류 코드를 돌려주고 ok=false', () => {
  const result = validateSimulatorForm({
    monthlyIncome: '1 2',
    monthlyHousing: '1,2',
    monthlyLiving: '-5',
    monthlyLeisure: '1.5',
    deposit: '007',
    moveInCost: '1234567890123456',
    currentAsset: '1000',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.fieldErrors, {
    monthlyIncome: AMOUNT_INPUT_ERROR.BAD_FORMAT,
    monthlyHousing: AMOUNT_INPUT_ERROR.BAD_FORMAT,
    monthlyLiving: AMOUNT_INPUT_ERROR.NOT_DIGITS,
    monthlyLeisure: AMOUNT_INPUT_ERROR.NOT_DIGITS,
    deposit: AMOUNT_INPUT_ERROR.LEADING_ZERO,
    moveInCost: AMOUNT_INPUT_ERROR.TOO_LONG,
  });
  assert.deepEqual(result.inputs, { currentAsset: '1000' });
});

test('inputsKey: 키 순서와 무관하게 같은 입력은 같은 키, 값이 다르면 다른 키', () => {
  assert.equal(inputsKey({ a: '1', b: '2' }), inputsKey({ b: '2', a: '1' }));
  assert.notEqual(inputsKey({ a: '1' }), inputsKey({ a: '2' }));
  assert.notEqual(inputsKey({}), inputsKey({ a: '0' }));
  assert.equal(inputsKey(null), inputsKey({}));
});

// ── 조정 입력 ────────────────────────────────────────────────

test('validateAdjustForm: SAVE는 음수 접두, INCREASE는 그대로, 쉼표 규칙 동일', () => {
  assert.deepEqual(validateAdjustForm({ direction: ADJUST_DIRECTION.SAVE, amount: '100000' }), {
    ok: true,
    monthlyDelta: '-100000',
  });
  assert.deepEqual(validateAdjustForm({ direction: ADJUST_DIRECTION.INCREASE, amount: '100000' }), {
    ok: true,
    monthlyDelta: '100000',
  });
  assert.deepEqual(validateAdjustForm({ direction: ADJUST_DIRECTION.SAVE, amount: ' 1,000 ' }), {
    ok: true,
    monthlyDelta: '-1000',
  });
  assert.deepEqual(
    validateAdjustForm({ direction: ADJUST_DIRECTION.SAVE, amount: '123456789012345' }),
    { ok: true, monthlyDelta: '-123456789012345' }
  );
});

test('validateAdjustForm: 0·빈 값·잘못된 형식·방향 없음은 거부 (부호 이중 방지)', () => {
  const save = ADJUST_DIRECTION.SAVE;
  assert.equal(validateAdjustForm({ direction: save, amount: '0' }).error, 'ZERO');
  assert.equal(validateAdjustForm({ direction: save, amount: '' }).error, 'EMPTY');
  assert.equal(validateAdjustForm({ direction: save, amount: '   ' }).error, 'EMPTY');
  assert.equal(validateAdjustForm({ direction: save, amount: '1 2' }).error, 'BAD_FORMAT');
  assert.equal(validateAdjustForm({ direction: save, amount: '1,2' }).error, 'BAD_FORMAT');
  assert.equal(validateAdjustForm({ direction: save, amount: '-100' }).error, 'NOT_DIGITS');
  assert.equal(validateAdjustForm({ direction: save, amount: '+100' }).error, 'NOT_DIGITS');
  assert.equal(validateAdjustForm({ direction: save, amount: '1.5' }).error, 'NOT_DIGITS');
  assert.equal(
    validateAdjustForm({ direction: save, amount: '1234567890123456' }).error,
    'TOO_LONG'
  );
  assert.equal(validateAdjustForm({ direction: 'X', amount: '100' }).error, 'BAD_DIRECTION');
  assert.equal(validateAdjustForm({ amount: '100' }).error, 'BAD_DIRECTION');
  assert.equal(validateAdjustForm().error, 'BAD_DIRECTION');
});

// ── 표시 변환 ────────────────────────────────────────────────

test('ratioToPercentText: 문자열 소수점 이동만, 반올림·부동소수 계산 없음', () => {
  const cases = [
    ['0.0685', '6.85%'],
    ['0.158', '15.8%'],
    ['0', '0%'],
    ['0.0', '0%'],
    ['0.5', '50%'],
    ['0.285', '28.5%'],
    ['0.0001', '0.01%'],
    ['0.12345', '12.345%'],
    ['1', '100%'],
    ['1.0', '100%'],
    ['1.0000', '100%'],
  ];
  for (const [share, text] of cases) assert.equal(ratioToPercentText(share), text, share);
});

test('ratioToPercentText: 형식 위반은 0%로 대체하지 않고 INVALID_RESPONSE로 throw', () => {
  for (const share of ['1.5', '-0.1', '.5', '1.', 'abc', '', null, undefined, 0.5, '0,5']) {
    assert.throws(
      () => ratioToPercentText(share),
      error => error.invalidResponse === true,
      String(share)
    );
  }
});

test('describeMonthsToGoal: null(계산 불가)·0(이미 달성)·양수를 서로 구분', () => {
  const unreachable = describeMonthsToGoal(null);
  const reached = describeMonthsToGoal(0);
  const months = describeMonthsToGoal(11);

  assert.equal(unreachable.kind, MONTHS_VIEW_KIND.UNREACHABLE);
  assert.equal(unreachable.months, null);
  assert.equal(reached.kind, MONTHS_VIEW_KIND.REACHED);
  assert.equal(reached.months, 0);
  assert.equal(months.kind, MONTHS_VIEW_KIND.MONTHS);
  assert.equal(months.text, '11개월');
  assert.equal(describeMonthsToGoal(12).text, '12개월', '년 환산 없음');
  assert.notEqual(unreachable.text, reached.text);
  for (const bad of [-1, 1.5, '3', undefined, NaN]) {
    assert.throws(
      () => describeMonthsToGoal(bad),
      error => error.invalidResponse === true
    );
  }
});

test('describeMonthsSaved: 양수=단축, 0=변화 없음, 음수=지연, null=비교 불가', () => {
  assert.deepEqual(describeMonthsSaved(3), {
    kind: MONTHS_SAVED_KIND.FASTER,
    months: 3,
    text: '3개월 단축',
  });
  assert.deepEqual(describeMonthsSaved(0), {
    kind: MONTHS_SAVED_KIND.SAME,
    months: 0,
    text: '변화 없음',
  });
  assert.deepEqual(describeMonthsSaved(-2), {
    kind: MONTHS_SAVED_KIND.SLOWER,
    months: 2,
    text: '2개월 지연',
  });
  assert.deepEqual(describeMonthsSaved(null), {
    kind: MONTHS_SAVED_KIND.UNKNOWN,
    months: null,
    text: '비교할 수 없어요',
  });
  assert.throws(
    () => describeMonthsSaved(0.5),
    error => error.invalidResponse === true
  );
});

test('buildBaselineViewModel: 금액·개월·비율 구분, 모르는 key·kind는 원문, 서버 순서·개수 유지', () => {
  const baselines = [
    baselineFixture({ key: 'rir_ratio', amount: '0.158', kind: 'STATISTIC', label: 'RIR' }),
    baselineFixture({ key: 'emergency_months', amount: '3', label: '비상금 개월 수' }),
    baselineFixture({ key: 'income_startup', amount: '2500000', label: '스타트업 월수입' }),
    baselineFixture({ key: 'deposit_reference', amount: '27390000', kind: 'STATISTIC' }),
    baselineFixture({ key: 'future_unknown_key', amount: '12345', kind: 'NEW_KIND' }),
    baselineFixture({
      key: 'derived_one',
      amount: '0.5',
      kind: 'DERIVED',
      url: 'https://example.invalid/x',
    }),
  ];

  const view = buildBaselineViewModel(baselines);

  assert.deepEqual(
    view.map(item => item.key),
    baselines.map(item => item.key),
    '서버 순서 유지'
  );
  assert.deepEqual(
    view.map(item => [item.unit, item.amountText]),
    [
      [BASELINE_UNIT.RATIO, '15.8%'],
      [BASELINE_UNIT.MONTHS, '3개월'],
      [BASELINE_UNIT.WON, '2,500,000원'],
      [BASELINE_UNIT.WON, '27,390,000원'],
      [BASELINE_UNIT.RAW, '12345'],
      [BASELINE_UNIT.RAW, '0.5'],
    ]
  );
  assert.deepEqual(
    view.map(item => item.rawAmount),
    baselines.map(item => item.amount),
    '원문 금액 보존'
  );
  assert.equal(view[0].kindLabel, '공표 통계');
  assert.equal(view[1].kindLabel, '모아제 가정(통계 아님)');
  assert.equal(view[1].isAssumption, true);
  assert.equal(view[4].kindLabel, 'NEW_KIND', '모르는 kind는 원문');
  assert.equal(view[5].kindLabel, '통계 기반 계산');
  assert.equal(view[0].hasUrl, false);
  assert.equal(view[0].url, '');
  assert.equal(view[5].hasUrl, true);
  assert.equal(view[0].asOf, '-');
  assert.equal(view[0].scope, baselines[0].scope);
});

test('buildBaselineViewModel: 알려진 key라도 값이 해당 단위로 읽히지 않으면 추측하지 않고 원문 (RAW)', () => {
  const [ratio, won] = buildBaselineViewModel([
    baselineFixture({ key: 'rir_ratio', amount: '5.5' }),
    baselineFixture({ key: 'income_startup', amount: '2.500.000' }),
  ]);
  assert.equal(ratio.unit, BASELINE_UNIT.RAW);
  assert.equal(ratio.amountText, '5.5');
  assert.equal(won.unit, BASELINE_UNIT.RAW);
});

test('buildBaselineViewModel: 기준값 개수(0·1·13·40)에 의존하지 않음', () => {
  for (const count of [0, 1, 13, 40]) {
    const list = Array.from({ length: count }, (_, index) =>
      baselineFixture({ key: `baseline_${index}` })
    );
    assert.deepEqual(
      buildBaselineViewModel(list).map(item => item.key),
      list.map(item => item.key)
    );
  }
});

test('buildSimulationViewModel: 서버 값을 포맷만 하고 재계산하지 않음', () => {
  const result = simulationFixture({
    gap: '13600000.0000',
    // 서버 값이 서로 맞지 않아도(일부러) 프론트는 보정하지 않는다.
    target: { ...simulationFixture().target, total: '99999999' },
  });

  const view = buildSimulationViewModel(result);

  assert.deepEqual(
    view.targetRows.map(row => [row.key, row.text]),
    [
      ['deposit', '10,000,000원'],
      ['moveInCost', '1,000,000원'],
      ['emergencyFund', '3,600,000원'],
      ['total', '99,999,999원'],
    ]
  );
  assert.deepEqual(
    view.cashflowRows.map(row => [row.key, row.text]),
    [
      ['income', '2,500,000원'],
      ['housing', '500,000원'],
      ['living', '500,000원'],
      ['leisure', '200,000원'],
      ['expense', '1,200,000원'],
      ['savable', '1,300,000원'],
    ]
  );
  assert.equal(view.gapText, '13,600,000원', '소수 뒤 0만 제거, 값 보존');
  assert.equal(view.currentAssetText, '1,000,000원');
  assert.equal(view.progressText, '6.85%');
  assert.equal(view.months.kind, MONTHS_VIEW_KIND.MONTHS);
  assert.equal(view.months.text, '11개월');
});

test('buildSimulationViewModel: 월 저축 가능액 음수 표시, months_to_goal null/0 구분', () => {
  const negative = buildSimulationViewModel(
    simulationFixture({
      monthsToGoal: null,
      cashflow: { ...simulationFixture().cashflow, savable: '-250000', expense: '2750000' },
    })
  );
  const savableRow = negative.cashflowRows.find(row => row.key === 'savable');
  assert.equal(savableRow.isNegative, true);
  assert.equal(savableRow.text, '-250,000원');
  assert.equal(negative.months.kind, MONTHS_VIEW_KIND.UNREACHABLE);
  assert.equal(
    negative.cashflowRows.filter(row => row.isNegative).length,
    1,
    '나머지 행은 음수 아님'
  );

  const reached = buildSimulationViewModel(simulationFixture({ monthsToGoal: 0, gap: '0' }));
  assert.equal(reached.months.kind, MONTHS_VIEW_KIND.REACHED);
  assert.equal(reached.gapText, '0원');
});

test('buildSimulationViewModel: assumedKeys·advice 원문 보존(순서·내용), 라벨은 baselines에서만 찾음', () => {
  const result = simulationFixture({
    assumedKeys: ['emergency_months', 'move_in_cost', 'zzz_not_in_baselines'],
    advice: ['  첫째 문장 ', '둘째 문장', '셋째'],
  });

  const view = buildSimulationViewModel(result);

  assert.deepEqual(view.assumedKeys, ['emergency_months', 'move_in_cost', 'zzz_not_in_baselines']);
  assert.deepEqual(view.advice, ['  첫째 문장 ', '둘째 문장', '셋째']);
  assert.deepEqual(view.assumedItems, [
    { key: 'emergency_months', label: '비상금 개월 수' },
    { key: 'move_in_cost', label: 'move_in_cost' },
    { key: 'zzz_not_in_baselines', label: 'zzz_not_in_baselines' },
  ]);

  const empty = buildSimulationViewModel(simulationFixture({ assumedKeys: [], advice: [] }));
  assert.deepEqual(empty.assumedKeys, []);
  assert.deepEqual(empty.advice, []);
});

test('buildSimulationViewModel: asset_source 안내 — NOT_LINKED/UNAVAILABLE만 문구, 나머지·모르는 값은 null', () => {
  const notice = assetSource =>
    buildSimulationViewModel(simulationFixture({ assetSource })).assetNotice;

  assert.equal(typeof notice(ASSET_SOURCE.NOT_LINKED), 'string');
  assert.equal(typeof notice(ASSET_SOURCE.UNAVAILABLE), 'string');
  assert.notEqual(notice(ASSET_SOURCE.NOT_LINKED), notice(ASSET_SOURCE.UNAVAILABLE));
  assert.equal(notice(ASSET_SOURCE.INPUT), null);
  assert.equal(notice(ASSET_SOURCE.ASSET_SERVICE), null);
  assert.equal(notice('SOMETHING_NEW'), null);
});

test('buildAdjustmentViewModel: 서버 message 원문과 수치 보존, monthsSaved 4종', () => {
  for (const [saved, kind] of [
    [1, MONTHS_SAVED_KIND.FASTER],
    [0, MONTHS_SAVED_KIND.SAME],
    [-2, MONTHS_SAVED_KIND.SLOWER],
    [null, MONTHS_SAVED_KIND.UNKNOWN],
  ]) {
    const view = buildAdjustmentViewModel(
      adjustmentFixture({ monthsSaved: saved, message: ` 서버 문구 ${saved} ` })
    );
    assert.equal(view.monthsSaved.kind, kind);
    assert.equal(view.message, ` 서버 문구 ${saved} `, '서버 문구를 다시 만들지 않음');
  }

  const view = buildAdjustmentViewModel(adjustmentFixture());
  assert.equal(view.monthlyDeltaText, '-100,000원');
  assert.equal(view.baseSavableText, '1,300,000원');
  assert.equal(view.adjustedSavableText, '1,400,000원');
  assert.equal(view.baseMonths.text, '11개월');
  assert.equal(view.adjustedMonths.text, '10개월');
});

test('buildAdjustmentViewModel: 개월 수 null/0도 API-40과 같은 규칙으로 구분', () => {
  const view = buildAdjustmentViewModel(
    adjustmentFixture({
      baseMonthsToGoal: null,
      adjustedMonthsToGoal: 0,
      monthsSaved: null,
      adjustedMonthlySavable: '-5',
    })
  );
  assert.equal(view.baseMonths.kind, MONTHS_VIEW_KIND.UNREACHABLE);
  assert.equal(view.adjustedMonths.kind, MONTHS_VIEW_KIND.REACHED);
  assert.equal(view.adjustedSavableIsNegative, true);
});

test('buildAdjustmentViewModel: base가 API-40과 같으면 false(소수 표기 차이 무시), 다르면 플래그만 — 값 덮어쓰기 없음', () => {
  const simulation = simulationFixture();

  const same = buildAdjustmentViewModel(adjustmentFixture(), simulation);
  assert.equal(same.baseDiffersFromSimulation, false);
  assert.equal(same.baseNotice, null);

  const sameDecimal = buildAdjustmentViewModel(
    adjustmentFixture({ baseMonthlySavable: '1300000.0000' }),
    simulation
  );
  assert.equal(sameDecimal.baseDiffersFromSimulation, false);

  const differentSavable = adjustmentFixture({ baseMonthlySavable: '1250000' });
  const savableView = buildAdjustmentViewModel(differentSavable, simulation);
  assert.equal(savableView.baseDiffersFromSimulation, true);
  assert.equal(typeof savableView.baseNotice, 'string');
  assert.equal(savableView.baseSavableText, '1,250,000원', 'API-41의 base 값을 그대로 표시');

  const differentMonths = buildAdjustmentViewModel(
    adjustmentFixture({ baseMonthsToGoal: 12 }),
    simulation
  );
  assert.equal(differentMonths.baseDiffersFromSimulation, true);
  assert.equal(differentMonths.baseMonths.text, '12개월');

  // 입력 모델은 변경되지 않는다.
  assert.equal(simulation.cashflow.savable, '1300000');
  assert.equal(simulation.monthsToGoal, 11);
  assert.equal(differentSavable.baseMonthlySavable, '1250000');

  // API-40 결과 없이도 만들 수 있다(비교 생략).
  assert.equal(buildAdjustmentViewModel(adjustmentFixture()).baseDiffersFromSimulation, false);
});

// ── 오류 정책 ────────────────────────────────────────────────

test('오류 정책: 재시도 가능/불가 분류와 문구 (서버 원문·ID 미포함)', () => {
  const T = SIMULATOR_ERROR_TYPE;
  for (const type of [T.NETWORK, T.TIMEOUT, T.SERVER, T.INVALID_RESPONSE, T.UNKNOWN]) {
    assert.equal(canRetrySimulatorError(type), true, type);
  }
  for (const type of [
    T.UNAUTHORIZED,
    T.FORBIDDEN,
    T.CONFIG,
    T.BAD_REQUEST,
    T.VALIDATION,
    T.INVALID_REQUEST,
    T.CLIENT_ERROR,
    T.NOT_FOUND,
    'SOMETHING_NEW',
    undefined,
  ]) {
    assert.equal(canRetrySimulatorError(type), false, String(type));
  }
  for (const [type, policy] of Object.entries(SIMULATOR_ERROR_POLICY)) {
    assert.equal(describeSimulatorError(type), policy.message);
    assert.equal(/user_id|token|detail|traceId|\d{6,}/i.test(policy.message), false, type);
    if (!policy.retryable) assert.equal(policy.message.includes('다시 시도'), false, type);
  }
  assert.equal(describeSimulatorError('SOMETHING_NEW'), '요청을 처리하지 못했어요.');
});

test('runRequest: 성공/오류 분류/취소', async () => {
  assert.deepEqual(await runRequest(async () => 7), { ok: true, value: 7 });
  assert.deepEqual(
    await runRequest(async () => {
      throw httpError(503);
    }),
    { ok: false, errorType: SIMULATOR_ERROR_TYPE.SERVER }
  );
  assert.deepEqual(
    await runRequest(async () => {
      throw apiError(API_ERROR_KIND.CANCELED);
    }),
    { ok: false, canceled: true }
  );
});

// ── 세션: 호출 정책 ──────────────────────────────────────────

test('세션 생성: 함수 3개가 필요', () => {
  assert.throws(() => createSimulatorSession(), TypeError);
  assert.throws(
    () => createSimulatorSession({ fetchBaselines() {}, runSimulation() {} }),
    TypeError
  );
});

test('세션: 입력 변경·사용자 설정·구독만으로는 어떤 요청도 보내지 않음', async () => {
  const { session, calls } = newSession();
  session.subscribe(() => {});

  fill(session, { monthlyIncome: '2500000', deposit: '10,000,000' });
  session.setAdjustDirection(ADJUST_DIRECTION.INCREASE);
  session.setAdjustAmount('50000');
  session.setUser(OTHER_UID);
  session.setUser(UID);
  await tick();

  assert.equal(calls.baselines, 0);
  assert.equal(calls.simulate.length, 0);
  assert.equal(calls.adjust.length, 0);
});

test('세션: submitSimulation은 탭마다 정확히 1회 호출하고 검증된 입력을 전달', async () => {
  const { session, calls } = newSession();
  fill(session, { monthlyIncome: '2,500,000', currentAsset: '', deposit: '0' });

  const outcome = await session.submitSimulation();

  assert.deepEqual(outcome, { started: true, status: SIMULATOR_STATUS.READY });
  assert.equal(calls.simulate.length, 1);
  assert.equal(calls.simulate[0].userId, UID);
  assert.deepEqual(calls.simulate[0].inputs, { monthlyIncome: '2500000', deposit: '0' });
  assert.equal(
    'currentAsset' in calls.simulate[0].inputs,
    false,
    '현재 자산 미입력 시 요청에서 생략'
  );

  const { simulation } = session.getSnapshot();
  assert.equal(simulation.status, SIMULATOR_STATUS.READY);
  assert.equal(simulation.viewModel.gapText, '13,600,000원');
  assert.deepEqual(simulation.submittedInputs, { monthlyIncome: '2500000', deposit: '0' });

  await session.submitSimulation();
  assert.equal(calls.simulate.length, 2, '다시 탭하면 다시 1회');
});

test('세션: 자동 재시도 없음 — 실패 후 시간이 지나도 호출 횟수 불변', async () => {
  const { session, calls } = newSession({
    simulate: () => {
      throw httpError(503);
    },
  });

  const outcome = await session.submitSimulation();
  await tick();
  await tick();

  assert.equal(outcome.status, SIMULATOR_STATUS.ERROR);
  assert.equal(calls.simulate.length, 1);
  const { simulation } = session.getSnapshot();
  assert.equal(simulation.errorType, SIMULATOR_ERROR_TYPE.SERVER);
  assert.equal(simulation.retryable, true);
  assert.equal(simulation.result, null, '오류를 성공값·0원으로 대체하지 않음');
  assert.equal(simulation.viewModel, null);

  await session.submitSimulation(); // 수동 재시도
  assert.equal(calls.simulate.length, 2);
});

test('세션: 입력 검증 실패는 요청 없이 fieldErrors만 설정, 입력 수정 시 해당 필드 오류 해제', async () => {
  const { session, calls } = newSession();
  fill(session, { monthlyIncome: '1 2', deposit: '1,2', moveInCost: '1000' });

  const outcome = await session.submitSimulation();

  assert.equal(outcome.started, false);
  assert.equal(outcome.reason, SUBMIT_REJECT.INVALID_INPUT);
  assert.equal(calls.simulate.length, 0);
  assert.deepEqual(session.getSnapshot().fieldErrors, {
    monthlyIncome: AMOUNT_INPUT_ERROR.BAD_FORMAT,
    deposit: AMOUNT_INPUT_ERROR.BAD_FORMAT,
  });
  assert.equal(session.getSnapshot().simulation.status, SIMULATOR_STATUS.IDLE);

  session.setField('monthlyIncome', '12');
  assert.deepEqual(session.getSnapshot().fieldErrors, { deposit: AMOUNT_INPUT_ERROR.BAD_FORMAT });
});

test('세션: 사용자 정보가 없으면 요청하지 않음 (NO_USER)', async () => {
  const { session, calls } = newSession({}, { user: null });
  assert.equal((await session.submitSimulation()).reason, SUBMIT_REJECT.NO_USER);
  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.NO_USER);
  session.setUser('abc');
  assert.equal((await session.submitSimulation()).reason, SUBMIT_REJECT.NO_USER);
  assert.equal(calls.simulate.length + calls.adjust.length, 0);
  assert.equal(session.getSnapshot().canSubmitSimulation, false);
});

// ── 세션: 중복·연타 ──────────────────────────────────────────

test('세션: 진행 중 연타는 IN_FLIGHT로 차단, 호출은 1회, 완료 후 재제출 가능', async () => {
  const gate = deferred();
  const { session, calls } = newSession({ simulate: () => gate.promise });

  const first = session.submitSimulation();
  const second = await session.submitSimulation();
  const third = await session.submitSimulation();

  assert.equal(second.reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal(third.reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal(calls.simulate.length, 1);
  assert.equal(session.getSnapshot().isBusy, true);
  assert.equal(session.getSnapshot().canSubmitSimulation, false);
  assert.equal(session.getSnapshot().simulation.status, SIMULATOR_STATUS.LOADING);

  gate.resolve(simulationFixture());
  await first;

  assert.equal(session.getSnapshot().isBusy, false);
  assert.equal(session.getSnapshot().simulation.status, SIMULATOR_STATUS.READY);
  assert.equal((await session.submitSimulation()).started, true);
  assert.equal(calls.simulate.length, 2);
});

test('세션: API-40 진행 중에는 API-41 차단, API-41 진행 중에는 API-40 차단', async () => {
  const simGate = deferred();
  const adjGate = deferred();
  let simCount = 0;
  const { session, calls } = newSession({
    simulate: () => {
      simCount += 1;
      return simCount === 1 ? Promise.resolve(simulationFixture()) : simGate.promise;
    },
    adjust: () => adjGate.promise,
  });
  await session.submitSimulation();
  session.setAdjustAmount('100000');

  const pendingSim = session.submitSimulation();
  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.IN_FLIGHT);
  simGate.resolve(simulationFixture());
  await pendingSim;

  const pendingAdj = session.submitAdjustment();
  assert.equal((await session.submitSimulation()).reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.IN_FLIGHT);
  assert.equal(calls.adjust.length, 1);
  adjGate.resolve(adjustmentFixture());
  await pendingAdj;
  assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.READY);
});

// ── 세션: 늦은 응답 ──────────────────────────────────────────

test('세션: 사용자 변경 뒤 도착한 이전 사용자의 API-40 응답은 폐기', async () => {
  const gate = deferred();
  const { session } = newSession({ simulate: () => gate.promise });
  fill(session, { monthlyIncome: '2500000' });

  const pending = session.submitSimulation();
  session.setUser(OTHER_UID);
  gate.resolve(simulationFixture());
  const outcome = await pending;

  assert.equal(outcome.discarded, true);
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.userId, OTHER_UID);
  assert.equal(snapshot.simulation.status, SIMULATOR_STATUS.IDLE);
  assert.equal(snapshot.simulation.result, null);
  assert.equal(snapshot.isBusy, false, '새 사용자는 바로 제출 가능');
  assert.equal(snapshot.form.monthlyIncome, '', '이전 사용자의 입력도 초기화');
});

test('세션: dispose 뒤 도착한 응답은 상태·리스너를 바꾸지 않음', async () => {
  const gate = deferred();
  const { session } = newSession({ simulate: () => gate.promise });
  let notifications = 0;
  session.subscribe(() => {
    notifications += 1;
  });

  const pending = session.submitSimulation();
  const before = notifications;
  const snapshotBefore = session.getSnapshot();
  session.dispose();
  gate.resolve(simulationFixture());
  const outcome = await pending;

  assert.equal(outcome.discarded, true);
  assert.equal(notifications, before);
  assert.equal(session.getSnapshot(), snapshotBefore);
  assert.equal((await session.submitSimulation()).reason, SUBMIT_REJECT.DISPOSED);
  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.DISPOSED);
  await session.loadBaselines();
});

test('세션: 사용자 변경 뒤 도착한 API-41·API-39 응답도 폐기', async () => {
  const adjGate = deferred();
  const baseGate = deferred();
  const { session } = newSession({
    adjust: () => adjGate.promise,
    baselines: () => baseGate.promise,
  });
  await session.submitSimulation();
  session.setAdjustAmount('100000');
  const pendingAdj = session.submitAdjustment();
  const pendingBase = session.loadBaselines();

  session.setUser(OTHER_UID);
  adjGate.resolve(adjustmentFixture());
  baseGate.resolve([baselineFixture()]);
  await Promise.all([pendingAdj, pendingBase]);

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.IDLE);
  assert.equal(snapshot.baselines.status, SIMULATOR_STATUS.IDLE);
  assert.equal(snapshot.baselines.items.length, 0);
});

// ── 세션: API-41 입력 변경 ───────────────────────────────────

const readySession = async handlers => {
  const harness = newSession(handlers);
  fill(harness.session, { monthlyIncome: '2500000', deposit: '10000000' });
  await harness.session.submitSimulation();
  return harness;
};

test('API-41: 완료된 조정 결과가 있을 때 입력을 바꾸면 즉시 idle — 이전 결과를 새 입력의 결과로 보이지 않음, API-40 결과 유지', async () => {
  const { session, calls } = await readySession();
  session.setAdjustAmount('100000');
  await session.submitAdjustment();
  assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.READY);
  const simulationBefore = session.getSnapshot().simulation;

  session.setAdjustAmount('200000');

  let snapshot = session.getSnapshot();
  assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.IDLE);
  assert.equal(snapshot.adjustment.result, null);
  assert.equal(snapshot.adjustment.viewModel, null);
  assert.equal(snapshot.simulation, simulationBefore, 'API-40 결과 참조 불변');
  assert.equal(snapshot.simulation.status, SIMULATOR_STATUS.READY);

  await session.submitAdjustment();
  session.setAdjustDirection(ADJUST_DIRECTION.INCREASE);
  snapshot = session.getSnapshot();
  assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.IDLE, '방향 변경도 결과 초기화');
  assert.equal(snapshot.simulation, simulationBefore);
  assert.equal(calls.adjust.length, 2);
});

test('API-41: 진행 중 입력을 바꾸면 이후 도착한 이전 응답은 폐기되고 idle 유지, 새 제출은 정상', async () => {
  for (const change of [
    session => session.setAdjustAmount('300000'),
    session => session.setAdjustDirection(ADJUST_DIRECTION.INCREASE),
  ]) {
    const gate = deferred();
    let adjustCount = 0;
    const { session, calls } = await readySession({
      adjust: () => {
        adjustCount += 1;
        return adjustCount === 1
          ? gate.promise
          : Promise.resolve(adjustmentFixture({ monthsSaved: 4 }));
      },
    });
    session.setAdjustAmount('100000');
    const simulationBefore = session.getSnapshot().simulation;

    const pending = session.submitAdjustment();
    assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.LOADING);
    assert.equal(session.getSnapshot().isBusy, true);

    change(session);
    assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.IDLE);
    assert.equal(session.getSnapshot().isBusy, false, '입력 변경으로 진행 중 요청 잠금 해제');

    gate.resolve(adjustmentFixture({ monthsSaved: 1 }));
    const outcome = await pending;

    assert.equal(outcome.discarded, true);
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.IDLE);
    assert.equal(snapshot.adjustment.result, null, '이전 입력의 응답을 반영하지 않음');
    assert.equal(snapshot.simulation, simulationBefore, 'API-40 결과 참조 불변');

    const next = await session.submitAdjustment();
    assert.equal(next.status, SIMULATOR_STATUS.READY);
    assert.equal(session.getSnapshot().adjustment.result.monthsSaved, 4, '새 제출의 응답만 반영');
    assert.equal(calls.adjust.length, 2);
  }
});

test('API-41: 같은 값으로 다시 설정하면 무동작 — 결과 유지', async () => {
  const { session } = await readySession();
  session.setAdjustAmount('100000');
  await session.submitAdjustment();
  const adjustmentBefore = session.getSnapshot().adjustment;
  assert.equal(adjustmentBefore.status, SIMULATOR_STATUS.READY);

  assert.equal(session.setAdjustAmount('100000'), false);
  assert.equal(session.setAdjustDirection(ADJUST_DIRECTION.SAVE), false, '기본 방향과 동일');
  assert.equal(session.setAdjustDirection('SIDEWAYS'), false, '알 수 없는 방향은 무시');

  assert.equal(session.getSnapshot().adjustment, adjustmentBefore);
});

test('API-41: 입력 변경만으로는 요청이 나가지 않음', async () => {
  const { session, calls } = await readySession();
  const before = calls.adjust.length;

  session.setAdjustAmount('100000');
  session.setAdjustDirection(ADJUST_DIRECTION.INCREASE);
  session.setAdjustAmount('200000');
  await tick();

  assert.equal(calls.adjust.length, before);
});

// ── 세션: 독립성 / 입력 전달 ─────────────────────────────────

test('API-41: API-40이 제출한 입력(currentAsset 생략 포함)을 그대로 전달하고 monthly_delta를 붙임', async () => {
  const { session, calls } = await readySession();
  session.setAdjustAmount('1,000');
  session.setAdjustDirection(ADJUST_DIRECTION.SAVE);

  const outcome = await session.submitAdjustment();

  assert.equal(outcome.status, SIMULATOR_STATUS.READY);
  assert.equal(calls.adjust.length, 1);
  assert.equal(calls.adjust[0].userId, UID);
  assert.deepEqual(calls.adjust[0].inputs, calls.simulate[0].inputs, 'API-40과 동일한 사용자 입력');
  assert.deepEqual(calls.adjust[0].inputs, { monthlyIncome: '2500000', deposit: '10000000' });
  assert.equal('currentAsset' in calls.adjust[0].inputs, false);
  assert.equal(calls.adjust[0].monthlyDelta, '-1000');
  assert.deepEqual(session.getSnapshot().adjustment.submittedDelta, {
    direction: ADJUST_DIRECTION.SAVE,
    monthlyDelta: '-1000',
  });

  session.setAdjustDirection(ADJUST_DIRECTION.INCREASE);
  await session.submitAdjustment();
  assert.equal(calls.adjust[1].monthlyDelta, '1000');
});

test('API-41: 명시한 currentAsset은 API-40과 동일하게 API-41에도 전달', async () => {
  const { session, calls } = newSession();
  fill(session, { currentAsset: '5,000,000' });
  await session.submitSimulation();
  session.setAdjustAmount('100000');

  await session.submitAdjustment();

  assert.deepEqual(calls.adjust[0].inputs, { currentAsset: '5000000' });
});

test('API-41: 시뮬레이션 제출 이후 입력을 수정하면 STALE로 차단(요청 0회), 다시 계산하면 해제', async () => {
  const { session, calls } = await readySession();
  session.setAdjustAmount('100000');
  session.setField('monthlyIncome', '3000000');

  assert.equal(session.getSnapshot().simulationStale, true);
  assert.equal(session.getSnapshot().canSubmitAdjustment, false);
  const outcome = await session.submitAdjustment();
  assert.equal(outcome.reason, SUBMIT_REJECT.STALE);
  assert.equal(calls.adjust.length, 0);
  assert.equal(
    session.getSnapshot().simulation.status,
    SIMULATOR_STATUS.READY,
    '이전 API-40 결과는 유지'
  );

  session.setField('monthlyIncome', '2500000'); // 제출 값으로 되돌림
  assert.equal(session.getSnapshot().simulationStale, false);

  session.setField('monthlyIncome', '3000000');
  await session.submitSimulation();
  assert.equal(session.getSnapshot().simulationStale, false);
  session.setAdjustAmount('100000');
  assert.equal((await session.submitAdjustment()).started, true);
  assert.deepEqual(calls.adjust[0].inputs, { monthlyIncome: '3000000', deposit: '10000000' });
});

test('API-41: 시뮬레이션 결과가 없으면 NEEDS_SIMULATION (요청 0회)', async () => {
  const { session, calls } = newSession();
  session.setAdjustAmount('100000');

  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.NEEDS_SIMULATION);
  assert.equal(calls.adjust.length, 0);
});

test('API-41: 조정 입력이 잘못되면 요청 없이 adjustFormError (0원·형식 오류)', async () => {
  const { session, calls } = await readySession();

  for (const [amount, error] of [
    ['', 'EMPTY'],
    ['0', 'ZERO'],
    ['1 2', 'BAD_FORMAT'],
    ['1,2', 'BAD_FORMAT'],
    ['-5', 'NOT_DIGITS'],
  ]) {
    session.setAdjustAmount(amount);
    const outcome = await session.submitAdjustment();
    assert.equal(outcome.reason, SUBMIT_REJECT.INVALID_INPUT, amount);
    assert.equal(session.getSnapshot().adjustFormError, error, amount);
  }
  assert.equal(calls.adjust.length, 0);

  session.setAdjustAmount('100');
  assert.equal(session.getSnapshot().adjustFormError, null, '입력을 바꾸면 오류 해제');
});

test('독립성: API-41 성공·실패·취소 어느 쪽도 API-40 결과(참조)를 바꾸지 않음, base 값으로 대체하지 않음', async () => {
  const modes = ['ok', 'fail', 'cancel'];
  for (const mode of modes) {
    const { session } = await readySession({
      adjust: () => {
        if (mode === 'fail') throw httpError(500);
        if (mode === 'cancel') throw apiError(API_ERROR_KIND.CANCELED);
        return adjustmentFixture({ baseMonthlySavable: '999', baseMonthsToGoal: 99 });
      },
    });
    session.setAdjustAmount('100000');
    const simulationBefore = session.getSnapshot().simulation;

    await session.submitAdjustment();

    const snapshot = session.getSnapshot();
    assert.equal(snapshot.simulation, simulationBefore, mode);
    assert.equal(snapshot.simulation.result.cashflow.savable, '1300000', mode);
    assert.equal(snapshot.simulation.result.monthsToGoal, 11, mode);
    assert.equal(
      snapshot.adjustment.status,
      { ok: 'ready', fail: 'error', cancel: 'idle' }[mode],
      mode
    );
  }
});

test('독립성: API-41 base가 API-40과 달라도 두 결과를 각자 보존하고 플래그만 켬', async () => {
  const { session } = await readySession({
    adjust: () => adjustmentFixture({ baseMonthlySavable: '1250000', baseMonthsToGoal: 12 }),
  });
  session.setAdjustAmount('100000');

  await session.submitAdjustment();

  const { simulation, adjustment } = session.getSnapshot();
  assert.equal(adjustment.viewModel.baseDiffersFromSimulation, true);
  assert.equal(adjustment.viewModel.baseSavableText, '1,250,000원');
  assert.equal(
    simulation.viewModel.cashflowRows.find(row => row.key === 'savable').text,
    '1,300,000원'
  );
  assert.equal(simulation.viewModel.months.text, '11개월');
});

test('독립성: 새 시뮬레이션이 성공하면 조정 결과 초기화, 실패하면 조정 결과 초기화 + 폼 입력 유지', async () => {
  let simCount = 0;
  const { session } = newSession({
    simulate: () => {
      simCount += 1;
      if (simCount === 3) throw httpError(503);
      return simulationFixture();
    },
  });
  fill(session, { monthlyIncome: '2500000' });
  await session.submitSimulation();
  session.setAdjustAmount('100000');
  await session.submitAdjustment();
  assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.READY);

  await session.submitSimulation();
  assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.IDLE);
  assert.equal(session.getSnapshot().simulation.status, SIMULATOR_STATUS.READY);

  session.setAdjustAmount('100000');
  await session.submitAdjustment();
  await session.submitSimulation(); // 3번째 시뮬레이션: 실패
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.simulation.status, SIMULATOR_STATUS.ERROR);
  assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.IDLE);
  assert.equal(snapshot.form.monthlyIncome, '2500000', '폼 입력 유지');
  assert.equal(snapshot.canSubmitAdjustment, false, '결과 없는 상태에서는 조정 불가');
});

// ── 세션: 오류 정책 ──────────────────────────────────────────

test('오류 정책: 재시도 불가 오류는 입력/사용자가 바뀔 때까지 BLOCKED (요청 0회), 재시도 가능 오류는 다시 요청', async () => {
  let mode = 'forbidden';
  const { session, calls } = newSession({
    simulate: () => {
      if (mode === 'forbidden') throw httpError(403);
      if (mode === 'validation') throw httpError(422);
      return simulationFixture();
    },
  });
  fill(session, { monthlyIncome: '2500000' });

  await session.submitSimulation();
  let snapshot = session.getSnapshot();
  assert.equal(snapshot.simulation.errorType, SIMULATOR_ERROR_TYPE.FORBIDDEN);
  assert.equal(snapshot.simulation.retryable, false);
  assert.equal(snapshot.canSubmitSimulation, false);
  assert.equal((await session.submitSimulation()).reason, SUBMIT_REJECT.BLOCKED);
  assert.equal(calls.simulate.length, 1, '같은 입력으로 다시 보내지 않음');

  session.setField('monthlyIncome', '2600000');
  assert.equal(session.getSnapshot().canSubmitSimulation, true, '입력 수정 후 다시 가능');
  mode = 'validation';
  await session.submitSimulation();
  assert.equal(session.getSnapshot().simulation.errorType, SIMULATOR_ERROR_TYPE.VALIDATION);
  assert.equal(session.getSnapshot().canSubmitSimulation, false);

  session.setUser(OTHER_UID);
  assert.equal(session.getSnapshot().canSubmitSimulation, true, '사용자 변경 시 해제');
  mode = 'ok';
  assert.equal((await session.submitSimulation()).status, SIMULATOR_STATUS.READY);
});

test('오류 정책: API-40 오류 유형별 retryable과 메시지 조회', async () => {
  const cases = [
    [apiError(API_ERROR_KIND.NETWORK), SIMULATOR_ERROR_TYPE.NETWORK, true],
    [apiError(API_ERROR_KIND.TIMEOUT), SIMULATOR_ERROR_TYPE.TIMEOUT, true],
    [httpError(500), SIMULATOR_ERROR_TYPE.SERVER, true],
    [httpError(401), SIMULATOR_ERROR_TYPE.UNAUTHORIZED, false],
    [httpError(422), SIMULATOR_ERROR_TYPE.VALIDATION, false],
    [httpError(404), SIMULATOR_ERROR_TYPE.NOT_FOUND, false],
  ];
  for (const [error, errorType, retryable] of cases) {
    const { session } = newSession({
      simulate: () => {
        throw error;
      },
    });
    await session.submitSimulation();
    const { simulation } = session.getSnapshot();
    assert.equal(simulation.status, SIMULATOR_STATUS.ERROR);
    assert.equal(simulation.errorType, errorType);
    assert.equal(simulation.retryable, retryable, errorType);
    assert.equal(typeof describeSimulatorError(simulation.errorType), 'string');
  }
});

test('오류 정책: 취소(CANCELED)는 오류 화면이 아닌 idle', async () => {
  const { session } = newSession({
    simulate: () => {
      throw apiError(API_ERROR_KIND.CANCELED);
    },
  });

  const outcome = await session.submitSimulation();

  assert.equal(outcome.status, SIMULATOR_STATUS.IDLE);
  assert.equal(session.getSnapshot().simulation.status, SIMULATOR_STATUS.IDLE);
  assert.equal(session.getSnapshot().simulation.errorType, null);
  assert.equal(session.getSnapshot().isBusy, false);
});

test('오류 정책: 화면 로직이 만든 view model 오류는 INVALID_RESPONSE(재시도 가능)로 처리', async () => {
  const { session } = newSession({ simulate: () => simulationFixture({ progressRate: '9' }) });

  await session.submitSimulation();

  const { simulation } = session.getSnapshot();
  assert.equal(simulation.status, SIMULATOR_STATUS.ERROR);
  assert.equal(simulation.errorType, SIMULATOR_ERROR_TYPE.INVALID_RESPONSE);
  assert.equal(simulation.result, null, '검증 못 한 값을 정상 결과로 노출하지 않음');
});

test('API-41 오류: adjustment만 error, 재시도 불가는 같은 입력 BLOCKED, 입력 변경 후 재시도 가능', async () => {
  let mode = 'validation';
  const { session, calls } = await readySession({
    adjust: () => {
      if (mode === 'validation') throw httpError(422);
      if (mode === 'network') throw apiError(API_ERROR_KIND.NETWORK);
      return adjustmentFixture();
    },
  });
  session.setAdjustAmount('100000');

  await session.submitAdjustment();
  let snapshot = session.getSnapshot();
  assert.equal(snapshot.adjustment.status, SIMULATOR_STATUS.ERROR);
  assert.equal(snapshot.adjustment.retryable, false);
  assert.equal(snapshot.simulation.status, SIMULATOR_STATUS.READY);
  assert.equal(snapshot.canSubmitAdjustment, false);
  assert.equal((await session.submitAdjustment()).reason, SUBMIT_REJECT.BLOCKED);
  assert.equal(calls.adjust.length, 1);

  session.setAdjustAmount('200000');
  mode = 'network';
  await session.submitAdjustment();
  snapshot = session.getSnapshot();
  assert.equal(snapshot.adjustment.errorType, SIMULATOR_ERROR_TYPE.NETWORK);
  assert.equal(snapshot.adjustment.retryable, true);
  assert.equal(snapshot.canSubmitAdjustment, true);

  mode = 'ok';
  await session.submitAdjustment(); // 수동 재시도
  assert.equal(session.getSnapshot().adjustment.status, SIMULATOR_STATUS.READY);
  assert.equal(calls.adjust.length, 3);
});

// ── 세션: 기준값(API-39) ─────────────────────────────────────

test('baselines: 중복 호출은 1회, 성공은 캐시, 서버 개수·순서 유지', async () => {
  const gate = deferred();
  const list = Array.from({ length: 13 }, (_, index) => baselineFixture({ key: `k${index}` }));
  const { session, calls } = newSession({ baselines: () => gate.promise });

  const first = session.loadBaselines();
  const second = session.loadBaselines();
  assert.equal(session.getSnapshot().baselines.status, SIMULATOR_STATUS.LOADING);
  gate.resolve(list);
  await Promise.all([first, second]);

  assert.equal(calls.baselines, 1);
  const { baselines } = session.getSnapshot();
  assert.equal(baselines.status, SIMULATOR_STATUS.READY);
  assert.deepEqual(
    baselines.viewModel.map(item => item.key),
    list.map(item => item.key)
  );

  await session.loadBaselines();
  assert.equal(calls.baselines, 1, '성공 결과는 세션 캐시 재사용');
});

test('baselines: 빈 목록도 정상(READY), 실패는 캐시하지 않고 수동 재시도로 다시 요청', async () => {
  let mode = 'fail';
  const { session, calls } = newSession({
    baselines: () => {
      if (mode === 'fail') throw apiError(API_ERROR_KIND.NETWORK);
      return [];
    },
  });

  await session.loadBaselines();
  assert.equal(session.getSnapshot().baselines.status, SIMULATOR_STATUS.ERROR);
  assert.equal(session.getSnapshot().canRetryBaselines, true);
  await tick();
  assert.equal(calls.baselines, 1, '자동 재시도 없음');

  mode = 'ok';
  await session.loadBaselines();
  assert.equal(calls.baselines, 2);
  assert.equal(session.getSnapshot().baselines.status, SIMULATOR_STATUS.READY);
  assert.deepEqual(session.getSnapshot().baselines.items, []);
});

test('baselines: 재시도 불가 오류는 다시 요청하지 않고, 사용자 변경 시 초기화', async () => {
  const { session, calls } = newSession({
    baselines: () => {
      throw httpError(403);
    },
  });

  await session.loadBaselines();
  await session.loadBaselines();

  assert.equal(calls.baselines, 1);
  assert.equal(session.getSnapshot().canRetryBaselines, false);

  session.setUser(OTHER_UID);
  assert.equal(session.getSnapshot().baselines.status, SIMULATOR_STATUS.IDLE);
});

// ── 세션: 구독 / 스냅샷 ──────────────────────────────────────

test('세션: subscribe는 변경 시 알리고 해제 가능, 스냅샷은 동결, 같은 값 설정은 알리지 않음', async () => {
  const { session } = newSession();
  let count = 0;
  const unsubscribe = session.subscribe(() => {
    count += 1;
  });

  session.setField('deposit', '100');
  assert.equal(count, 1);
  session.setField('deposit', '100');
  assert.equal(count, 1, '같은 값은 무동작');
  session.setField('unknownField', '1');
  assert.equal(count, 1, '알 수 없는 필드는 무시');

  unsubscribe();
  session.setField('deposit', '200');
  assert.equal(count, 1);
  assert.ok(Object.isFrozen(session.getSnapshot()));
  assert.ok(Object.isFrozen(session.getSnapshot().form));
});

test('세션: 같은 사용자 setUser는 상태를 초기화하지 않음', async () => {
  const { session } = newSession();
  fill(session, { deposit: '100' });
  await session.submitSimulation();
  const before = session.getSnapshot();

  session.setUser(UID);

  assert.equal(session.getSnapshot(), before);
});

// ── 정적 검사 ────────────────────────────────────────────────

test('범위: simulatorScreenLogic은 화면·Redux·AsyncStorage·타이머·난수·Number 변환을 사용하지 않음', () => {
  const source = readFileSync(
    new URL('../../src/features/work/simulatorScreenLogic.js', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)'/gm)].map(match => match[1]);
  assert.deepEqual(imports.sort(), [
    '../moneyRecap/recapScreenLogic',
    '../onboarding/onboardingApi',
    '../onboarding/workOnboardingScreenLogic',
    './readinessScreenLogic',
    './simulatorApi',
  ]);

  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(
    /AsyncStorage|useSelector|dispatch|react-native|from 'react'|setTimeout|setInterval|requestAnimationFrame|Math\.random|Number\(|parseFloat|parseInt|\bfetch\(|axios|apiClient/.test(
      code
    ),
    false
  );
  assert.equal(/\/api\/v1\//.test(code), false, '경로를 직접 하드코딩하지 않음');
  assert.equal(/\bDate\b/.test(code), false);
});
