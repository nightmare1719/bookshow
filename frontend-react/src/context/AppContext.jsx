import React, { createContext, useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setCurrentUser, setAuthLoading } from '../store/authSlice';
import { setToast } from '../store/toastSlice';
import { openAuthModal as openModalAction, closeAuthModal as closeModalAction } from '../store/authModalSlice';
import { io } from 'socket.io-client';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const dispatch = useDispatch();

  // Read state from Redux store
  const currentUser = useSelector((state) => state.auth.currentUser);
  const authLoading = useSelector((state) => state.auth.authLoading);
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

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      dispatch(setAuthLoading(false));
      return;
    }
    try {
      const data = await apiFetch('/auth/me');
      dispatch(setCurrentUser(data.data.user));
    } catch (err) {
      localStorage.removeItem('token');
      dispatch(setCurrentUser(null));
    } finally {
      dispatch(setAuthLoading(false));
    }
  };

  const login = async (email, password) => {
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.token);
      dispatch(setCurrentUser(data.data.user));
      showToast('Welcome back, ' + (data.data.user.profile?.firstName || data.data.user.email) + '!');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  };

  const register = async (email, password, role, firstName, lastName) => {
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          role,
          profile: { firstName, lastName },
        }),
      });
      localStorage.setItem('token', data.token);
      dispatch(setCurrentUser(data.data.user));
      showToast('Account created! Welcome, ' + firstName + '!');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (_) {}
    localStorage.removeItem('token');
    dispatch(setCurrentUser(null));
    showToast('Logged out successfully');
  };

  const refreshUser = async () => {
    try {
      const data = await apiFetch('/auth/me');
      dispatch(setCurrentUser(data.data.user));
    } catch (_) {}
  };

  useEffect(() => {
    checkAuth();

    const socketUrl = window.location.origin.includes('localhost') ? 'http://localhost:5000' : '/';
    const socket = io(socketUrl, { autoConnect: true });
    window.socket = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser: (user) => dispatch(setCurrentUser(user)),
        refreshUser,
        toast,
        showToast,
        apiFetch,
        authLoading,
        login,
        register,
        logout,
        authModal,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
