import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = '/api/auth';

const getInitialUser = () => {
  try {
    const savedUser = localStorage.getItem('userInfo');
    return savedUser ? JSON.parse(savedUser) : null;
  } catch (error) {
    console.error('Failed to load user from localStorage:', error);
    return null;
  }
};

export const registerUser = createAsyncThunk(
  'user/register',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/register`, userData);
      // bookshow returns: { status: 'success', token, data: { user } }
      const { token, data } = response.data;
      const userInfo = { ...data.user, token };
      return userInfo;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Registration failed'
      );
    }
  }
);

export const loginUser = createAsyncThunk(
  'user/login',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/login`, userData);
      const { token, data } = response.data;
      const userInfo = { ...data.user, token };
      return userInfo;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Login failed'
      );
    }
  }
);

export const checkCurrentUser = createAsyncThunk(
  'user/checkMe',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;

      const response = await axios.get(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = response.data;
      return { ...data.user, token };
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      return rejectWithValue('Session expired');
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState: {
    userInfo: getInitialUser(),
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.userInfo = null;
      state.error = null;
      try {
        localStorage.removeItem('userInfo');
        localStorage.removeItem('token');
        axios.post(`${API_URL}/logout`).catch(() => {});
      } catch (error) {
        console.error('Failed to remove user info from localStorage:', error);
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload;
        try {
          localStorage.setItem('userInfo', JSON.stringify(action.payload));
          localStorage.setItem('token', action.payload.token);
        } catch (error) {
          console.error('Failed to save user info to localStorage:', error);
        }
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload;
        try {
          localStorage.setItem('userInfo', JSON.stringify(action.payload));
          localStorage.setItem('token', action.payload.token);
        } catch (error) {
          console.error('Failed to save user info to localStorage:', error);
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Check current user
      .addCase(checkCurrentUser.fulfilled, (state, action) => {
        if (action.payload) {
          state.userInfo = action.payload;
          localStorage.setItem('userInfo', JSON.stringify(action.payload));
        }
      });
  },
});

export const { logout, clearError } = userSlice.actions;
export default userSlice.reducer;
