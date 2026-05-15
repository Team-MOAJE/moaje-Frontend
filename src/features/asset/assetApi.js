import { createAsyncThunk } from "@reduxjs/toolkit";
import apiClient from "../../services/apiClient";

export const fetchAccounts = createAsyncThunk(
  "asset/fetchAccounts",
  async (_, { rejectWithValue }) => {
    try {
      const data = await apiClient.get("/api/v1/assets/accounts");
      return data;
    } catch (error) {
      return rejectWithValue(
        error.envelope?.message ||
          error.message ||
          "계좌 목록 조회에 실패했습니다.",
      );
    }
  },
);

export const transferFunds = createAsyncThunk(
  "asset/transferFunds",
  async (transferData, { rejectWithValue }) => {
    try {
      const data = await apiClient.post("/api/v1/transfers", transferData, {
        idempotent: true,
      });

      return data;
    } catch (error) {
      return rejectWithValue(
        error.envelope?.message || error.message || "송금 요청에 실패했습니다.",
      );
    }
  },
);
