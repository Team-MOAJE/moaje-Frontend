import { useCallback, useMemo, useReducer } from 'react';
import { FINANCIAL_ONBOARDING_QUESTIONS } from '../../constants/financialOnboardingQuestions';

const TOTAL_QUESTIONS = FINANCIAL_ONBOARDING_QUESTIONS.length;

function clampIndex(index) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(index, 0), TOTAL_QUESTIONS - 1);
}

function buildInitialState({ mode, initialAnswers, initialIndex }) {
  return {
    mode: mode === 'retake' ? 'retake' : 'initial',
    currentIndex: clampIndex(initialIndex),
    answers: initialAnswers ? { ...initialAnswers } : {},
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SELECT_ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.payload.questionId]: action.payload.optionId },
      };
    case 'GO_NEXT':
      return { ...state, currentIndex: clampIndex(state.currentIndex + 1) };
    case 'GO_PREV':
      return { ...state, currentIndex: clampIndex(state.currentIndex - 1) };
    default:
      return state;
  }
}

export function getMissingQuestionIds(answers) {
  return FINANCIAL_ONBOARDING_QUESTIONS.filter(question => !answers?.[question.id]).map(
    question => question.id
  );
}

/**
 * 재무 온보딩 질문 화면의 재사용 가능한 상태 로직.
 * storage/repository를 전혀 알지 못하며, draft 저장이 필요하면 onStateChange 콜백을 통해서만 위임한다.
 */
export function useOnboardingFlow({ mode, initialAnswers, initialIndex, onStateChange }) {
  const [state, dispatch] = useReducer(
    reducer,
    { mode, initialAnswers, initialIndex },
    buildInitialState
  );

  const currentQuestion = FINANCIAL_ONBOARDING_QUESTIONS[state.currentIndex];

  const emitChange = useCallback(
    nextState => {
      if (onStateChange) {
        onStateChange({
          currentIndex: nextState.currentIndex,
          answers: nextState.answers,
          mode: nextState.mode,
        });
      }
    },
    [onStateChange]
  );

  const selectAnswer = useCallback(
    optionId => {
      const action = {
        type: 'SELECT_ANSWER',
        payload: { questionId: currentQuestion.id, optionId },
      };
      const nextState = reducer(state, action);
      dispatch(action);
      emitChange(nextState);
    },
    [state, currentQuestion, emitChange]
  );

  const goNext = useCallback(() => {
    const nextState = reducer(state, { type: 'GO_NEXT' });
    dispatch({ type: 'GO_NEXT' });
    emitChange(nextState);
  }, [state, emitChange]);

  const goPrev = useCallback(() => {
    const nextState = reducer(state, { type: 'GO_PREV' });
    dispatch({ type: 'GO_PREV' });
    emitChange(nextState);
  }, [state, emitChange]);

  const missingQuestionIds = useMemo(() => getMissingQuestionIds(state.answers), [state.answers]);

  return {
    mode: state.mode,
    currentIndex: state.currentIndex,
    answers: state.answers,
    currentQuestion,
    isCurrentAnswered: Boolean(state.answers[currentQuestion.id]),
    isFirst: state.currentIndex === 0,
    isLast: state.currentIndex === TOTAL_QUESTIONS - 1,
    isComplete: missingQuestionIds.length === 0,
    missingQuestionIds,
    selectAnswer,
    goNext,
    goPrev,
  };
}
