import { createSlice } from '@reduxjs/toolkit';

const getInitialCart = () => {
  try {
    const savedUser = localStorage.getItem('userInfo');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      const savedCart = localStorage.getItem(`cart_${user._id}`);
      return savedCart ? JSON.parse(savedCart) : [];
    }
    const savedCart = localStorage.getItem('cart_guest');
    return savedCart ? JSON.parse(savedCart) : [];
  } catch (error) {
    console.error('Failed to load cart from localStorage:', error);
    return [];
  }
};

const cartSlice = createSlice({
  name: 'cart',
  initialState: {
    items: getInitialCart(),
  },
  reducers: {
    addToCart: (state, action) => {
      const item = action.payload;
      const existingItem = state.items.find((cartItem) => cartItem.id === item.id);
      if (!existingItem) {
        state.items.push({ ...item, quantity: 1 });
      }
      saveCartState(state.items);
    },
    removeFromCart: (state, action) => {
      const id = action.payload;
      state.items = state.items.filter((cartItem) => cartItem.id !== id);
      saveCartState(state.items);
    },
    clearCart: (state) => {
      state.items = [];
      saveCartState(state.items);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('user/register/fulfilled', (state, action) => {
        const userId = action.payload._id;
        const savedCart = localStorage.getItem(`cart_${userId}`);
        const userCart = savedCart ? JSON.parse(savedCart) : [];
        const guestCart = state.items;
        const mergedCart = [...userCart];

        guestCart.forEach((guestItem) => {
          const exists = mergedCart.some((item) => item.id === guestItem.id);
          if (!exists) {
            mergedCart.push(guestItem);
          }
        });

        state.items = mergedCart;
        try {
          localStorage.setItem(`cart_${userId}`, JSON.stringify(mergedCart));
          localStorage.removeItem('cart_guest');
        } catch (error) {
          console.error('Failed to save merged cart to localStorage:', error);
        }
      })
      .addCase('user/login/fulfilled', (state, action) => {
        const userId = action.payload._id;
        const savedCart = localStorage.getItem(`cart_${userId}`);
        const userCart = savedCart ? JSON.parse(savedCart) : [];
        const guestCart = state.items;
        const mergedCart = [...userCart];

        guestCart.forEach((guestItem) => {
          const exists = mergedCart.some((item) => item.id === guestItem.id);
          if (!exists) {
            mergedCart.push(guestItem);
          }
        });

        state.items = mergedCart;
        try {
          localStorage.setItem(`cart_${userId}`, JSON.stringify(mergedCart));
          localStorage.removeItem('cart_guest');
        } catch (error) {
          console.error('Failed to save merged cart to localStorage:', error);
        }
      })
      .addCase('user/logout', (state) => {
        state.items = [];
      });
  },
});

function saveCartState(items) {
  try {
    const savedUser = localStorage.getItem('userInfo');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      localStorage.setItem(`cart_${user._id}`, JSON.stringify(items));
    } else {
      localStorage.setItem('cart_guest', JSON.stringify(items));
    }
  } catch (error) {
    console.error('Failed to save cart to localStorage:', error);
  }
}

export const { addToCart, removeFromCart, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
