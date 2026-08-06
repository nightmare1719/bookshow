import { createSlice } from '@reduxjs/toolkit';

const authModalSlice = createSlice({
  name: 'authModal',
  initialState: {
    isOpen: false,
    tab: 'login',
  },
  reducers: {
    openAuthModal: (state, action) => {
      state.isOpen = true;
      state.tab = action.payload || 'login';
    },
    closeAuthModal: (state) => {
      state.isOpen = false;
      state.tab = 'login';
    },
  },
});

export const { openAuthModal, closeAuthModal } = authModalSlice.actions;
export default authModalSlice.reducer;
