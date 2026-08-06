import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import SignIn from './login/SignIn';
import SignUp from './login/SignUp';

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register } = useApp();
  const [activeTab, setActiveTab] = useState('login');

  useEffect(() => {
    if (authModal.isOpen) {
      setActiveTab(authModal.tab);
    }
  }, [authModal]);

  if (!authModal.isOpen) return null;

  const handleLogin = async (email, password) => {
    const success = await login(email, password);
    if (success) handleClose();
  };

  const handleRegister = async (email, password, role, firstName, lastName, referralCode) => {
    const success = await register(email, password, role, firstName, lastName, referralCode);
    if (success) handleClose();
  };

  const handleClose = () => {
    closeAuthModal();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="flex gap-4 mb-6">
          <button
            type="button"
            className={`tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            Sign Up
          </button>
        </div>

        {activeTab === 'login' ? (
          <SignIn onLogin={handleLogin} onClose={handleClose} />
        ) : (
          <SignUp onRegister={handleRegister} onClose={handleClose} />
        )}

        <button
          type="button"
          className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl"
          onClick={handleClose}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
}
