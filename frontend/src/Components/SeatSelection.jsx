import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/helpers';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt2 = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_PALETTE = {
  Gold: { bg: 'rgba(245,158,11,0.18)', border: '#f59e0b', text: '#f59e0b' },
  Silver: { bg: 'rgba(148,163,184,0.18)', border: '#94a3b8', text: '#cbd5e1' },
  Bronze: { bg: 'rgba(180,83,9,0.22)', border: '#b45309', text: '#d97706' },
  Platinum: { bg: 'rgba(139,92,246,0.18)', border: '#8b5cf6', text: '#a78bfa' },
  VIP: { bg: 'rgba(236,72,153,0.18)', border: '#ec4899', text: '#f472b6' },
  Premium: { bg: 'rgba(6,182,212,0.18)', border: '#06b6d4', text: '#22d3ee' },
  General: { bg: 'rgba(255,255,255,0.07)', border: '#52525b', text: '#a1a1aa' },
};

const catStyle = (name = '', selected = false, booked = false) => {
  if (booked) return { bg: 'rgba(255,255,255,0.04)', border: 'transparent', text: 'rgba(255,255,255,0.2)' };
  if (selected) return { bg: 'rgba(34,197,94,0.8)', border: '#4ade80', text: '#fff', shadow: '0 4px 18px -6px rgba(34,197,94,0.7)' };
  return CATEGORY_PALETTE[name] || CATEGORY_PALETTE.General;
};

const calcPricing = (seats) => {
  const ticketPrice = seats.reduce((s, x) => s + (x.price || 0), 0);
  const platformFee = seats.length * 2;
  const base = ticketPrice + platformFee;
  const gst = Math.round(base * 0.12 * 100) / 100;
  const total = Math.round((base + gst) * 100) / 100;
  return { ticketPrice, platformFee, gst, total };
};

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── component ──────────────────────────────────────────────────────────────
export default function SeatSelection() {
  const { id: eventId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiFetch, showToast, openAuthModal, currentUser } = useApp();

  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticketMax, setTicketMax] = useState(2);
  const [editTickets, setEditTickets] = useState(false);
  const [zoom, setZoom] = useState(1);

  // page: 'seats' | 'summary' | 'paying'
  const [page, setPage] = useState('seats');
  const [bookingInProgress, setBookingInProgress] = useState(false);

  const selectedShowtime = searchParams.get('showtime') || '';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const evRes = await apiFetch(`/events/${eventId}`);
      const ev = evRes.data.event;
      setEvent(ev);

      const st = selectedShowtime || (ev.showtimes?.[0] ?? '');
      const seatsRes = await apiFetch(`/events/${eventId}/seats${st ? `?showtime=${encodeURIComponent(st)}` : ''}`);
      setSeats(seatsRes.data.seats);
      setSelectedSeats([]);
    } catch {
      showToast('Failed to load show details', 'error');
    } finally {
      setLoading(false);
    }
  }, [eventId, selectedShowtime]);

  useEffect(() => { if (eventId) fetchData(); }, [fetchData]);

  const toggleSeat = (seat) => {
    if (seat.status === 'booked' || seat.status === 'locked') return;
    setSelectedSeats((prev) => {
      const exists = prev.find((s) => s._id === seat._id);
      if (exists) return prev.filter((s) => s._id !== seat._id);
      if (prev.length >= ticketMax) {
        showToast(`Max ${ticketMax} tickets selected`, 'info');
        return [...prev.slice(1), seat];
      }
      return [...prev, seat];
    });
  };

  // ─── payment ──────────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!currentUser) { openAuthModal('login'); return; }
    setBookingInProgress(true);
    try {
      // 1. Lock seats
      for (const seat of selectedSeats) {
        await apiFetch('/seats/lock', { method: 'POST', body: JSON.stringify({ seatId: seat._id }) });
      }

      const seatIds = selectedSeats.map((s) => s._id);

      // 2. Create Razorpay order
      const orderRes = await apiFetch('/bookings/razorpay-order', {
        method: 'POST',
        body: JSON.stringify({ eventId, seatIds }),
      });

      const { orderId, amount, currency, keyId, isMock } = orderRes.data || orderRes;

      if (isMock || !window.Razorpay) {
        // Mock / fallback
        const data = await apiFetch('/bookings/complete', {
          method: 'POST',
          body: JSON.stringify({ eventId, seatIds, paymentMethod: 'mock' }),
        });
        showToast('Booking confirmed!');
        navigate(`/invoice/${data.data.booking._id}`);
        return;
      }

      // 3. Open Razorpay checkout
      const rzp = new window.Razorpay({
        key: keyId,
        amount,
        currency,
        order_id: orderId,
        name: event.title,
        description: `Tickets for ${event.title}`,
        prefill: { name: currentUser?.profile?.firstName || '', email: currentUser?.email || '' },
        theme: { color: '#e11d48' },
        handler: async (response) => {
          try {
            const data = await apiFetch('/bookings/verify-razorpay', {
              method: 'POST',
              body: JSON.stringify({
                eventId, seatIds,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            showToast('Payment successful!');
            navigate(`/invoice/${data.data.booking._id}`);
          } catch (err) {
            showToast(err.message || 'Payment verification failed', 'error');
          }
        },
        modal: { ondismiss: () => { setBookingInProgress(false); showToast('Payment cancelled', 'error'); } },
      });
      rzp.open();
    } catch (err) {
      showToast(err.message || 'Booking failed', 'error');
      setBookingInProgress(false);
    }
  };

  // ─── pre-booking window check (client side) ───────────────────────────────
  const isBookingOpen = () => {
    if (!event) return false;
    const created = new Date(event.createdAt || event._id && new Date(parseInt(event._id.substring(0, 8), 16) * 1000));
    const end = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
    return new Date() <= end;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center"><div className="spinner"></div>
        <p className="text-zinc-400 mt-4 text-xs font-semibold uppercase tracking-wider">Loading Seats…</p>
      </div>
    </div>
  );

  if (!event) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">Event not found</div>
  );

  const pricing = calcPricing(selectedSeats);

  // ─── summary page ──────────────────────────────────────────────────────────
  if (page === 'summary') {
    return <BookingSummary
      event={event}
      selectedSeats={selectedSeats}
      showtime={selectedShowtime}
      pricing={pricing}
      onBack={() => setPage('seats')}
      onPay={handlePay}
      bookingInProgress={bookingInProgress}
      isBookingOpen={isBookingOpen()}
    />;
  }

  const selectZoneQty = (zone, qty) => {
    const avail = zone.seats.filter((s) => s.status === 'available');
    setSelectedSeats((prev) => {
      const filtered = prev.filter((s) => s.category !== zone.name);
      return [...filtered, ...avail.slice(0, qty)];
    });
  };

  return <SeatLayout
    event={event}
    seats={seats}
    selectedSeats={selectedSeats}
    toggleSeat={toggleSeat}
    selectZoneQty={selectZoneQty}
    ticketMax={ticketMax}
    setTicketMax={setTicketMax}
    editTickets={editTickets}
    setEditTickets={setEditTickets}
    zoom={zoom}
    setZoom={setZoom}
    selectedShowtime={selectedShowtime}
    setSearchParams={setSearchParams}
    pricing={pricing}
    onProceed={() => {
      if (!currentUser) { openAuthModal('login'); return; }
      if (!isBookingOpen()) { showToast('Pre-booking window has closed for this event', 'error'); return; }
      setPage('summary');
    }}
    navigate={navigate}
    eventId={eventId}
    isBookingOpen={isBookingOpen()}
  />;
}

// ─── Booking Summary ─────────────────────────────────────────────────────────
function BookingSummary({ event, selectedSeats, showtime, pricing, onBack, onPay, bookingInProgress, isBookingOpen }) {
  const CATEGORY_COLORS = {
    Gold: '#f59e0b', Silver: '#94a3b8', Bronze: '#b45309',
    Platinum: '#8b5cf6', VIP: '#ec4899', Premium: '#06b6d4', General: '#6b7280',
  };
  const cc = (n) => CATEGORY_COLORS[n] || '#6b7280';

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-lg mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 bg-transparent border-none cursor-pointer transition">
          <i className="fas fa-arrow-left"></i> Back to Seats
        </button>

        <h1 className="text-xl font-black text-white mb-6">Order Summary</h1>

        {/* Show info */}
        <div className="card p-5 mb-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-film text-red-400 text-sm"></i>
            </div>
            <div>
              <p className="font-black text-white text-base">{event.title}</p>
              <p className="text-zinc-400 text-xs mt-0.5">
                <i className="fas fa-map-marker-alt mr-1 text-red-400/70"></i>{event.venue}
              </p>
              <p className="text-zinc-400 text-xs mt-0.5">
                <i className="fas fa-calendar mr-1 text-red-400/70"></i>
                {new Date(event.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                {showtime && <span className="ml-2 text-green-400 font-semibold">@ {showtime}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Seats */}
        <div className="card p-5 mb-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">Selected Seats ({selectedSeats.length})</p>
          <div className="space-y-2">
            {selectedSeats.map((s) => (
              <div key={s._id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white text-sm">{s.seatNumber}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: cc(s.category) + '22', color: cc(s.category), border: `1px solid ${cc(s.category)}44` }}>
                    {s.category || 'General'}
                  </span>
                </div>
                <span className="text-green-400 font-semibold text-sm">{formatCurrency(s.price)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price breakdown */}
        <div className="card p-5 mb-6 space-y-2.5 text-sm">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Price Breakdown</p>
          <PRow label="Ticket Price" val={fmt2(pricing.ticketPrice)} />
          <PRow label={`Platform Fee (₹2 × ${selectedSeats.length})`} val={fmt2(pricing.platformFee)} />
          <PRow label="GST (12%)" val={fmt2(pricing.gst)} />
          <div className="border-t border-white/[0.08] pt-3 flex justify-between items-center">
            <span className="font-bold text-white">Total</span>
            <span className="text-xl font-black text-green-400">{fmt2(pricing.total)}</span>
          </div>
        </div>

        {!isBookingOpen && (
          <div className="glass rounded-xl px-4 py-3 mb-4 border border-red-500/30 text-red-400 text-sm font-semibold text-center">
            Pre-booking window has closed for this event
          </div>
        )}

        <button
          type="button"
          className="btn-primary w-full py-4 text-base font-black rounded-2xl"
          onClick={onPay}
          disabled={bookingInProgress || !isBookingOpen}
        >
          {bookingInProgress ? (
            <><div className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>Processing…</>
          ) : (
            <><i className="fas fa-lock mr-2"></i>Pay {fmt2(pricing.total)}</>
          )}
        </button>

        <p className="text-center text-xs text-zinc-600 mt-4">
          <i className="fas fa-shield-alt mr-1 text-zinc-500"></i>
          Secured with Razorpay · All prices inclusive of taxes
        </p>
      </div>
    </div>
  );
}

function PRow({ label, val }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200 font-semibold">{val}</span>
    </div>
  );
}

// ─── Seat Layout ──────────────────────────────────────────────────────────────
function SeatLayout({
  event, seats, selectedSeats, toggleSeat, selectZoneQty,
  ticketMax, setTicketMax, editTickets, setEditTickets,
  zoom, setZoom, selectedShowtime, setSearchParams,
  pricing, onProceed, navigate, eventId, isBookingOpen,
}) {
  // Build rows map
  const rowsMap = {};
  let maxCol = 10;
  seats.forEach((seat) => {
    const rowName = seat.seatNumber.match(/^[A-Z]+/)?.[0] || 'G';
    const colNum = parseInt(seat.seatNumber.match(/\d+$/)?.[0]) || 0;
    if (colNum > maxCol) maxCol = colNum;
    if (!rowsMap[rowName]) rowsMap[rowName] = {};
    rowsMap[rowName][colNum] = seat;
  });
  const rowNamesList = Object.keys(rowsMap).sort((a, b) => a.localeCompare(b));
  const useLarge = maxCol > 10;
  const totalColumns = useLarge ? Math.max(maxCol, 22) : 10;

  // Category legend from event
  const categories = event.seatCategories || [];

  const getSeatStyle = (seat) => {
    if (!seat) return null;
    const isSelected = selectedSeats.some((s) => s._id === seat._id);
    const isDisabled = seat.status === 'booked' || seat.status === 'locked';
    return catStyle(seat.category, isSelected, isDisabled);
  };

  const renderSeat = (rowName, colNum) => {
    const seat = rowsMap[rowName]?.[colNum];
    if (!seat) return <div key={`e-${rowName}-${colNum}`} className="w-8 h-8 sm:w-9 sm:h-9" />;
    const style = getSeatStyle(seat);
    const isDisabled = seat.status === 'booked' || seat.status === 'locked';
    const display = colNum < 10 ? `0${colNum}` : `${colNum}`;
    return (
      <button
        key={seat._id}
        type="button"
        onClick={() => toggleSeat(seat)}
        disabled={isDisabled}
        title={`${seat.seatNumber} (${seat.category}) – ₹${seat.price}`}
        style={{
          width: 36, height: 36, borderRadius: 8, fontSize: 10, fontWeight: 700,
          background: style.bg, border: `1px solid ${style.border}`, color: style.text,
          cursor: isDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
          boxShadow: style.shadow || 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {display}
      </button>
    );
  };

  const renderSeated = () => {
    const cols = [];
    for (let c = 1; c <= totalColumns; c++) cols.push(c);
    return (
      <div className="flex flex-col gap-2 py-8 origin-center transition-transform duration-300" style={{ transform: `scale(${zoom})` }}>
        {rowNamesList.map((row) => (
          <div key={row} className="flex items-center justify-center gap-3 select-none">
            <span className="w-7 text-right text-zinc-500 font-bold text-xs pr-1">{row}</span>
            <div className="flex gap-1.5">
              {cols.map((c) => {
                if (useLarge && (c === 11 || c === 12)) return <div key={`sp-${c}`} className="w-9 h-9" />;
                if (useLarge && row.localeCompare('G') > 0 && c >= 1 && c <= 4) return <div key={`sp-${c}`} className="w-9 h-9" />;
                if (!useLarge && c === 6) return (
                  <React.Fragment key={`sg-${c}`}>
                    <div className="w-5" />
                    {renderSeat(row, c)}
                  </React.Fragment>
                );
                return renderSeat(row, c);
              })}
            </div>
            <span className="w-7 text-left text-zinc-500 font-bold text-xs pl-1">{row}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderZone = () => {
    const zones = {};
    seats.forEach((s) => {
      const z = s.category || 'General';
      if (!zones[z]) zones[z] = { name: z, price: s.price, seats: [] };
      zones[z].seats.push(s);
    });
    return (
      <div className="max-w-md mx-auto py-8 space-y-3">
        {Object.values(zones).map((zone) => {
          const avail = zone.seats.filter((s) => s.status === 'available').length;
          const selected = selectedSeats.filter((s) => s.category === zone.name);
          const style = CATEGORY_PALETTE[zone.name] || CATEGORY_PALETTE.General;
          return (
            <div key={zone.name} className="glass rounded-2xl p-5 flex items-center justify-between"
              style={{ borderColor: style.border + '55' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: style.border }}></div>
                  <h4 className="font-black text-white">{zone.name}</h4>
                </div>
                <p className="font-extrabold text-sm" style={{ color: style.text }}>{formatCurrency(zone.price)}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{avail} available</p>
              </div>
              {avail === 0 ? (
                <span className="text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">Sold Out</span>
              ) : (
                <select
                  className="glass text-white rounded-lg p-2 font-bold text-sm"
                  value={selected.length}
                  onChange={(e) => {
                    const qty = Number(e.target.value);
                    selectZoneQty(zone, qty);
                  }}
                >
                  {[...Array(Math.min(avail, ticketMax) + 1).keys()].map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col text-white">
      {/* Header */}
      <header className="glass-nav px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(`/event/${eventId}`)}
              className="w-9 h-9 rounded-full glass flex items-center justify-center text-zinc-400 hover:text-white flex-shrink-0 bg-transparent border-none cursor-pointer hover:bg-white/10 transition">
              <i className="fas fa-arrow-left"></i>
            </button>
            <div className="min-w-0">
              <h1 className="font-black text-sm truncate">{event.title}</h1>
              <p className="text-[11px] text-zinc-400 truncate">
                {event.venue} · {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editTickets ? (
              <div className="flex items-center gap-1 glass rounded-xl px-2 py-1">
                <input type="number" min={1} max={10}
                  className="w-10 bg-transparent text-center font-bold text-sm focus:outline-none"
                  value={ticketMax}
                  onChange={(e) => setTicketMax(Math.min(10, Math.max(1, +e.target.value || 1)))} />
                <button onClick={() => setEditTickets(false)}
                  className="bg-red-600 text-white text-[11px] px-2 py-1 rounded-lg border-none cursor-pointer font-bold">
                  Done
                </button>
              </div>
            ) : (
              <button onClick={() => setEditTickets(true)}
                className="px-3 py-2 border border-red-500/40 hover:border-red-500 text-red-400 rounded-xl text-xs font-bold bg-transparent cursor-pointer transition flex items-center gap-1.5">
                <i className="fas fa-pencil-alt text-[10px]"></i>{ticketMax} Tickets
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Showtimes */}
      {event.showtimes && event.showtimes.length > 0 && (
        <div className="glass-nav border-b border-white/[0.06] px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto">
            {event.showtimes.map((t) => (
              <button key={t}
                onClick={() => setSearchParams({ showtime: t })}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex-shrink-0 border transition cursor-pointer ${
                  selectedShowtime === t
                    ? 'bg-green-700 border-green-700 text-white'
                    : 'glass border-white/10 text-zinc-200 hover:border-white/30'
                }`}
                style={selectedShowtime !== t ? { borderLeft: '3px solid #16a34a' } : undefined}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seat map */}
      <main className="flex-grow flex flex-col items-center overflow-auto px-4 relative min-h-[400px]">
        {event.bookingType === 'zone' ? renderZone() : (
          <div className="w-full flex flex-col items-center">
            {/* Category labels */}
            {categories.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-6 mb-2">
                {categories.map((cat) => {
                  const s = CATEGORY_PALETTE[cat.name] || CATEGORY_PALETTE.General;
                  return (
                    <span key={cat.name} className="text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5"
                      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}44` }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.border }}></span>
                      {cat.name} · ₹{cat.price}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="w-full overflow-auto flex justify-center py-2">{renderSeated()}</div>
            <div className="w-full max-w-md mx-auto flex flex-col items-center mt-4 mb-2 opacity-70">
              <svg width="280" height="16" viewBox="0 0 280 16" fill="none">
                <path d="M8 12 C80 4, 200 4, 272 12" stroke="#6b7280" strokeWidth="2" fill="none" strokeDasharray="4,3" />
              </svg>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">All eyes this way</p>
            </div>
          </div>
        )}
        {/* Zoom */}
        {event.bookingType !== 'zone' && (
          <div className="absolute right-4 bottom-24 flex flex-col gap-1 glass p-1.5 rounded-xl shadow-xl">
            {[{ icon: 'fa-plus', fn: () => setZoom((p) => Math.min(p + 0.1, 1.5)) },
              { icon: 'fa-minus', fn: () => setZoom((p) => Math.max(p - 0.1, 0.6)) }].map(({ icon, fn }) => (
              <button key={icon} onClick={fn}
                className="w-8 h-8 rounded-lg bg-transparent text-white hover:bg-white/10 flex items-center justify-center border-none cursor-pointer">
                <i className={`fas ${icon} text-xs`}></i>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Legend + Checkout bar */}
      <footer className="glass-nav">
        {/* Legend */}
        <div className="border-b border-white/[0.06] px-4 py-3">
          <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            <LegendDot color="rgba(255,255,255,0.07)" border="#52525b" label="Available" textColor="#a1a1aa" />
            <LegendDot color="rgba(255,255,255,0.04)" border="transparent" label="Booked" textColor="rgba(255,255,255,0.22)" />
            <LegendDot color="rgba(34,197,94,0.8)" border="#4ade80" label="Selected" textColor="#fff" />
          </div>
        </div>

        {/* Action bar */}
        <div className="px-4 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="text-xs text-zinc-500 font-semibold">
              {selectedSeats.length > 0
                ? `${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} · incl. GST & fees`
                : 'Tap seats to select'}
            </div>
            {selectedSeats.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase">Total</p>
                  <p className="text-lg font-black text-green-400">{fmt2(pricing.total)}</p>
                </div>
                <button
                  onClick={onProceed}
                  className="bg-green-700 hover:bg-green-600 text-white font-black px-6 py-3 rounded-xl text-sm border-none cursor-pointer transition shadow-lg shadow-green-900/30 flex items-center gap-2">
                  Review & Pay
                  <i className="fas fa-arrow-right text-xs"></i>
                </button>
              </div>
            ) : (
              !isBookingOpen && (
                <span className="text-red-400 text-xs font-semibold">Booking window closed</span>
              )
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function LegendDot({ color, border, label, textColor }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded" style={{ background: color, border: `1px solid ${border}` }}></div>
      <span style={{ color: textColor }}>{label}</span>
    </div>
  );
}
