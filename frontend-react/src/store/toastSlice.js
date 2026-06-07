import { createSlice } from '@reduxjs/toolkit';

const toastSlice = createSlice({
  name: 'toast',
  initialState: {
    toast: null,
  },
  reducers: {
    setToast: (state, action) => {
      state.toast = action.payload;
    },
  },
});

export const { setToast } = toastSlice.actions;
export default toastSlice.reducer;
