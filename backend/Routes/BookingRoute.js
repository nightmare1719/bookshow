const express = require('express');
const { protect, restrictTo } = require('../Middleware/authMiddleware');
const validateRequest = require('../Middleware/validateRequest');
const { completeBookingSchema } = require('../Validators/schemas');
const {
  completeBooking,
  getMyBookings,
  getBookingById,
  createRazorpayOrder,
  verifyRazorpayPayment,
  depositWallet,
  createDepositOrder,
  verifyDeposit,
  stripeSubscribe,
  stripeStatus,
  validateCoupon,
  createCoupon,
  getReferralCode,
  applyReferral,
  verifyTicket
} = require('../Controller/BookingController');

const router = express.Router();

router.post('/complete', protect, validateRequest(completeBookingSchema), completeBooking);
router.post('/', protect, validateRequest(completeBookingSchema), completeBooking);
router.get('/my-bookings', protect, getMyBookings);
router.get('/my', protect, getMyBookings);
router.get('/:id', protect, getBookingById);
router.post('/razorpay/order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/deposit-wallet', protect, depositWallet);
router.post('/deposit-wallet/order', protect, createDepositOrder);
router.post('/deposit-wallet/verify', protect, verifyDeposit);
router.post('/stripe/subscribe', protect, stripeSubscribe);
router.get('/stripe/status', protect, stripeStatus);
router.post('/coupons/validate', protect, validateCoupon);
router.post('/coupons/create', protect, restrictTo('admin'), createCoupon);
router.get('/referral/code', protect, getReferralCode);
router.post('/referral/apply', protect, applyReferral);
router.post('/verify-ticket', protect, restrictTo('organizer', 'admin'), verifyTicket);

module.exports = router;
