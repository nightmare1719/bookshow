import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function Invoice({ bookingId, setPage }) {
  const { apiFetch, showToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInvoiceDetails = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/bookings/${bookingId}`);
        setData(res.data);
      } catch (err) {
        showToast('Failed to load invoice: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      loadInvoiceDetails();
    }
  }, [bookingId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!data || !data.invoice) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 text-center">
        <p className="text-xl text-gray-400 mb-6">Invoice details not found.</p>
        <button className="btn-primary" onClick={() => setPage({ name: 'home' })}>
          Back to Home
        </button>
      </div>
    );
  }

  const { invoice, booking } = data;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check text-3xl text-white"></i>
        </div>
        <h2 className="text-3xl font-bold text-green-400">Booking Confirmed!</h2>
        <p className="text-gray-400 mt-2">Your tickets have been booked successfully</p>
      </div>

      <div className="card p-8 max-w-2xl mx-auto border border-gray-700 shadow-xl" id="invoice-print-area">
        <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-red-600 rounded flex items-center justify-center font-bold text-xs text-white">
                BS
              </div>
              <span className="text-xl font-bold text-white">BookShow</span>
            </div>
            <p className="text-gray-400 text-sm">Official Booking Invoice</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg text-white">{invoice.invoiceNumber}</p>
            <p className="text-gray-400 text-sm">
              {new Date(invoice.issuedAt).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Billed To</p>
            <p className="font-semibold text-white">{invoice.customer?.name}</p>
            <p className="text-gray-400 text-sm">{invoice.customer?.email}</p>
            <p className="text-gray-400 text-sm">{invoice.customer?.phone || 'No phone provided'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Event Details</p>
            <p className="font-semibold text-white">{invoice.event?.title || 'N/A'}</p>
            <p className="text-gray-400 text-sm">
              <i className="fas fa-map-marker-alt mr-1 text-red-500"></i>
              {invoice.event?.venue || 'N/A'}
            </p>
            <p className="text-gray-400 text-sm">
              <i className="fas fa-clock mr-1 text-blue-400"></i>
              {invoice.event?.date ? formatDate(invoice.event.date) : 'N/A'}
            </p>
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Seats Booked</p>
          <div className="flex flex-wrap gap-2">
            {invoice.seats?.map((s, idx) => (
              <span key={idx} className="badge bg-blue-900 text-blue-300">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-700 pt-4 space-y-2 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">
              Subtotal ({invoice.seatsCount} seat{invoice.seatsCount > 1 ? 's' : ''})
            </span>
            <span className="text-white">{formatCurrency(invoice.pricing?.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Service Tax (8%)</span>
            <span className="text-white">{formatCurrency(invoice.pricing?.tax)}</span>
          </div>
          <div className="flex justify-between font-bold text-xl border-t border-gray-700 pt-3 mt-2">
            <span className="text-white">Total Paid</span>
            <span className="text-green-400">{formatCurrency(invoice.pricing?.total)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Transaction ID</p>
            <p className="font-mono font-semibold text-sm text-white">
              {invoice.payment?.transactionId}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Payment: {invoice.payment?.method?.toUpperCase()}
            </p>
          </div>
          {booking?.qrCode && (
            <img src={booking.qrCode} alt="QR Code" className="w-20 h-20 rounded-lg" />
          )}
        </div>

        <div className="text-center text-gray-500 text-xs">
          <p className="mb-1">Thank you for booking with BookShow!</p>
          <p>Present this QR code at the venue for quick entry.</p>
        </div>
      </div>

      <div className="flex gap-4 justify-center mt-6">
        <button className="btn-secondary flex items-center gap-1.5" onClick={() => window.print()}>
          <i className="fas fa-print"></i>Print Invoice
        </button>
        <button
          className="btn-primary flex items-center gap-1.5"
          onClick={() => setPage({ name: 'my-bookings' })}
        >
          <i className="fas fa-ticket-alt"></i>My Tickets
        </button>
        <button
          className="btn-secondary flex items-center gap-1.5"
          onClick={() => setPage({ name: 'home' })}
        >
          <i className="fas fa-home"></i>Home
        </button>
      </div>
    </div>
  );
}
