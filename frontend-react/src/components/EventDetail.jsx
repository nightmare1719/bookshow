import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function EventDetail({ eventId, setPage }) {
  const { apiFetch, currentUser, openAuthModal, showToast } = useApp();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamInfo, setStreamInfo] = useState({ isLive: false, streamUrl: '' });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    const loadEvent = async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/events/${eventId}`);
        setEvent(data.data.event);
      } catch (err) {
        showToast('Failed to load event: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    const fetchStream = async () => {
      try {
        const res = await apiFetch(`/events/${eventId}/streaming`);
        setStreamInfo(res.data.stream);
      } catch (_) {}
    };

    if (eventId) {
      loadEvent();
      fetchStream();
    }
  }, [eventId]);

  useEffect(() => {
    if (window.socket) {
      window.socket.on('event-stream-status', (data) => {
        if (data.eventId === eventId) {
          setStreamInfo({ isLive: data.isLive, streamUrl: data.streamUrl });
          if (data.isLive) {
            showToast('The event live stream has started! Tune in below.', 'info');
          }
        }
      });

      window.socket.on('stream-chat-receive', (msg) => {
        if (msg.eventId === eventId) {
          setChatMessages((prev) => [...prev, msg]);
        }
      });
    }

    return () => {
      if (window.socket) {
        window.socket.off('event-stream-status');
        window.socket.off('stream-chat-receive');
      }
    };
  }, [eventId]);

  const handleBookTickets = () => {
    if (!currentUser) {
      openAuthModal('login');
      showToast('Please login to book tickets', 'info');
      return;
    }
    setPage({ name: 'seats', eventId: event._id });
  };

  const handleSendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = {
      eventId,
      user: currentUser?.profile?.firstName || currentUser?.email.split('@')[0] || 'Attendee',
      message: chatInput.trim(),
      timestamp: new Date().toISOString()
    };
    if (window.socket) {
      window.socket.emit('stream-chat-send', msg);
    } else {
      setChatMessages((prev) => [...prev, msg]);
    }
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'home' })}
        >
          <i className="fas fa-arrow-left"></i> Back to Events
        </button>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-center">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'home' })}
        >
          <i className="fas fa-arrow-left"></i> Back to Events
        </button>
        <p className="text-xl text-gray-400">Event not found.</p>
      </div>
    );
  }

  const available = event.totalSeats - event.seatsSold;
  const pct = Math.round((event.seatsSold / event.totalSeats) * 100);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        className="text-gray-400 hover:text-white mb-6 flex items-center gap-2 transition-colors"
        onClick={() => setPage({ name: 'home' })}
      >
        <i className="fas fa-arrow-left"></i> Back to Events
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="h-64 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center mb-6">
            <i className="fas fa-calendar-star text-8xl text-gray-600"></i>
          </div>
          <h1 className="text-4xl font-bold mb-3 text-white">{event.title}</h1>
          <p className="text-gray-400 mb-6 whitespace-pre-wrap">
            {event.description || 'No description provided.'}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-gray-400 text-sm mb-1">Venue</p>
              <p className="font-semibold">
                <i className="fas fa-map-marker-alt mr-2 text-red-500"></i>
                {event.venue}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-400 text-sm mb-1">Date & Time</p>
              <p className="font-semibold">
                <i className="fas fa-clock mr-2 text-blue-400"></i>
                {formatDate(event.date)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-400 text-sm mb-1">Category</p>
              <p className="font-semibold">
                <i className="fas fa-tag mr-2 text-purple-400"></i>
                {event.category}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-400 text-sm mb-1">Availability</p>
              <p className="font-semibold">
                <i className="fas fa-chair mr-2 text-green-400"></i>
                {available} / {event.totalSeats} seats
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="card p-6 sticky top-24">
            <p className="text-gray-400 text-sm mb-1">Starting from</p>
            <p className="text-4xl font-bold text-green-400 mb-4">{formatCurrency(event.basePrice)}</p>
            <div className="bg-gray-800 rounded-full h-2 mb-2">
              <div className="bg-red-500 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              {event.seatsSold} of {event.totalSeats} seats booked
            </p>

            {available > 0 ? (
              <button className="btn-primary w-full text-lg py-3" onClick={handleBookTickets}>
                <i className="fas fa-ticket-alt mr-2"></i>Book Tickets
              </button>
            ) : (
              <button className="w-full py-3 bg-gray-700 text-gray-400 rounded-lg font-bold cursor-not-allowed">
                Sold Out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LIVE STREAMING ARENA */}
      {streamInfo.isLive && (
        <div className="mt-12 card border border-gray-700 p-6">
          <h3 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
            <i className="fas fa-broadcast-tower text-red-500 mr-1"></i>Live Event Streaming Arena
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Video Player */}
            <div className="lg:col-span-2 rounded-xl overflow-hidden bg-black border border-gray-800 relative aspect-video">
              <video
                src={streamInfo.streamUrl}
                controls
                autoPlay
                muted
                loop
                className="w-full h-full object-cover"
              />
            </div>

            {/* Socket Chat Room */}
            <div className="flex flex-col h-[350px] lg:h-auto border border-gray-800 bg-[#121212]/40 rounded-xl overflow-hidden p-4">
              <h4 className="font-bold text-sm text-gray-300 border-b border-gray-800 pb-2 mb-3">
                <i className="fas fa-comments text-blue-400 mr-2"></i>Live Stream Chat
              </h4>
              
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-[220px] text-xs">
                {chatMessages.length === 0 ? (
                  <p className="text-gray-500 text-center py-10">Welcome to the stream chat! Be the first to say hi.</p>
                ) : (
                  chatMessages.map((m, idx) => (
                    <div key={idx} className="bg-gray-900/30 p-2 rounded border border-gray-850 text-left">
                      <span className="font-bold text-purple-400 mr-1">{m.user}:</span>
                      <span className="text-gray-200">{m.message}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChatMessage} className="flex gap-2 mt-auto">
                <input
                  type="text"
                  placeholder={currentUser ? "Send a chat message..." : "Login to chat..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={!currentUser}
                  className="input text-xs py-1.5 px-3 flex-1"
                  style={{ background: '#1c1c1c' }}
                />
                <button
                  type="submit"
                  disabled={!currentUser}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
