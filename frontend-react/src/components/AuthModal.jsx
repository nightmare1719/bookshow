import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register } = useApp();
  const [activeTab, setActiveTab] = useState('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('attendee');

  useEffect(() => {
    if (authModal.isOpen) {
      setActiveTab(authModal.tab);
    }
  }, [authModal]);

  if (!authModal.isOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    const success = await login(email, password);
    if (success) {
      handleClose();
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || !firstName || !lastName) return;
    const success = await register(email, password, role, firstName, lastName);
    if (success) {
      handleClose();
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setRole('attendee');
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
          <form onSubmit={handleLoginSubmit}>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full mt-2">
                Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">First Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Last Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Account Type</label>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="attendee">Attendee (Book Tickets)</option>
                  <option value="organizer">Organizer (Create Events)</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full mt-2">
                Create Account
              </button>
            </div>
          </form>
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
