import { createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "../../services/apiClient";

export const fetchRecommendations = createAsyncThunk(
  "work/fetchRecommendations",
  async (filters, { rejectWithValue }) => {
    try {
      const data = await apiClient.get("/api/v1/work/recommendations", {
        params: filters,
      });

      return data;
    } catch (error) {
      return rejectWithValue(
        error.envelope?.message ||
          error.message ||
          "추천 정보 조회에 실패했습니다.",
      );
    }
  },
);
