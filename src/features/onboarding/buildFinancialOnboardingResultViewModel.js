import { FINANCIAL_ONBOARDING_QUESTIONS } from '../../constants/financialOnboardingQuestions';
import {
  FALLBACK_PROFILE,
  FUTURE_CONFIG,
  MAX_PROFILE_TAGS,
  PROFILE_CONFIG,
  PROFILE_SCORES,
  PROFILE_TAGS,
  TAG_QUESTION_ORDER,
  TIE_BREAK_ORDER,
} from '../../constants/futureProfileConfig';

// 순수/결정적 함수. 랜덤·시간·네트워크를 사용하지 않는다.
// 나중에 서버 결과가 생기면 같은 반환 형태만 맞춰 이 builder를 adapter로 교체한다.
export function buildFinancialOnboardingResultViewModel(answers) {
  const safeAnswers = answers && typeof answers === 'object' ? answers : {};

  return {
    profile: buildProfile(safeAnswers),
    future: buildFuture(safeAnswers),
  };
}

// 답변 id 기반 점수 합산. 알 수 없는 id는 무시한다.
function scoreProfileTypes(answers) {
  const scores = {};
  Object.entries(PROFILE_SCORES).forEach(([questionId, optionScores]) => {
    const delta = optionScores[answers[questionId]];
    if (!delta) return;
    Object.entries(delta).forEach(([type, points]) => {
      scores[type] = (scores[type] ?? 0) + points;
    });
  });
  return scores;
}

// 최고점 type 선택. 동점이면 TIE_BREAK_ORDER에서 앞선 type. 점수가 전혀 없으면 null.
function pickProfileType(scores) {
  let bestType = null;
  let bestScore = 0;
  TIE_BREAK_ORDER.forEach(type => {
    const score = scores[type] ?? 0;
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  });
  return bestType;
}

function buildTags(answers) {
  const tags = [];
  TAG_QUESTION_ORDER.forEach(questionId => {
    const tag = PROFILE_TAGS[questionId]?.[answers[questionId]];
    if (tag && !tags.includes(tag)) tags.push(tag);
  });
  return tags.slice(0, MAX_PROFILE_TAGS);
}

function buildProfile(answers) {
  const type = pickProfileType(scoreProfileTypes(answers));
  const base = type ? { type, ...PROFILE_CONFIG[type] } : FALLBACK_PROFILE;

  return {
    type: base.type,
    title: base.title,
    description: base.description,
    tags: buildTags(answers),
    imageKey: base.imageKey,
    placeholderIcon: base.placeholderIcon,
  };
}

// Q9 label은 질문 데이터에서 그대로 읽는다(새 문구를 만들지 않음).
function buildFuture(answers) {
  const question = FINANCIAL_ONBOARDING_QUESTIONS.find(q => q.id === 'q9');
  const option = question?.options.find(o => o.id === answers.q9);
  if (!option) return null;
  return { label: FUTURE_CONFIG.label, title: option.label, icon: FUTURE_CONFIG.icon };
}
