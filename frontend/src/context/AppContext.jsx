import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { checkCurrentUser, loginUser, registerUser, logout } from '../store/userSlice';
import { setToast } from '../features/toast/toastSlice';
import { openAuthModal as openModalAction, closeAuthModal as closeModalAction } from '../features/authModal/authModalSlice';
import { io } from 'socket.io-client';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const dispatch = useDispatch();
  const [authLoading, setAuthLoading] = useState(true);

  // Read state from Redux store
  const currentUser = useSelector((state) => state.user.userInfo);
  const toast = useSelector((state) => state.toast.toast);
  const authModalState = useSelector((state) => state.authModal);

  // Map authModal state for components backward compatibility
  const authModal = {
    isOpen: authModalState.isOpen,
    tab: authModalState.tab,
  };

  const openAuthModal = (tab = 'login') => {
    dispatch(openModalAction(tab));
  };

  const closeAuthModal = () => {
    dispatch(closeModalAction());
  };

  const showToast = (message, type = 'success') => {
    dispatch(setToast({ message, type }));
    const timer = setTimeout(() => {
      dispatch(setToast(null));
    }, 3500);
    return () => clearTimeout(timer);
  };

  const apiFetch = async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api' + url, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  };

  const login = async (email, password) => {
    try {
      const result = await dispatch(loginUser({ email, password })).unwrap();
      showToast('Welcome back, ' + (result.profile?.firstName || result.name || result.email) + '!');
      return true;
    } catch (err) {
      showToast(err || 'Login failed', 'error');
      return false;
    }
  };

  const register = async (email, password, role, firstName, lastName, referralCode) => {
    try {
      const result = await dispatch(registerUser({
        email,
        password,
        role,
        profile: { firstName, lastName },
        referralCode
      })).unwrap();
      showToast('Account created! Welcome, ' + firstName + '!');
      return true;
    } catch (err) {
      showToast(err || 'Registration failed', 'error');
      return false;
    }
  };

  const handleLogout = async () => {
    dispatch(logout());
    showToast('Logged out successfully');
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await dispatch(checkCurrentUser()).unwrap();
      } catch (err) {
        console.warn('Initial auth check failed or no token:', err);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();

    const socketUrl = window.location.origin.includes('localhost') ? 'http://localhost:5000' : '/';
    const socket = io(socketUrl, { autoConnect: true });
    window.socket = socket;

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        refreshUser: () => dispatch(checkCurrentUser()),
        toast,
        showToast,
        apiFetch,
        authLoading,
        login,
        register,
        logout: handleLogout,
        authModal,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
