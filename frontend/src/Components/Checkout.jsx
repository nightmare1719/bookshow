import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/helpers';

export default function Checkout({ eventId, selectedSeats, setPage }) {
  const { apiFetch, showToast } = useApp();
  const [loading, setLoading] = useState(false);

  const totalPrice = (selectedSeats || []).reduce((sum, s) => sum + (s.price || 0), 0);

  const handleConfirm = async () => {
    if (!selectedSeats || selectedSeats.length === 0) {
      showToast('No seats selected', 'error');
      return;
    }

    setLoading(true);
    try {
      const seatIds = selectedSeats.map((s) => s._id);
      const data = await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          seatIds,
        }),
      });
      showToast('Booking confirmed!');
      setPage({ name: 'invoice', bookingId: data.data.booking._id });
    } catch (err) {
      showToast(err.message || 'Booking failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        type="button"
        className="text-gray-400 hover:text-white mb-6 bg-transparent border-none cursor-pointer text-sm"
        onClick={() => setPage({ name: 'seats', eventId })}
      >
        <i className="fas fa-arrow-left mr-2"></i>Back to Seats
      </button>

      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Booking Summary</h2>
        <div className="space-y-3">
          {(selectedSeats || []).map((seat, idx) => (
            <div
              key={seat._id || idx}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50"
            >
              <span className="text-sm">
                <i className="fas fa-chair mr-2 text-gray-500"></i>
                {seat.label || seat.seatNumber || seat.row + seat.number || seat.number}
                {seat.category && (
                  <span className="text-gray-400 ml-2">({seat.category})</span>
                )}
              </span>
              <span className="text-sm font-semibold text-green-400">
                {formatCurrency(seat.price)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 mt-4 pt-4 flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-2xl font-bold text-green-400">
            {formatCurrency(totalPrice)}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn-primary w-full text-lg py-3"
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? (
          <>
            <i className="fas fa-spinner fa-spin mr-2"></i>Processing...
          </>
        ) : (
          <>
            <i className="fas fa-check-circle mr-2"></i>Confirm Booking
          </>
        )}
      </button>
    </div>
  );
}
