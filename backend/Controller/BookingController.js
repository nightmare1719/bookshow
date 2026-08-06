const mongoose = require('mongoose');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const Booking = require('../Model/BookingModel');
const Seat = require('../Model/SeatModel');
const Event = require('../Model/EventModel');
const User = require('../Model/UserModel');
const Coupon = require('../Model/CouponModel');
const Referral = require('../Model/ReferralModel');
const Notification = require('../Model/NotificationModel');
const AppError = require('../Utils/AppError');
const { redis } = require('../Config/redis');
const mockQueueService = require('../Services/mockQueueService');

let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

const sendBookingNotifications = async (userId, eventId, seatNumbers, session = null) => {
  try {
    const event = await Event.findById(eventId).session(session);
    if (!event) return;

    // Attendee notification
    const attendeeNotif = await Notification.create([{
      userId,
      title: 'Booking Confirmed!',
      message: `Successfully booked seats: ${seatNumbers.join(', ')} for event "${event.title}".`,
      type: 'success'
    }], session ? { session } : {});

    // Organizer notification
    const organizerNotif = await Notification.create([{
      userId: event.organizerId,
      title: 'New Ticket Booking!',
      message: `A booking of ${seatNumbers.length} tickets for your event "${event.title}" has been confirmed.`,
      type: 'info'
    }], session ? { session } : {});

    // Emit socket.io real-time push events
    if (global.io) {
      global.io.emit(`notification-${userId}`, attendeeNotif[0]);
      global.io.emit(`notification-${event.organizerId}`, organizerNotif[0]);
    }
  } catch (err) {
    console.error('Error sending booking notifications:', err);
  }
};

const completeBooking = async (req, res, next) => {
  const session = global.USE_TRANSACTIONS ? await mongoose.startSession() : null;
  if (session) session.startTransaction();
  try {
    const { eventId, seatIds, paymentMethod = 'mock', couponCode } = req.body;
    const userId = req.user._id;
    const now = new Date();

    const seats = await Seat.find({
      _id: { $in: seatIds },
      eventId,
      status: 'locked',
      lockedBy: userId,
      lockedUntil: { $gt: now }
    }).session(session);

    if (seats.length !== seatIds.length) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      return next(new AppError('One or more seats are not locked by you or the lock has expired. Please select seats again.', 400));
    }

    // Pre-booking window check: bookable only within 7 days of event creation
    const event = await Event.findById(eventId).lean();
    if (!event) return next(new AppError('Event not found.', 404));
    const createdAt = event.createdAt || new Date();
    const windowEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      return next(new AppError('Pre-booking window for this event has closed (7 days from listing).', 400));
    }

    const ticketSubtotal = seats.reduce((sum, s) => sum + s.price, 0);
    const platformFee = seats.length * 2; // ₹2 per ticket
    const baseForGst = ticketSubtotal + platformFee;
    const gst = Math.round(baseForGst * 0.12 * 100) / 100;
    const subtotal = Math.round((baseForGst + gst) * 100) / 100;
    let discountApplied = 0;
    let finalAmount = subtotal;

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).session(session);
      if (!coupon || !coupon.isValid()) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
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
      await coupon.save(session ? { session } : {});
    }

    if (paymentMethod === 'wallet') {
      const user = await User.findById(userId).session(session);
      if (!user || (user.walletBalance || 0) < finalAmount) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return next(new AppError('Insufficient wallet balance. Please deposit funds.', 400));
      }
      user.walletBalance = (user.walletBalance || 0) - finalAmount;
      await user.save(session ? { session } : {});
    }

    const transactionId = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const qrData = JSON.stringify({ transactionId, eventId, userId: userId.toString(), seats: seats.map(s => s.seatNumber) });
    const qrCode = await QRCode.toDataURL(qrData);

    const booking = await Booking.create([{
      userId,
      eventId,
      seatIds,
      seatNumbers: seats.map(s => s.seatNumber),
      showtime: seats[0] && seats[0].showtime ? seats[0].showtime : '',
      totalAmount: finalAmount,
      transactionId,
      status: 'confirmed',
      paymentMethod,
      qrCode,
      couponCode: couponCode || null,
      discountApplied
    }], session ? { session } : {});

    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { $set: { status: 'booked', lockedBy: null, lockedUntil: null } },
      session ? { session } : {}
    );

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

    await Event.findByIdAndUpdate(eventId, { $inc: { seatsSold: seats.length } }, session ? { session } : {});

    const pastBookingsCount = await Booking.countDocuments({ userId, status: 'confirmed' }).session(session);
    if (pastBookingsCount === 0) {
      const referral = await Referral.findOne({ referredId: userId, status: 'pending' }).session(session);
      if (referral) {
        const reward = referral.rewardAmount || 50;
        const referrer = await User.findById(referral.referrerId).session(session);
        if (referrer) {
          referrer.walletBalance = (referrer.walletBalance || 0) + reward;
          await referrer.save(session ? { session } : {});
        }
        const referee = await User.findById(userId).session(session);
        if (referee) {
          referee.walletBalance = (referee.walletBalance || 0) + reward;
          await referee.save(session ? { session } : {});
        }
        referral.status = 'completed';
        await referral.save(session ? { session } : {});
      }
    }

    await sendBookingNotifications(userId, eventId, seats.map(s => s.seatNumber), session);

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

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
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    next(err);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id, status: 'confirmed' })
      .populate('eventId', 'title venue date category image seatCategories showtimes')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with seat category details
    const enriched = await Promise.all(bookings.map(async (b) => {
      const seatDocs = await Seat.find({ _id: { $in: b.seatIds } }).select('seatNumber category price').lean();
      return { ...b, seats: seatDocs };
    }));

    res.status(200).json({ status: 'success', data: { bookings: enriched } });
  } catch (err) {
    next(err);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('eventId', 'title venue date category showtimes seatCategories screenName')
      .lean();

    if (!booking) return next(new AppError('Booking not found.', 404));

    const user = await User.findById(req.user._id).select('email profile').lean();

    // Fetch seat details (category + price per seat)
    const seatDocs = await Seat.find({ _id: { $in: booking.seatIds } }).lean();

    const seatTicketPrice = seatDocs.reduce((sum, s) => sum + (s.price || 0), 0);
    const platformFee = seatDocs.length * 2; // ₹2 per seat
    const baseForGst = seatTicketPrice + platformFee;
    const gst = Math.round(baseForGst * 0.12 * 100) / 100;
    const totalAmount = Math.round((baseForGst + gst) * 100) / 100;

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
      showtime: booking.showtime,
      seats: seatDocs.map(s => ({
        seatNumber: s.seatNumber,
        category: s.category,
        price: s.price
      })),
      seatsCount: seatDocs.length,
      pricing: {
        ticketPrice: seatTicketPrice,
        platformFee,
        gst,
        total: totalAmount,
        currency: 'INR',
        discountApplied: booking.discountApplied || 0
      },
      payment: { method: booking.paymentMethod, transactionId: booking.transactionId },
      qrCode: booking.qrCode,
      status: booking.status
    };

    res.status(200).json({ status: 'success', data: { booking, invoice } });
  } catch (err) {
    next(err);
  }
};

const createRazorpayOrder = async (req, res, next) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user._id;
    const now = new Date();

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

    const ticketSubtotal = seats.reduce((sum, s) => sum + s.price, 0);
    const platformFee = seats.length * 2;
    const baseForGst = ticketSubtotal + platformFee;
    const gst = Math.round(baseForGst * 0.12 * 100) / 100;
    const grandTotal = Math.round((baseForGst + gst) * 100) / 100;

    const amountInPaise = Math.round(grandTotal * 100);

    if (global.USE_IN_MEMORY_FALLBACK || !razorpayInstance) {
      return res.status(200).json({
        status: 'success',
        isMock: true,
        data: {
          orderId: `order_mock_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountInPaise,
          currency: 'INR',
          keyId: process.env.RAZORPAY_KEY_ID || 'mock_key_id'
        }
      });
    }

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
};

const verifyRazorpayPayment = async (req, res, next) => {
  const session = global.USE_TRANSACTIONS ? await mongoose.startSession() : null;
  if (session) session.startTransaction();
  try {
    const { eventId, seatIds, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id;
    const now = new Date();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      return next(new AppError('Razorpay payment details (order ID, payment ID, signature) are required.', 400));
    }

    const isMockOrder = String(razorpay_order_id).startsWith('order_mock_');
    if (!isMockOrder) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return next(new AppError('Payment verification failed. Invalid transaction signature.', 400));
      }
    }

    const seats = await Seat.find({
      _id: { $in: seatIds },
      eventId,
      status: 'locked',
      lockedBy: userId,
      lockedUntil: { $gt: now }
    }).session(session);

    if (seats.length !== seatIds.length) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      return next(new AppError('One or more seat locks have expired. Please contact support with payment ID: ' + razorpay_payment_id, 400));
    }

    const subtotal = seats.reduce((sum, s) => sum + s.price, 0);

    const qrData = JSON.stringify({
      transactionId: razorpay_payment_id,
      eventId,
      userId: userId.toString(),
      seats: seats.map(s => s.seatNumber)
    });
    const qrCode = await QRCode.toDataURL(qrData);

    const booking = await Booking.create([{
      userId,
      eventId,
      seatIds,
      seatNumbers: seats.map(s => s.seatNumber),
      totalAmount: subtotal,
      transactionId: razorpay_payment_id,
      status: 'confirmed',
      paymentMethod: 'razorpay',
      qrCode
    }], session ? { session } : {});

    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { $set: { status: 'booked', lockedBy: null, lockedUntil: null } },
      session ? { session } : {}
    );

    await Event.findByIdAndUpdate(eventId, { $inc: { seatsSold: seats.length } }, session ? { session } : {});

    await sendBookingNotifications(userId, eventId, seats.map(s => s.seatNumber), session);

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

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
    if (session && typeof session.inTransaction === 'function' && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    next(err);
  }
};

const depositWallet = async (req, res, next) => {
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
};

const createDepositOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return next(new AppError('Please provide a valid deposit amount.', 400));
    }

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
};

const verifyDeposit = async (req, res, next) => {
  try {
    const { amount, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return next(new AppError('Invalid deposit amount.', 400));
    }

    if (!razorpay_order_id || !razorpay_payment_id) {
      return next(new AppError('Payment details are required.', 400));
    }

    const isMock = razorpay_order_id.startsWith('order_mock_');
    if (!isMock && razorpayInstance) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return next(new AppError('Payment verification failed. Invalid transaction signature.', 400));
      }

      // Reconcile the paid amount against the requested deposit amount
      const order = await razorpayInstance.orders.fetch(razorpay_order_id);
      const paidPaise = Number(order.amount_paid);
      if (!paidPaise || paidPaise !== Math.round(Number(amount) * 100)) {
        return next(new AppError('Payment amount does not match the requested deposit.', 400));
      }
    }

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
};

const stripeSubscribe = async (req, res, next) => {
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
};

const stripeStatus = async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      hasActiveSubscription: true,
      plan: 'Organizer Premium Plan',
      expiresAt: new Date(Date.now() + 30 * 86400000)
    }
  });
};

const validateCoupon = async (req, res, next) => {
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
};

const createCoupon = async (req, res, next) => {
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
};

const getReferralCode = async (req, res, next) => {
  const code = `REF-${req.user._id.toString().substring(18).toUpperCase()}`;
  res.status(200).json({ status: 'success', data: { referralCode: code } });
};

const applyReferral = async (req, res, next) => {
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
};

const verifyTicket = async (req, res, next) => {
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
};

module.exports = {
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
};
