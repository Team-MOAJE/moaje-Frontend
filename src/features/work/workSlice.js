import { createSlice } from '@reduxjs/toolkit';
import { fetchRecommendations, fetchDailyLimit } from './workApi';
import { normalizeDailyLimit } from '../../utils/apiMappers';

const workSlice = createSlice({
  name: 'work',
  initialState: {
    recommendations: [],
    recommendationsLoading: false,
    recommendationsError: null,

    dailyLimit: null,
    dailyLimitLoading: false,
    dailyLimitError: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchRecommendations.pending, state => {
        state.recommendationsLoading = true;
        state.recommendationsError = null;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        const raw = action.payload;
        state.recommendations = Array.isArray(raw) ? raw : (raw?.recommendations ?? []);
        state.recommendationsLoading = false;
      })
      .addCase(fetchRecommendations.rejected, (state, action) => {
        state.recommendationsLoading = false;
        state.recommendationsError = action.payload?.message ?? '추천 조회에 실패했습니다.';
      })

      .addCase(fetchDailyLimit.pending, state => {
        state.dailyLimitLoading = true;
        state.dailyLimitError = null;
      })
      .addCase(fetchDailyLimit.fulfilled, (state, action) => {
        state.dailyLimit = normalizeDailyLimit(action.payload);
        state.dailyLimitLoading = false;
      })
      .addCase(fetchDailyLimit.rejected, (state, action) => {
        state.dailyLimitLoading = false;
        state.dailyLimitError = action.payload?.message ?? '가용금액 조회에 실패했습니다.';
      });
  },
});

export default workSlice.reducer;
