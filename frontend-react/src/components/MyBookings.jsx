import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatCurrency } from '../utils/helpers';

export default function MyBookings({ setPage }) {
  const { apiFetch, currentUser, showToast, refreshUser } = useApp();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralInput, setReferralInput] = useState('');
  const [referralLoading, setReferralLoading] = useState(false);

  useEffect(() => {
    const loadBookings = async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/bookings/my-bookings');
        setBookings(res.data.bookings || []);
      } catch (err) {
        showToast('Failed to load bookings: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };

    const fetchReferralCode = async () => {
      try {
        const res = await apiFetch('/bookings/referral/code');
        setReferralCode(res.data.referralCode);
      } catch (_) {}
    };

    loadBookings();
    fetchReferralCode();
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);

    try {
      // 1. Create order on backend
      const res = await apiFetch('/bookings/deposit-wallet/order', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });

      const { orderId, amount: amountInPaise, currency, keyId } = res.data;

      // 2. Configure Razorpay checkout options
      const options = {
        key: keyId,
        amount: amountInPaise,
        currency: currency,
        name: 'BookShow Wallet',
        description: `Deposit balance: ₹${amount}`,
        order_id: orderId,
        handler: async function (response) {
          setDepositLoading(true);
          try {
            // 3. Verify signature on backend & update balance
            const verifyData = await apiFetch('/bookings/deposit-wallet/verify', {
              method: 'POST',
              body: JSON.stringify({
                amount,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            showToast(`Deposited ${formatCurrency(amount)} successfully!`);
            setDepositAmount('');
            await refreshUser();
          } catch (err) {
            showToast('Deposit verification failed: ' + err.message, 'error');
          } finally {
            setDepositLoading(false);
          }
        },
        prefill: {
          name: currentUser ? `${currentUser.profile?.firstName || ''} ${currentUser.profile?.lastName || ''}`.trim() : '',
          email: currentUser ? currentUser.email : '',
          contact: currentUser ? currentUser.profile?.phone || '' : '',
        },
        theme: {
          color: '#10b981', // Emerald green theme for wallet
        },
        modal: {
          ondismiss: function () {
            showToast('Deposit cancelled', 'info');
            setDepositLoading(false);
          },
        },
      };

      // 4. Open Razorpay overlay or auto-verify for mock orders
      if (res.isMock) {
        showToast('Mock Payment Mode: Auto-confirming deposit...', 'info');
        setTimeout(() => {
          options.handler({
            razorpay_order_id: orderId,
            razorpay_payment_id: `pay_mock_deposit_${Math.random().toString(36).substring(2, 10)}`,
            razorpay_signature: `mock_sig_${Math.random().toString(36).substring(2, 10)}`,
          });
        }, 1500);
      } else {
        if (window.Razorpay) {
          const rzp = new window.Razorpay(options);
          rzp.open();
        } else {
          showToast('Razorpay script offline. Simulating deposit completion...', 'warning');
          setTimeout(() => {
            options.handler({
              razorpay_order_id: orderId,
              razorpay_payment_id: `pay_fallback_deposit_${Math.random().toString(36).substring(2, 10)}`,
              razorpay_signature: `mock_sig_fallback_${Math.random().toString(36).substring(2, 10)}`,
            });
          }, 1500);
        }
      }
    } catch (err) {
      showToast('Deposit failed: ' + err.message, 'error');
      setDepositLoading(false);
    }
  };

  const handleApplyReferral = async (e) => {
    e.preventDefault();
    if (!referralInput.trim()) return;
    setReferralLoading(true);
    try {
      await apiFetch('/bookings/referral/apply', {
        method: 'POST',
        body: JSON.stringify({ code: referralInput.trim() }),
      });
      showToast('Referral code applied successfully!');
      setReferralInput('');
      await refreshUser();
    } catch (err) {
      showToast(err.message || 'Failed to apply referral code', 'error');
    } finally {
      setReferralLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-3xl font-bold mb-8 text-white">My Tickets</h2>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h2 className="text-3xl font-bold mb-8 text-white">My Tickets</h2>

      {/* Wallet & Referral Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Wallet Section */}
        <div className="card p-6 border border-gray-700 flex flex-col justify-between" style={{ background: 'rgba(25, 25, 25, 0.4)' }}>
          <div>
            <h3 className="text-lg font-bold text-gray-300 mb-2">
              <i className="fas fa-wallet text-green-500 mr-2"></i>Virtual Wallet
            </h3>
            <p className="text-3xl font-bold text-green-400 mb-4">
              {formatCurrency(currentUser?.walletBalance || 0)}
            </p>
          </div>
          <form onSubmit={handleDeposit} className="flex gap-2">
            <input
              type="number"
              min="10"
              placeholder="Amount (₹)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="input text-sm py-1.5 flex-1"
              style={{ background: '#1c1c1c' }}
              required
            />
            <button type="submit" className="btn-primary text-sm py-1.5 px-4" disabled={depositLoading}>
              {depositLoading ? 'Depositing...' : 'Deposit'}
            </button>
          </form>
        </div>

        {/* Referral System */}
        <div className="card p-6 border border-gray-700 flex flex-col justify-between" style={{ background: 'rgba(25, 25, 25, 0.4)' }}>
          <div>
            <h3 className="text-lg font-bold text-gray-300 mb-1">
              <i className="fas fa-share-alt text-purple-500 mr-2"></i>Refer & Earn
            </h3>
            <p className="text-xs text-gray-500 mb-3">Invite friends! Both get ₹50 on first ticket booking.</p>
            <div className="flex items-center justify-between bg-gray-900/60 p-2.5 rounded-lg border border-gray-800 mb-4">
              <span className="text-xs text-gray-400 uppercase tracking-wide font-mono">Your Code:</span>
              <span className="font-bold text-white font-mono text-sm select-all">{referralCode || 'REF-LOADING'}</span>
            </div>
          </div>
          <form onSubmit={handleApplyReferral} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter friend's code"
              value={referralInput}
              onChange={(e) => setReferralInput(e.target.value)}
              className="input text-sm py-1.5 flex-1"
              style={{ background: '#1c1c1c' }}
              required
            />
            <button type="submit" className="btn-secondary text-sm py-1.5 px-4" disabled={referralLoading}>
              Apply
            </button>
          </form>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <i className="fas fa-ticket-alt text-5xl mb-4 block"></i>
          <p className="text-xl mb-6">No bookings yet</p>
          <button className="btn-primary" onClick={() => setPage({ name: 'home' })}>
            Browse Events
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const seatsList = b.seats?.map((s) => s.seatNumber).join(', ') || 'N/A';
            const totalPaid = b.totalPrice || 0;

            return (
              <div
                key={b._id}
                className="card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-gray-700 hover:border-gray-500 transition-all duration-300"
              >
                <div className="flex-1 space-y-2">
                  <h3 className="font-bold text-xl text-white">
                    {b.eventId?.title || 'Unknown Event'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-400">
                    <p>
                      <i className="fas fa-map-marker-alt mr-2 text-red-500"></i>
                      {b.eventId?.venue || 'N/A'}
                    </p>
                    <p>
                      <i className="fas fa-clock mr-2 text-blue-400"></i>
                      {b.eventId?.date ? formatDate(b.eventId.date) : 'N/A'}
                    </p>
                    <p>
                      <i className="fas fa-couch mr-2 text-purple-400"></i>
                      Seats: <span className="text-white">{seatsList}</span>
                    </p>
                    <p>
                      <i className="fas fa-receipt mr-2 text-green-400"></i>
                      Amount: <span className="text-white font-semibold">{formatCurrency(totalPaid)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <span
                      className={`badge text-xs ${
                        b.status === 'confirmed'
                          ? 'bg-green-900 text-green-300'
                          : b.status === 'cancelled'
                          ? 'bg-red-900 text-red-300'
                          : 'bg-yellow-900 text-yellow-300'
                      }`}
                    >
                      {b.status?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">
                      Payment ID: {b.paymentDetails?.transactionId || 'Mock'}
                    </span>
                  </div>
                </div>
                <div className="w-full md:w-auto flex flex-row md:flex-col gap-2 justify-end self-stretch md:self-center">
                  <button
                    className="btn-secondary text-sm flex-1 md:flex-initial flex items-center justify-center gap-1.5"
                    onClick={() => setPage({ name: 'invoice', bookingId: b._id })}
                  >
                    <i className="fas fa-file-invoice"></i> View Invoice
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
