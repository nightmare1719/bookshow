import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function Navbar({ setPage }) {
  const { currentUser, logout, openAuthModal, apiFetch, showToast } = useApp();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/auth/notifications');
      setNotifications(res.data.notifications || []);
    } catch (_) {}
  };

  React.useEffect(() => {
    if (currentUser) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const handleClearNotifications = async () => {
    try {
      await apiFetch('/auth/notifications/clear', { method: 'POST' });
      setNotifications([]);
      showToast('Notifications cleared.');
    } catch (_) {}
  };

  const handleReadNotification = async (id) => {
    try {
      await apiFetch(`/auth/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(notifications.map(n => n._id === id ? { ...n, read: true } : n));
    } catch (_) {}
  };

  const handleLogoClick = () => {
    setPage({ name: 'home' });
  };

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    setPage({ name: 'home' });
  };

  return (
    <nav className="nav px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={handleLogoClick}>
        <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center font-bold text-sm">
          BS
        </div>
        <span className="text-xl font-bold text-white">BookShow</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          className="btn-secondary text-sm flex items-center gap-1"
          onClick={() => setPage({ name: 'home' })}
        >
          <i className="fas fa-home"></i>Home
        </button>

        {!currentUser ? (
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={() => openAuthModal('login')}>
              Login
            </button>
            <button className="btn-primary text-sm" onClick={() => openAuthModal('register')}>
              Sign Up
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative">
              <button
                className="bg-gray-800 p-2 rounded-lg text-gray-400 hover:text-white relative flex items-center justify-center"
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ width: '36px', height: '36px' }}
              >
                <i className="fas fa-bell"></i>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-700 rounded-lg py-2 w-72 z-[999] shadow-xl text-left">
                  <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-850">
                    <span className="font-bold text-xs text-gray-400">Notifications</span>
                    {notifications.length > 0 && (
                      <button className="text-[10px] text-red-400 hover:text-red-300 font-bold" onClick={handleClearNotifications}>
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-gray-850">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-6">No new alerts.</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n._id}
                          className={`p-3 text-xs cursor-pointer hover:bg-gray-850 transition-colors ${!n.read ? 'bg-blue-950/10' : ''}`}
                          onClick={() => handleReadNotification(n._id)}
                        >
                          <p className="font-bold text-white flex items-center gap-1.5">
                            {!n.read && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>}
                            {n.title}
                          </p>
                          <p className="text-gray-400 mt-1">{n.message}</p>
                          <span className="text-[9px] text-gray-550 block mt-1">{new Date(n.createdAt).toLocaleTimeString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              className="btn-secondary text-sm flex items-center gap-1"
              onClick={() => setPage({ name: 'my-bookings' })}
            >
              <i className="fas fa-ticket-alt"></i>My Tickets
            </button>

            {currentUser.role === 'organizer' && (
              <button
                className="btn-secondary text-sm flex items-center gap-1"
                onClick={() => setPage({ name: 'organizer' })}
              >
                <i className="fas fa-calendar-plus"></i>Manage Events
              </button>
            )}

            <div className="relative">
              <button
                className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-lg text-sm select-none"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
              >
                <i className="fas fa-user-circle text-red-500 text-base"></i>
                <span>{currentUser.profile?.firstName || currentUser.email.split('@')[0]}</span>
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}></i>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg py-1 w-40 z-[999]">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-800 text-red-400 flex items-center gap-2"
                    onMouseDown={handleLogout}
                  >
                    <i className="fas fa-sign-out-alt"></i>Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
