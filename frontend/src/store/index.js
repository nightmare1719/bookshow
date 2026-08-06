import { configureStore } from '@reduxjs/toolkit';
import userReducer from './userSlice';
import cartReducer from './cartSlice';
import wishlistReducer from './wishlistSlice';
import toastReducer from '../features/toast/toastSlice';
import authModalReducer from '../features/authModal/authModalSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    cart: cartReducer,
    wishlist: wishlistReducer,
    toast: toastReducer,
    authModal: authModalReducer,
  },
});
