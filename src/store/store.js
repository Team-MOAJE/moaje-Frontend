import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import assetReducer from '../features/asset/assetSlice';
import workReducer from '../features/work/workSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    asset: assetReducer,
    work: workReducer,
  },
});

export default store;
