import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const CATEGORY_COLORS = {
  Gold: '#f59e0b', Silver: '#94a3b8', Bronze: '#b45309',
  Platinum: '#8b5cf6', VIP: '#ec4899', Premium: '#06b6d4', General: '#6b7280',
};
const cc = (n) => CATEGORY_COLORS[n] || '#6b7280';

export default function MyBookings() {
  const navigate = useNavigate();
  const { apiFetch, currentUser, openAuthModal } = useApp();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { openAuthModal('login'); setLoading(false); return; }
    apiFetch('/bookings/my')
      .then((d) => setBookings(d.data.bookings))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center"><div className="spinner"></div></div>
  );

  if (!currentUser) return (
    <div className="min-h-[60vh] flex items-center justify-center text-zinc-500 text-sm">Please login to view bookings</div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-xl font-black text-white mb-6">My Bookings</h1>

      {bookings.length === 0 ? (
        <div className="glass rounded-3xl py-20 text-center space-y-4">
          <i className="fas fa-ticket-alt text-4xl text-zinc-600"></i>
          <p className="text-zinc-400 font-semibold">No bookings yet</p>
          <button
            type="button"
            className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold"
            onClick={() => navigate('/')}
          >
            Browse Events
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const event = booking.eventId || {};
            const seats = booking.seats || [];
            // group by category
            const catGroups = seats.reduce((acc, s) => {
              const cat = s.category || 'General';
              acc[cat] = (acc[cat] || 0) + 1;
              return acc;
            }, {});

            return (
              <div key={booking._id} className="card p-5 hover:border-white/20 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-white text-base truncate">{event.title || 'Event'}</h3>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-zinc-400">
                      <span><i className="fas fa-calendar mr-1 text-red-400/70"></i>{fmtDate(event.date)}</span>
                      {event.venue && <span><i className="fas fa-map-marker-alt mr-1 text-red-400/70"></i>{event.venue}</span>}
                    </div>

                    {/* Seats with category badges */}
                    {seats.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {seats.map((s, i) => (
                          <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full font-mono"
                            style={{ background: cc(s.category) + '22', color: cc(s.category), border: `1px solid ${cc(s.category)}33` }}>
                            {s.seatNumber}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Category summary */}
                    {Object.keys(catGroups).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {Object.entries(catGroups).map(([cat, count]) => (
                          <span key={cat} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: cc(cat) + '15', color: cc(cat) }}>
                            {count}× {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 uppercase tracking-wide">
                      {booking.status}
                    </span>
                    <p className="text-lg font-black text-green-400">{fmt(booking.totalAmount)}</p>
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer font-bold transition"
                      onClick={() => navigate(`/invoice/${booking._id}`)}
                    >
                      View Invoice →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
