const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const Event = require('../models/Event');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const Referral = require('../models/Referral');
const AppError = require('../utils/AppError');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { completeBookingSchema } = require('../validators/schemas');
const { redis } = require('../config/redis');
const mockQueueService = require('../services/mockQueueService');

// Initialize Razorpay instance
let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

const router = express.Router();

// POST /api/bookings/complete - Complete a booking after payment
router.post('/complete', protect, validateRequest(completeBookingSchema), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { eventId, seatIds, paymentMethod = 'mock', couponCode } = req.body;
    const userId = req.user._id;
    const now = new Date();

    // Verify all seats are locked by this user
    const seats = await Seat.find({
      _id: { $in: seatIds },
      eventId,
      status: 'locked',
      lockedBy: userId,
      lockedUntil: { $gt: now }
    }).session(session);

    if (seats.length !== seatIds.length) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError('One or more seats are not locked by you or the lock has expired. Please select seats again.', 400));
    }

    const subtotal = seats.reduce((sum, s) => sum + s.price, 0);
    let discountApplied = 0;
    let finalAmount = subtotal;

    // Apply Coupon discount if provided
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).session(session);
      if (!coupon || !coupon.isValid()) {
        await session.abortTransaction();
        session.endSession();
        return next(new AppError('Invalid or expired coupon code.', 400));
      }
      if (coupon.discountType === 'percentage') {
        discountApplied = subtotal * (coupon.discountValue / 100);
      } else {
        discountApplied = coupon.discountValue;
      }
      discountApplied = Math.round(discountApplied * 100) / 100;
      finalAmount = Math.max(0, subtotal - discountApplied);
      coupon.usedCount += 1;
      await coupon.save({ session });
    }

    // Handle Wallet Checkout logic inside transaction
    if (paymentMethod === 'wallet') {
      const user = await User.findById(userId).session(session);
      if (!user || (user.walletBalance || 0) < finalAmount) {
        await session.abortTransaction();
        session.endSession();
        return next(new AppError('Insufficient wallet balance. Please deposit funds.', 400));
      }
      user.walletBalance = (user.walletBalance || 0) - finalAmount;
      await user.save({ session });
    }

    const transactionId = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Generate QR code
    const qrData = JSON.stringify({ transactionId, eventId, userId: userId.toString(), seats: seats.map(s => s.seatNumber) });
    const qrCode = await QRCode.toDataURL(qrData);

    // Create booking
    const booking = await Booking.create([{
      userId,
      eventId,
      seatIds,
      seatNumbers: seats.map(s => s.seatNumber),
      totalAmount: finalAmount,
      transactionId,
      status: 'confirmed',
      paymentMethod,
      qrCode,
      couponCode: couponCode || null,
      discountApplied
    }], { session });

    // Mark seats as booked
    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { $set: { status: 'booked', lockedBy: null, lockedUntil: null } },
      { session }
    );

    // Release locks in Redis/MockQueue
    for (const seatId of seatIds) {
      const lockKey = `lock:seat:${seatId}`;
      if (global.USE_REDIS_FALLBACK) {
        await mockQueueService.releaseLock(seatId);
      } else {
        try {
          await redis.del(lockKey);
        } catch (_) {
          await mockQueueService.releaseLock(seatId);
        }
      }
    }

    // Update event seats sold count
    await Event.findByIdAndUpdate(eventId, { $inc: { seatsSold: seats.length } }, { session });

    // Reward referral credits if first booking
    const pastBookingsCount = await Booking.countDocuments({ userId, status: 'confirmed' }).session(session);
    if (pastBookingsCount === 0) {
      const referral = await Referral.findOne({ referredId: userId, status: 'pending' }).session(session);
      if (referral) {
        const reward = referral.rewardAmount || 50;
        const referrer = await User.findById(referral.referrerId).session(session);
        if (referrer) {
          referrer.walletBalance = (referrer.walletBalance || 0) + reward;
          await referrer.save({ session });
        }
        const referee = await User.findById(userId).session(session);
        if (referee) {
          referee.walletBalance = (referee.walletBalance || 0) + reward;
          await referee.save({ session });
        }
        referral.status = 'completed';
        await referral.save({ session });
      }
    }

    const Notification = require('../models/Notification');
    await Notification.create([{
      userId,
      title: 'Booking Confirmed!',
      message: `Successfully booked seats: ${seats.map(s => s.seatNumber).join(', ')}.`,
      type: 'success'
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // Invalidate cached event lists and details to update sold seats / dynamic pricing
    if (!global.USE_REDIS_FALLBACK) {
      try {
        const keys = await redis.keys('events:list:*');
        if (keys && keys.length > 0) await redis.del(...keys);
        await redis.del(`event:detail:${eventId}`);
      } catch (_) {}
    }

    res.status(201).json({
      status: 'success',
      data: { booking: booking[0] }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
});

// GET /api/bookings/my-bookings - Get current user's bookings
router.get('/my-bookings', protect, async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id, status: 'confirmed' })
      .populate('eventId', 'title venue date category image')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ status: 'success', data: { bookings } });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id - Get single booking with invoice
router.get('/:id', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('eventId', 'title venue date category')
      .lean();

    if (!booking) return next(new AppError('Booking not found.', 404));

    const user = await User.findById(req.user._id).select('email profile').lean();

    // Build invoice
    const subtotal = booking.totalAmount;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const invoice = {
      invoiceNumber: `INV-${booking.transactionId}`,
      bookingId: booking._id,
      issuedAt: booking.createdAt,
      customer: {
        name: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || 'Valued Customer',
        email: user.email,
        phone: user.profile?.phone || 'N/A'
      },
      event: booking.eventId,
      seats: booking.seatNumbers,
      seatsCount: booking.seatNumbers.length,
      pricing: { subtotal, tax, total, currency: 'INR' },
      payment: { method: booking.paymentMethod, transactionId: booking.transactionId },
      qrCode: booking.qrCode,
      status: booking.status
    };

    res.status(200).json({ status: 'success', data: { booking, invoice } });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/razorpay/order - Create a Razorpay Order
router.post('/razorpay/order', protect, async (req, res, next) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user._id;
    const now = new Date();

    if (!razorpayInstance) {
      return next(new AppError('Razorpay keys are missing or invalid on server.', 500));
    }

    // Verify all seats are locked by this user
    const seats = await Seat.find({
      _id: { $in: seatIds },
      eventId,
      status: 'locked',
      lockedBy: userId,
      lockedUntil: { $gt: now }
    });

    if (seats.length !== seatIds.length) {
      return next(new AppError('One or more seats are not locked by you or the lock has expired.', 400));
    }

    // Calculate subtotal, service tax, and grand total in INR
    const subtotal = seats.reduce((sum, s) => sum + s.price, 0);
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const grandTotal = Math.round((subtotal + tax) * 100) / 100;
    
    // Razorpay amount is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(grandTotal * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${crypto.randomBytes(6).toString('hex')}`,
      notes: {
        userId: userId.toString(),
        eventId: eventId.toString(),
        seatIds: seatIds.join(',')
      }
    };

    const order = await razorpayInstance.orders.create(options);

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/razorpay/verify - Verify Razorpay Payment Signature and Complete Booking
router.post('/razorpay/verify', protect, async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { eventId, seatIds, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id;
    const now = new Date();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError('Razorpay payment details (order ID, payment ID, signature) are required.', 400));
    }

    // 1. Verify Cryptographic HMAC SHA256 Signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError('Payment verification failed. Invalid transaction signature.', 400));
    }

    // 2. Verify all seats are locked by this user
    const seats = await Seat.find({
      _id: { $in: seatIds },
      eventId,
      status: 'locked',
      lockedBy: userId,
      lockedUntil: { $gt: now }
    }).session(session);

    if (seats.length !== seatIds.length) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError('One or more seat locks have expired. Please contact support with payment ID: ' + razorpay_payment_id, 400));
    }

    const subtotal = seats.reduce((sum, s) => sum + s.price, 0);

    // 3. Generate Ticket QR Code
    const qrData = JSON.stringify({
      transactionId: razorpay_payment_id,
      eventId,
      userId: userId.toString(),
      seats: seats.map(s => s.seatNumber)
    });
    const qrCode = await QRCode.toDataURL(qrData);

    // 4. Create Confirmed Booking in Transaction
    const booking = await Booking.create([{
      userId,
      eventId,
      seatIds,
      seatNumbers: seats.map(s => s.seatNumber),
      totalAmount: subtotal, // Store base price in totalAmount
      transactionId: razorpay_payment_id,
      status: 'confirmed',
      paymentMethod: 'razorpay',
      qrCode
    }], { session });

    // 5. Mark Seats as Booked
    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { $set: { status: 'booked', lockedBy: null, lockedUntil: null } },
      { session }
    );

    // 6. Update Event Seats Sold count
    await Event.findByIdAndUpdate(eventId, { $inc: { seatsSold: seats.length } }, { session });

    await session.commitTransaction();
    session.endSession();

    // Invalidate cached event lists and details to update sold seats / dynamic pricing
    if (!global.USE_REDIS_FALLBACK) {
      try {
        const keys = await redis.keys('events:list:*');
        if (keys && keys.length > 0) await redis.del(...keys);
        await redis.del(`event:detail:${eventId}`);
      } catch (_) {}
    }

    res.status(201).json({
      status: 'success',
      data: { booking: booking[0] }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
});

// POST /api/bookings/deposit-wallet - Add balance to user's wallet
router.post('/deposit-wallet', protect, async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return next(new AppError('Please provide a valid deposit amount.', 400));
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new AppError('User not found.', 404));
    }
    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();
    res.status(200).json({
      status: 'success',
      data: {
        walletBalance: user.walletBalance
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/deposit-wallet/order - Create a Razorpay Order for Wallet Deposit
router.post('/deposit-wallet/order', protect, async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return next(new AppError('Please provide a valid deposit amount.', 400));
    }

    // Razorpay amount is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(Number(amount) * 100);

    if (process.env.MOCK_PAYMENT_MODE === 'true' || !razorpayInstance) {
      return res.status(200).json({
        status: 'success',
        isMock: true,
        data: {
          orderId: `order_mock_deposit_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountInPaise,
          currency: 'INR',
          keyId: process.env.RAZORPAY_KEY_ID || 'mock_key_id'
        }
      });
    }

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `deposit_${crypto.randomBytes(6).toString('hex')}`,
      notes: {
        userId: userId.toString(),
        type: 'wallet_deposit'
      }
    };

    const order = await razorpayInstance.orders.create(options);

    res.status(200).json({
      status: 'success',
      isMock: false,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/deposit-wallet/verify - Verify Razorpay signature and credit user's wallet
router.post('/deposit-wallet/verify', protect, async (req, res, next) => {
  try {
    const { amount, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return next(new AppError('Invalid deposit amount.', 400));
    }

    if (!razorpay_order_id || !razorpay_payment_id) {
      return next(new AppError('Payment details are required.', 400));
    }

    // Check for mock verification
    const isMock = razorpay_order_id.startsWith('order_mock_');
    if (!isMock && razorpayInstance) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return next(new AppError('Payment verification failed. Invalid transaction signature.', 400));
      }
    }

    // Credit user's wallet
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found.', 404));
    }

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    
    if (!user.walletTransactions) {
      user.walletTransactions = [];
    }
    user.walletTransactions.push({
      amount: Number(amount),
      type: 'credit',
      description: `Razorpay wallet deposit (${razorpay_payment_id})`,
      createdAt: new Date()
    });

    await user.save();

    // Create Notification
    const Notification = require('../models/Notification');
    await Notification.create([{
      userId,
      title: 'Wallet Credited!',
      message: `Successfully deposited ${amount} INR using Razorpay.`,
      type: 'success'
    }]);

    res.status(200).json({
      status: 'success',
      message: 'Wallet credited successfully.',
      data: {
        walletBalance: user.walletBalance
      }
    });
  } catch (err) {
    next(err);
  }
});


// POST /api/bookings/stripe/subscribe - Stripe subscription mock
router.post('/stripe/subscribe', protect, async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return next(new AppError('Please select a valid subscription plan.', 400));
    
    res.status(200).json({
      status: 'success',
      data: {
        subscriptionId: `SUB_STRIPE_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        status: 'active',
        planId,
        checkoutUrl: 'https://checkout.stripe.com/pay/mock_session'
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/stripe/status - Check active subscription status
router.get('/stripe/status', protect, async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      hasActiveSubscription: true,
      plan: 'Organizer Premium Plan',
      expiresAt: new Date(Date.now() + 30 * 86400000)
    }
  });
});

// POST /api/bookings/coupons/validate - Validate coupon code
router.post('/coupons/validate', protect, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return next(new AppError('Please provide a coupon code.', 400));
    
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon || !coupon.isValid()) {
      return res.status(400).json({ status: 'fail', message: 'Invalid or expired coupon.' });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/coupons/create - Create coupon (organizer only)
router.post('/coupons/create', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const { code, discountType, discountValue, expirationDays = 30, maxUses = 100 } = req.body;
    if (!code || !discountType || !discountValue) {
      return next(new AppError('Code, discount type, and discount value are required.', 400));
    }
    
    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      expirationDate: new Date(Date.now() + expirationDays * 86400000),
      maxUses
    });
    
    res.status(201).json({ status: 'success', data: { coupon } });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/referral/code - Get user's referral code
router.get('/referral/code', protect, async (req, res, next) => {
  const code = `REF-${req.user._id.toString().substring(18).toUpperCase()}`;
  res.status(200).json({ status: 'success', data: { referralCode: code } });
});

// POST /api/bookings/referral/apply - Apply referral code
router.post('/referral/apply', protect, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return next(new AppError('Referral code is required.', 400));
    
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode.startsWith('REF-')) {
      return next(new AppError('Invalid referral code format.', 400));
    }
    
    const suffix = cleanCode.replace('REF-', '');
    const users = await User.find({});
    const referrer = users.find(u => u._id.toString().substring(18).toUpperCase() === suffix);
    
    if (!referrer) {
      return next(new AppError('Referrer not found for this code.', 404));
    }
    
    if (referrer._id.toString() === req.user._id.toString()) {
      return next(new AppError('You cannot refer yourself.', 400));
    }
    
    const existing = await Referral.findOne({ referredId: req.user._id });
    if (existing) {
      return next(new AppError('You have already applied a referral code.', 400));
    }
    
    const referral = await Referral.create({
      referrerId: referrer._id,
      referredId: req.user._id,
      rewardAmount: 50,
      status: 'pending'
    });
    
    res.status(201).json({ status: 'success', message: 'Referral code applied successfully!', data: { referral } });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/verify-ticket - Verify a scanned ticket QR token (organizer only)
router.post('/verify-ticket', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const { ticketToken } = req.body;
    if (!ticketToken) return next(new AppError('Ticket token is required.', 400));

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(ticketToken, process.env.JWT_SECRET);
    const booking = await Booking.findById(decoded.bookingId)
      .populate('eventId', 'title venue date')
      .populate('userId', 'email profile');

    if (!booking) {
      return res.status(404).json({ status: 'fail', message: 'Ticket not found or invalid booking.' });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({ status: 'fail', message: `Ticket is invalid. Status: ${booking.status}` });
    }

    res.status(200).json({
      status: 'success',
      message: 'Ticket verified successfully!',
      data: {
        bookingId: booking._id,
        eventTitle: booking.eventId?.title,
        venue: booking.eventId?.venue,
        date: booking.eventId?.date,
        seats: booking.seatNumbers,
        attendee: `${booking.userId?.profile?.firstName || ''} ${booking.userId?.profile?.lastName || ''}`.trim() || booking.userId?.email,
        email: booking.userId?.email
      }
    });
  } catch (err) {
    res.status(400).json({ status: 'fail', message: 'Invalid or expired ticket token: ' + err.message });
  }
});

module.exports = router;
