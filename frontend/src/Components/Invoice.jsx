import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

const fmtDateTime = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const CATEGORY_COLORS = {
  Gold: '#f59e0b',
  Silver: '#94a3b8',
  Bronze: '#b45309',
  Platinum: '#8b5cf6',
  VIP: '#ec4899',
  Premium: '#06b6d4',
  General: '#6b7280',
};

const categoryColor = (name = '') => CATEGORY_COLORS[name] || '#6b7280';

export default function Invoice() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { apiFetch } = useApp();
  const [invoice, setInvoice] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await apiFetch(`/bookings/${bookingId}`);
        setInvoice(data.data.invoice);
        setBooking(data.data.booking);
      } catch (err) {
        console.error('Failed to fetch booking:', err);
      } finally {
        setLoading(false);
      }
    };
    if (bookingId) fetch();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!invoice || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Booking not found.
      </div>
    );
  }

  const event = invoice.event || {};
  const seats = invoice.seats || [];
  const pricing = invoice.pricing || {};
  const customer = invoice.customer || {};

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-check text-green-400 text-2xl"></i>
          </div>
          <h1 className="text-2xl font-black text-white">Booking Confirmed</h1>
          <p className="text-zinc-400 text-sm mt-1">Your tickets are ready</p>
        </div>

        {/* Invoice card */}
        <div className="card overflow-hidden">

          {/* Invoice header strip */}
          <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Invoice</p>
              <p className="text-sm font-mono font-bold text-red-400">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Issued</p>
              <p className="text-xs text-zinc-300 font-semibold">{fmtDateTime(invoice.issuedAt)}</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* Movie & Show Info */}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Show Details</p>
              <div className="glass rounded-2xl p-4 space-y-2.5 text-sm">
                <Row label="Movie / Event" value={<span className="font-bold text-white">{event.title || 'N/A'}</span>} />
                <Row label="Venue" value={event.venue || 'TBA'} />
                <Row label="Date" value={fmtDate(event.date)} />
                {invoice.showtime && <Row label="Show Time" value={invoice.showtime} />}
                {event.screenName && <Row label="Screen" value={event.screenName} />}
              </div>
            </section>

            {/* Customer Info */}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Passenger</p>
              <div className="glass rounded-2xl p-4 space-y-2.5 text-sm">
                <Row label="Name" value={<span className="font-semibold text-white">{customer.name}</span>} />
                <Row label="Email" value={customer.email} />
                {customer.phone && customer.phone !== 'N/A' && <Row label="Phone" value={customer.phone} />}
              </div>
            </section>

            {/* Seats */}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">
                Seats ({seats.length})
              </p>
              <div className="glass rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left px-4 py-2.5 text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Seat</th>
                      <th className="text-left px-4 py-2.5 text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Category</th>
                      <th className="text-right px-4 py-2.5 text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seats.map((s, i) => (
                      <tr key={i} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-2.5 font-mono font-bold text-white">{s.seatNumber}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: categoryColor(s.category) + '22', color: categoryColor(s.category), border: `1px solid ${categoryColor(s.category)}44` }}
                          >
                            {s.category || 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-400 font-semibold">{fmt(s.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Pricing Breakdown */}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Price Breakdown</p>
              <div className="glass rounded-2xl p-4 space-y-2.5 text-sm">
                <Row label="Ticket Price" value={fmt(pricing.ticketPrice)} />
                <Row label={`Platform Fee (₹2 × ${seats.length})`} value={fmt(pricing.platformFee)} />
                {pricing.discountApplied > 0 && (
                  <Row label="Coupon Discount" value={<span className="text-green-400">− {fmt(pricing.discountApplied)}</span>} />
                )}
                <Row label="GST (12%)" value={fmt(pricing.gst)} />
                <div className="border-t border-white/[0.08] pt-3 mt-1">
                  <Row
                    label={<span className="font-bold text-white">Total Paid</span>}
                    value={<span className="text-xl font-black text-green-400">{fmt(pricing.total)}</span>}
                  />
                </div>
              </div>
            </section>

            {/* Payment Info */}
            <section>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Payment</p>
              <div className="glass rounded-2xl p-4 space-y-2.5 text-sm">
                <Row label="Method" value={<span className="capitalize">{invoice.payment?.method || 'N/A'}</span>} />
                <Row label="Transaction ID" value={<span className="font-mono text-xs text-zinc-300">{invoice.payment?.transactionId || 'N/A'}</span>} />
                <Row label="Status" value={
                  <span className="bg-green-500/15 text-green-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-green-500/30 capitalize">
                    {invoice.status}
                  </span>
                } />
              </div>
            </section>

            {/* QR Code */}
            {invoice.qrCode && (
              <section className="flex flex-col items-center py-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Scan at Entry</p>
                <div className="bg-white p-3 rounded-2xl shadow-lg shadow-black/30">
                  <img src={invoice.qrCode} alt="Ticket QR Code" className="w-36 h-36 block" />
                </div>
                <p className="text-xs text-zinc-500 mt-2">Show this QR at the venue</p>
              </section>
            )}

          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            className="btn-primary flex-1 py-3 text-sm font-bold rounded-xl"
            onClick={() => navigate('/')}
          >
            <i className="fas fa-home mr-2"></i>Back to Home
          </button>
          <button
            type="button"
            className="btn-ghost flex-1 py-3 text-sm font-bold rounded-xl"
            onClick={() => navigate('/my-bookings')}
          >
            <i className="fas fa-ticket-alt mr-2"></i>My Bookings
          </button>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Need help? Contact support with invoice <span className="text-zinc-400 font-mono">{invoice.invoiceNumber}</span>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-400 shrink-0">{label}</span>
      <span className="text-right text-zinc-200">{value}</span>
    </div>
  );
}
