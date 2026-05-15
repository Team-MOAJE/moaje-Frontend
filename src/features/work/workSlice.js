import { createSlice } from '@reduxjs/toolkit';
import { fetchRecommendations } from './workApi';

const workSlice = createSlice({
  name: 'work',
  initialState: {
    recommendations: [],
    isLoading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecommendations.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.recommendations = action.payload ?? [];
        state.isLoading = false;
      })
      .addCase(fetchRecommendations.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? '추천 조회에 실패했습니다.';
      });
  },
});

export default workSlice.reducer;
