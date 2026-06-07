import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function Checkout({ eventId, selectedSeats, setPage }) {
  const { apiFetch, currentUser, showToast } = useApp();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('mock');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('Confirm & Pay');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    const loadEventDetails = async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/events/${eventId}`);
        setEvent(data.data.event);
      } catch (err) {
        showToast('Failed to load checkout details: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      loadEventDetails();
    }
  }, [eventId]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await apiFetch('/bookings/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponCode.trim() }),
      });
      setAppliedCoupon(res.data);
      showToast('Coupon applied successfully!');
    } catch (err) {
      showToast(err.message || 'Invalid coupon code', 'error');
    } finally {
      setCouponLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'seats', eventId })}
        >
          <i className="fas fa-arrow-left"></i> Back to Seats
        </button>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!event || !selectedSeats || !selectedSeats.length) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10 text-center">
        <button
          className="text-gray-400 hover:text-white mb-6 flex items-center gap-2"
          onClick={() => setPage({ name: 'home' })}
        >
          <i className="fas fa-arrow-left"></i> Back to Home
        </button>
        <p className="text-xl text-gray-400">Checkout summary unavailable.</p>
      </div>
    );
  }

  const subtotal = selectedSeats.reduce((acc, s) => acc + s.price, 0);
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'percentage') {
      discount = subtotal * (appliedCoupon.discountValue / 100);
    } else {
      discount = appliedCoupon.discountValue;
    }
    discount = Math.round(discount * 100) / 100;
  }
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = Math.round(discountedSubtotal * 0.08 * 100) / 100;
  const grandTotal = Math.round((discountedSubtotal + tax) * 100) / 100;

  const handlePayment = async () => {
    setSubmitting(true);
    setStatusText('Processing...');
    try {
      if (paymentMethod === 'razorpay') {
        setStatusText('Initiating Gateway...');

        // 1. Create order on backend
        const res = await apiFetch('/bookings/razorpay/order', {
          method: 'POST',
          body: JSON.stringify({
            eventId: event._id,
            seatIds: selectedSeats.map((s) => s._id),
          }),
        });

        const { orderId, amount, currency, keyId } = res.data;

        // 2. Configure and open Razorpay Checkout
        const options = {
          key: keyId,
          amount: amount,
          currency: currency,
          name: 'BookShow',
          description: `Tickets for ${event.title}`,
          order_id: orderId,
          handler: async function (response) {
            setStatusText('Confirming Tickets...');
            try {
              // 3. Verify signature on backend
              const verifyData = await apiFetch('/bookings/razorpay/verify', {
                method: 'POST',
                body: JSON.stringify({
                  eventId: event._id,
                  seatIds: selectedSeats.map((s) => s._id),
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              const booking = verifyData.data.booking;
              showToast('Tickets booked successfully!');
              setPage({ name: 'invoice', bookingId: booking._id });
            } catch (err) {
              showToast('Verification failed: ' + err.message, 'error');
              setSubmitting(false);
              setStatusText('Confirm & Pay');
            }
          },
          prefill: {
            name: currentUser ? `${currentUser.profile?.firstName || ''} ${currentUser.profile?.lastName || ''}`.trim() : '',
            email: currentUser ? currentUser.email : '',
            contact: currentUser ? currentUser.profile?.phone || '' : '',
          },
          theme: {
            color: '#e50914',
          },
          modal: {
            ondismiss: function () {
              showToast('Payment window closed', 'info');
              setSubmitting(false);
              setStatusText('Confirm & Pay');
            },
          },
        };

        if (window.Razorpay) {
          const rzp = new window.Razorpay(options);
          rzp.open();
        } else {
          showToast('Razorpay payment gateway script not loaded. Please try again.', 'error');
          setSubmitting(false);
          setStatusText('Confirm & Pay');
        }
      } else {
        if (paymentMethod === 'wallet' && (currentUser?.walletBalance || 0) < grandTotal) {
          throw new Error('Insufficient wallet balance. Please deposit funds first.');
        }

        const data = await apiFetch('/bookings/complete', {
          method: 'POST',
          body: JSON.stringify({
            eventId: event._id,
            seatIds: selectedSeats.map((s) => s._id),
            paymentMethod: paymentMethod === 'wallet' ? 'wallet' : 'mock',
            couponCode: appliedCoupon ? appliedCoupon.code : undefined,
          }),
        });
        const booking = data.data.booking;
        showToast(paymentMethod === 'wallet' ? 'Booking confirmed using wallet balance!' : 'Booking confirmed!');
        setPage({ name: 'invoice', bookingId: booking._id });
      }
    } catch (err) {
      showToast(err.message, 'error');
      setSubmitting(false);
      setStatusText('Confirm & Pay');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <button
        className="text-gray-400 hover:text-white mb-6 flex items-center gap-2 transition-colors"
        disabled={submitting}
        onClick={() => setPage({ name: 'seats', eventId })}
      >
        <i className="fas fa-arrow-left"></i> Back to Seats
      </button>

      <h2 className="text-3xl font-bold mb-8 text-white">Checkout</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Summary Side */}
        <div>
          <div className="card p-6 mb-4 border border-gray-700">
            <h3 className="font-bold text-lg mb-4 text-gray-300">Order Summary</h3>
            <div className="mb-4">
              <p className="font-semibold text-lg text-white">{event.title}</p>
              <p className="text-gray-400 text-sm mt-1">
                <i className="fas fa-map-marker-alt mr-1 text-red-500"></i>
                {event.venue}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                <i className="fas fa-clock mr-1 text-blue-400"></i>
                {formatDate(event.date)}
              </p>
            </div>
            <div className="border-t border-gray-700 pt-4 space-y-2">
              {selectedSeats.map((s) => (
                <div key={s._id} className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {event.bookingType === 'zone' ? `Zone: ${s.category}` : `Seat ${s.seatNumber} (${s.category})`}
                  </span>
                  <span className="text-white">{formatCurrency(s.price)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t border-gray-700 pt-2 mt-2">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-400">
                  <span>Discount Applied ({appliedCoupon.code})</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Service Tax (8%)</span>
                <span className="text-white">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-gray-700 pt-2 mt-2">
                <span className="text-white">Total</span>
                <span className="text-green-400">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Coupon Code Panel */}
          <div className="card p-6 mb-4 border border-gray-700">
            <h4 className="font-bold text-sm mb-3 text-gray-300">Promo Code / Coupon</h4>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. SAVE20"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                disabled={appliedCoupon || couponLoading}
                className="input text-sm py-1.5 flex-1"
                style={{ background: '#1c1c1c' }}
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={appliedCoupon || couponLoading}
                className="btn-secondary text-sm py-1.5 px-3"
              >
                {couponLoading ? 'Checking...' : appliedCoupon ? 'Applied' : 'Apply'}
              </button>
            </div>
            {appliedCoupon && (
              <p className="text-xs text-green-400 mt-2">
                <i className="fas fa-check-circle mr-1"></i>
                Coupon <strong>{appliedCoupon.code}</strong> applied! ({appliedCoupon.discountType === 'percentage' ? `${appliedCoupon.discountValue}% off` : `₹${appliedCoupon.discountValue} off`})
              </p>
            )}
          </div>

          <div className="card p-4 flex items-center gap-3 text-sm text-gray-400 border border-gray-700">
            <i className="fas fa-lock text-green-500 text-lg flex-shrink-0"></i>
            <span>Seats are locked for 10 minutes. Complete your payment to confirm your booking.</span>
          </div>
        </div>

        {/* Payment Side */}
        <div>
          <div className="card p-6 border border-gray-700">
            <h3 className="font-bold text-lg mb-4 text-gray-300">Payment Method</h3>
            <div className="space-y-3 mb-6">
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                  paymentMethod === 'mock'
                    ? 'border-blue-500/50 bg-blue-900/10'
                    : 'border-gray-700 bg-gray-900/30 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="mock"
                  checked={paymentMethod === 'mock'}
                  onChange={() => setPaymentMethod('mock')}
                  disabled={submitting}
                  className="accent-red-500"
                />
                <div>
                  <p className="font-semibold text-white">Demo Payment</p>
                  <p className="text-xs text-gray-400">Instant confirmation (test mode)</p>
                </div>
                <i className="fas fa-credit-card ml-auto text-blue-400 text-xl"></i>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                  paymentMethod === 'wallet'
                    ? 'border-blue-500/50 bg-blue-900/10'
                    : 'border-gray-700 bg-gray-900/30 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="wallet"
                  checked={paymentMethod === 'wallet'}
                  onChange={() => setPaymentMethod('wallet')}
                  disabled={submitting}
                  className="accent-red-500"
                />
                <div>
                  <p className="font-semibold text-white">Virtual Wallet Balance</p>
                  <p className="text-xs text-gray-400">Available: {formatCurrency(currentUser?.walletBalance || 0)}</p>
                </div>
                <i className="fas fa-wallet ml-auto text-purple-400 text-xl"></i>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                  paymentMethod === 'razorpay'
                    ? 'border-blue-500/50 bg-blue-900/10'
                    : 'border-gray-700 bg-gray-900/30 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="razorpay"
                  checked={paymentMethod === 'razorpay'}
                  onChange={() => setPaymentMethod('razorpay')}
                  disabled={submitting}
                  className="accent-red-500"
                />
                <div>
                  <p className="font-semibold text-white">Razorpay Online</p>
                  <p className="text-xs text-gray-400">UPI, Cards, NetBanking, Wallets</p>
                </div>
                <i className="fas fa-credit-card ml-auto text-green-400 text-xl"></i>
              </label>
            </div>

            {paymentMethod === 'mock' && (
              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 mb-6 text-sm text-yellow-300 flex items-center gap-2">
                <i className="fas fa-info-circle flex-shrink-0 text-base"></i>
                <span>Running in demo mode. No real money will be charged.</span>
              </div>
            )}

            {paymentMethod === 'wallet' && (currentUser?.walletBalance || 0) < grandTotal && (
              <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-3 mb-6 text-sm text-red-400 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle flex-shrink-0 text-base"></i>
                <span>Insufficient wallet balance. Please visit "My Tickets" to deposit funds.</span>
              </div>
            )}

            {paymentMethod === 'wallet' && (currentUser?.walletBalance || 0) >= grandTotal && (
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-6 text-sm text-green-300 flex items-center gap-2">
                <i className="fas fa-check-circle flex-shrink-0 text-base"></i>
                <span>Wallet balance is sufficient to cover this booking transaction.</span>
              </div>
            )}

            {paymentMethod === 'razorpay' && (
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-6 text-sm text-green-300 flex items-center gap-2">
                <i className="fas fa-shield-alt flex-shrink-0 text-base"></i>
                <span>Secured by Razorpay. Pay with any major credit/debit card, UPI, or net banking.</span>
              </div>
            )}

            <button
              className="btn-primary w-full py-4 text-lg font-bold flex items-center justify-center gap-2"
              disabled={submitting || (paymentMethod === 'wallet' && (currentUser?.walletBalance || 0) < grandTotal)}
              onClick={handlePayment}
            >
              {submitting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> {statusText}
                </>
              ) : (
                <>
                  <i className="fas fa-check-circle"></i> Confirm & Pay {formatCurrency(grandTotal)}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
