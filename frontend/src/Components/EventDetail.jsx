import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apiFetch, showToast, openAuthModal } = useApp();

  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingInProgress, setBookingInProgress] = useState(false);

  const { userInfo } = useSelector((state) => state.user);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const eventData = await apiFetch(`/events/${id}`);
        setEvent(eventData.data.event);
        const seatData = await apiFetch(`/events/${id}/seats`);
        setSeats(seatData.data.seats);
      } catch (err) {
        console.error('Failed to fetch event details or seats:', err);
        showToast('Error loading show details', 'error');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchData();
  }, [id]);

  const toggleSeat = (seat) => {
    if (seat.status === 'booked' || seat.status === 'locked') return;
    setSelectedSeats((prev) => {
      const exists = prev.find((s) => s._id === seat._id);
      if (exists) return prev.filter((s) => s._id !== seat._id);
      if (prev.length >= 10) {
        showToast('Maximum 10 tickets per booking', 'error');
        return prev;
      }
      return [...prev, seat];
    });
  };

  const totalPrice = selectedSeats.reduce((sum, s) => sum + (s.price || 0), 0);

  const handleDirectBook = async () => {
    if (!userInfo) {
      showToast('Please sign in to book tickets', 'error');
      openAuthModal('login');
      return;
    }

    if (selectedSeats.length === 0) {
      showToast('Please select at least one seat', 'error');
      return;
    }

    setBookingInProgress(true);
    try {
      // 1. Lock each seat first as required by the backend
      for (const seat of selectedSeats) {
        await apiFetch('/seats/lock', {
          method: 'POST',
          body: JSON.stringify({ seatId: seat._id }),
        });
      }

      // 2. Complete the booking
      const seatIds = selectedSeats.map((s) => s._id);
      const data = await apiFetch('/bookings/complete', {
        method: 'POST',
        body: JSON.stringify({
          eventId: id,
          seatIds,
          paymentMethod: 'mock',
        }),
      });

      showToast('Booking confirmed!');
      setSelectedSeats([]);
      navigate(`/invoice/${data.data.booking._id}`);
    } catch (err) {
      showToast(err.message || 'Booking failed. Seats may have expired or been taken.', 'error');
    } finally {
      setBookingInProgress(false);
    }
  };

  const getSeatClass = (seat) => {
    if (seat.status === 'booked') return 'seat booked';
    if (seat.status === 'locked') return 'seat locked';
    const isSelected = selectedSeats.find((s) => s._id === seat._id);
    if (isSelected) return 'seat selected';
    
    // Find category index dynamically
    let catIdx = 0;
    if (event && event.seatCategories) {
      const idx = event.seatCategories.findIndex(cat => cat.name === seat.category);
      if (idx !== -1) catIdx = idx;
    }
    return `seat available cat-${catIdx}`;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 flex justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-center text-zinc-500">
        <p>Event not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Back Button */}
      <button
        type="button"
        className="text-zinc-400 hover:text-white transition bg-transparent border-none cursor-pointer text-sm flex items-center gap-2"
        onClick={() => navigate('/')}
      >
        <i className="fas fa-arrow-left"></i> Back to Shows
      </button>

      {/* Banner */}
      <div className="relative w-full h-[280px] sm:h-[350px] rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800">
        <img
          src={event.banner || event.image || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4'}
          alt={event.title}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {/* Header Info */}
          <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="bg-red-500/10 text-red-400 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                {event.category || 'Event'}
              </span>
              <span className="text-zinc-500 text-xs font-semibold">{formatDate(event.date)}</span>
            </div>

            <h1 className="text-3xl font-black text-white">{event.title}</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">{event.description}</p>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800/60 text-sm">
              <div>
                <span className="text-zinc-500 block text-xs uppercase tracking-wider mb-1">Venue</span>
                <p className="font-bold text-white">
                  <i className="fas fa-map-marker-alt mr-1.5 text-red-500"></i>
                  {event.venue || 'TBA'}
                </p>
              </div>
              <div>
                <span className="text-zinc-500 block text-xs uppercase tracking-wider mb-1">Date & Time</span>
                <p className="font-bold text-white">
                  <i className="fas fa-clock mr-1.5 text-red-500"></i>
                  {formatDate(event.date)}
                </p>
              </div>
            </div>
          </div>

        {/* Booking & Showtimes Card */}
          <div className="glass rounded-3xl p-6 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <i className="fas fa-clock text-green-500"></i> Select Show Timing
            </h2>
            
            {/* Pre-booking window indicator */}
            {(() => {
              const created = new Date(event.createdAt || 0);
              const windowEnd = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
              const now = new Date();
              const open = now <= windowEnd;
              const daysLeft = Math.max(0, Math.ceil((windowEnd - now) / (1000 * 60 * 60 * 24)));
              return (
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${
                  open ? 'bg-green-500/10 border-green-500/25 text-green-400' : 'bg-red-500/10 border-red-500/25 text-red-400'
                }`}>
                  <i className={`fas ${open ? 'fa-calendar-check' : 'fa-calendar-times'}`}></i>
                  {open ? `Pre-booking open · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : 'Pre-booking window closed'}
                </div>
              );
            })()}

            <div className="flex flex-wrap gap-3">
              {(event.showtimes && event.showtimes.length > 0 ? event.showtimes : ['06:40 PM']).map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => navigate(`/event/${id}/seats?showtime=${encodeURIComponent(time)}`)}
                  className="px-6 py-3 glass text-green-400 hover:bg-green-600/30 hover:text-white rounded-xl text-sm font-bold transition duration-300 cursor-pointer shadow-md flex items-center gap-2 hover:border-green-500"
                  style={{ borderLeft: '4px solid #16a34a' }}
                >
                  <i className="far fa-play-circle text-xs"></i>
                  {time}
                </button>
              ))}
            </div>
            
            <p className="text-zinc-500 text-xs font-semibold leading-relaxed">
              Select one of the show times above to proceed to the premium seat layout selector.
            </p>
          </div>
        </div>

        {/* Right Panel: Ticket Categories */}
        <div className="space-y-6">
          {event.seatCategories && event.seatCategories.length > 0 && (
            <div className="glass rounded-3xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Pricing Details</h2>
              <div className="space-y-3">
                {event.seatCategories.map((cat, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full animate-pulse"
                        style={{ background: cat.color || '#e50914' }}
                      ></div>
                      <span className="font-semibold text-xs text-white">{cat.name}</span>
                    </div>
                    <span className="text-green-400 font-bold text-sm">
                      {formatCurrency(cat.price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass rounded-3xl p-6 text-center space-y-3">
            <span className="text-3xl">🎫</span>
            <h3 className="font-bold text-sm text-white">Fast Booking Option</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Choose your preferred session time to open our interactive, real-time map. Lock seats for up to 10 tickets per transaction.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
