import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../store/userSlice';
import { useApp } from '../context/AppContext';

export default function Navbar() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast, apiFetch } = useApp();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const { userInfo } = useSelector((state) => state.user);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  useEffect(() => {
    if (!userInfo) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const fetchNotifs = async () => {
      try {
        const res = await apiFetch('/users/notifications');
        setNotifications(res.data.notifications || []);
        setUnreadCount((res.data.notifications || []).filter(n => !n.read).length);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };
    fetchNotifs();

    // Listen to real-time socket events
    const socket = window.socket;
    if (socket) {
      const handleNewNotification = (notif) => {
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
        showToast(`🔔 ${notif.title}: ${notif.message}`);
      };

      const handleBroadcastNotification = (notif) => {
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
        showToast(`📢 ${notif.title}: ${notif.message}`);
      };

      socket.on(`notification-${userInfo._id}`, handleNewNotification);
      socket.on('broadcast-notification', handleBroadcastNotification);

      return () => {
        socket.off(`notification-${userInfo._id}`, handleNewNotification);
        socket.off('broadcast-notification', handleBroadcastNotification);
      };
    }
  }, [userInfo]);

  const markAsRead = async (id) => {
    try {
      await apiFetch(`/users/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    try {
      await apiFetch('/users/notifications/clear', { method: 'POST' });
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    showToast('Logged out successfully');
    navigate('/');
    setMobileOpen(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <nav className="glass-nav py-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-4">
        
        {/* Brand Logo */}
        <Link
          to="/"
          className="text-2xl font-black text-red-500 hover:text-red-400 transition cursor-pointer select-none flex items-center gap-2 decoration-none no-underline"
        >
          <span>🎫</span> BookShow
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, concerts, venues..."
            className="w-full glass-field text-sm px-4 py-2.5 rounded-l-xl"
          />
          <button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-5 py-2.5 rounded-r-xl transition cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-bold text-zinc-300">
          <Link to="/" className="hover:text-white transition no-underline">
            Home
          </Link>
          
          {userInfo && (userInfo.role === 'organizer' || userInfo.role === 'admin') && (
            <Link to="/admin/products" className="text-red-400 hover:text-red-300 transition no-underline font-extrabold">
              Organizer Panel
            </Link>
          )}

          {userInfo && (
            <Link to="/my-bookings" className="hover:text-white transition no-underline">
              My Bookings
            </Link>
          )}
        </div>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">

          {/* Authentication */}
          {userInfo ? (
            <div className="flex items-center gap-3 ml-2 border-l border-zinc-800 pl-3">
              {/* Notification Bell */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="relative text-zinc-400 hover:text-white transition bg-transparent border-none cursor-pointer p-1.5 focus:outline-none flex items-center justify-center"
                >
                  <span className="text-lg">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="absolute right-0 mt-3 w-80 glass-strong border border-white/10 rounded-2xl shadow-2xl p-4 z-50 text-left">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                      <span className="font-bold text-sm">Notifications</span>
                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAll}
                          className="text-xs text-red-400 hover:text-red-300 font-semibold bg-transparent border-none cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                      {notifications.length === 0 ? (
                        <div className="text-center text-zinc-500 text-xs py-6">
                          No new notifications
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif._id}
                            onClick={() => !notif.read && markAsRead(notif._id)}
                            className={`p-2.5 rounded-xl transition cursor-pointer text-[11px] ${
                              notif.read
                                ? 'bg-white/5 text-zinc-400 hover:bg-white/10'
                                : 'bg-white/10 text-white hover:bg-white/15 border-l-2 border-red-500'
                            }`}
                          >
                            <div className="font-bold flex items-center justify-between mb-0.5">
                              <span>{notif.title}</span>
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                              )}
                            </div>
                            <p className="leading-relaxed">{notif.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <span className="text-xs text-zinc-400 font-semibold max-w-[100px] truncate">
                Hi, {userInfo.profile?.firstName || userInfo.name || userInfo.email.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="btn-ghost text-white text-xs font-bold py-2 px-4 rounded-xl transition cursor-pointer border-none"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/signin')}
              className="btn-ghost text-white text-xs font-bold py-2 px-4 rounded-xl transition cursor-pointer border-none"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-2xl text-zinc-300 hover:text-white cursor-pointer bg-transparent border-none"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Sidebar/Menu */}
      {mobileOpen && (
        <div className="md:hidden glass-nav border-t border-white/10 mt-3 px-6 py-4 space-y-4">
          <form onSubmit={handleSearch} className="flex">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full glass-field text-xs px-3 py-2 rounded-l-xl focus:outline-none"
            />
            <button
              type="submit"
              className="bg-red-600 text-white text-xs font-bold px-4 rounded-r-xl cursor-pointer"
            >
              Go
            </button>
          </form>

          <div className="flex flex-col space-y-3 font-bold text-sm text-zinc-300">
            <Link to="/" onClick={() => setMobileOpen(false)} className="hover:text-white transition no-underline">
              Home
            </Link>
            
            {userInfo && (userInfo.role === 'organizer' || userInfo.role === 'admin') && (
              <Link to="/admin/products" onClick={() => setMobileOpen(false)} className="text-red-400 hover:text-red-300 transition no-underline font-extrabold">
                Organizer Panel
              </Link>
            )}

            {userInfo && (
              <Link to="/my-bookings" onClick={() => setMobileOpen(false)} className="hover:text-white transition no-underline">
                My Bookings
              </Link>
            )}
          </div>

          {/* No Cart/Wishlist items mobile */}

          <div className="pt-2">
            {userInfo ? (
              <div className="flex items-center justify-between border-t border-zinc-800/50 pt-3">
                <span className="text-xs text-zinc-400 font-semibold truncate">
                  Logged in as {userInfo.profile?.firstName || userInfo.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-ghost text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer border-none"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { navigate('/signin'); setMobileOpen(false); }}
                className="w-full btn-ghost text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer border-none"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
