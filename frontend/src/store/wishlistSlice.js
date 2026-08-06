import { createSlice } from '@reduxjs/toolkit';

const getInitialWishlist = () => {
  try {
    const savedUser = localStorage.getItem('userInfo');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      const savedWishlist = localStorage.getItem(`wishlist_${user._id}`);
      return savedWishlist ? JSON.parse(savedWishlist) : [];
    }
    const savedWishlist = localStorage.getItem('wishlist_guest');
    return savedWishlist ? JSON.parse(savedWishlist) : [];
  } catch (error) {
    console.error('Failed to load wishlist from localStorage:', error);
    return [];
  }
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState: {
    items: getInitialWishlist(),
  },
  reducers: {
    toggleWishlist: (state, action) => {
      const item = action.payload;
      const index = state.items.findIndex((wishItem) => wishItem._id === item._id);
      if (index >= 0) {
        state.items.splice(index, 1);
      } else {
        state.items.push(item);
      }
      saveWishlistState(state.items);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('user/register/fulfilled', (state, action) => {
        const userId = action.payload._id;
        const savedWishlist = localStorage.getItem(`wishlist_${userId}`);
        const userWishlist = savedWishlist ? JSON.parse(savedWishlist) : [];
        const guestWishlist = state.items;
        const mergedWishlist = [...userWishlist];

        guestWishlist.forEach((guestItem) => {
          const exists = mergedWishlist.some((item) => item._id === guestItem._id);
          if (!exists) {
            mergedWishlist.push(guestItem);
          }
        });

        state.items = mergedWishlist;
        try {
          localStorage.setItem(`wishlist_${userId}`, JSON.stringify(mergedWishlist));
          localStorage.removeItem('wishlist_guest');
        } catch (error) {
          console.error('Failed to save merged wishlist to localStorage:', error);
        }
      })
      .addCase('user/login/fulfilled', (state, action) => {
        const userId = action.payload._id;
        const savedWishlist = localStorage.getItem(`wishlist_${userId}`);
        const userWishlist = savedWishlist ? JSON.parse(savedWishlist) : [];
        const guestWishlist = state.items;
        const mergedWishlist = [...userWishlist];

        guestWishlist.forEach((guestItem) => {
          const exists = mergedWishlist.some((item) => item._id === guestItem._id);
          if (!exists) {
            mergedWishlist.push(guestItem);
          }
        });

        state.items = mergedWishlist;
        try {
          localStorage.setItem(`wishlist_${userId}`, JSON.stringify(mergedWishlist));
          localStorage.removeItem('wishlist_guest');
        } catch (error) {
          console.error('Failed to save merged wishlist to localStorage:', error);
        }
      })
      .addCase('user/logout', (state) => {
        state.items = [];
      });
  },
});

function saveWishlistState(items) {
  try {
    const savedUser = localStorage.getItem('userInfo');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      localStorage.setItem(`wishlist_${user._id}`, JSON.stringify(items));
    } else {
      localStorage.setItem('wishlist_guest', JSON.stringify(items));
    }
  } catch (error) {
    console.error('Failed to save wishlist to localStorage:', error);
  }
}

export const { toggleWishlist } = wishlistSlice.actions;
export default wishlistSlice.reducer;
