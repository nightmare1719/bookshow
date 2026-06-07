const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { redis } = require('../config/redis');
const User = require('../models/User');
const Event = require('../models/Event');
const Seat = require('../models/Seat');
const Booking = require('../models/Booking');
const Coupon = require('../models/Coupon');
const Referral = require('../models/Referral');
const AppError = require('../utils/AppError');
const { cancelSeatRelease } = require('../queues/seatReleaseQueue');
const socketService = require('./socketService');
const mockDbService = require('./mockDbService');
const mockQueueService = require('./mockQueueService');

let stripeInstance = null;
if (process.env.STRIPE_SECRET_KEY && process.env.MOCK_PAYMENT_MODE !== 'true') {
  stripeInstance = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/**
 * Initialize Stripe Payment Intent for locked seats
 */
const initiateStripePayment = async (userId, seatIds) => {
  // --- IN-MEMORY RESILIENT FALLBACK PATH ---
  if (global.USE_IN_MEMORY_FALLBACK) {
    const seats = await mockDbService.seats.find({ _id: { $in: seatIds } });
    const totalAmount = seats.reduce((sum, seat) => sum + seat.price, 0);
    return {
      paymentIntentId: `mock_pi_${Math.random().toString(36).substring(2, 15)}`,
      clientSecret: `mock_secret_${Math.random().toString(36).substring(2, 15)}`,
      totalAmount,
      currency: 'usd'
    };
  }

  // --- STANDARD HIGH-PERFORMANCE PRODUCTION PATH ---
  const seats = await Seat.find({ _id: { $in: seatIds }, lockedBy: userId, status: 'locked' });
  if (seats.length !== seatIds.length) {
    throw new AppError('One or more seats are not locked by you, or the lock has expired.', 400);
  }

  const totalAmount = seats.reduce((sum, seat) => sum + seat.price, 0);

  if (process.env.MOCK_PAYMENT_MODE === 'true') {
    return {
      paymentIntentId: `mock_pi_${Math.random().toString(36).substring(2, 15)}`,
      clientSecret: `mock_secret_${Math.random().toString(36).substring(2, 15)}`,
      totalAmount,
      currency: 'usd'
    };
  }

  if (!stripeInstance) {
    throw new AppError('Stripe keys are missing or invalid.', 500);
  }

  const paymentIntent = await stripeInstance.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: 'usd',
    metadata: {
      userId: userId.toString(),
      seatIds: seatIds.join(','),
      eventId: seats[0].eventId.toString()
    }
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    totalAmount,
    currency: 'usd'
  };
};

/**
 * Trigger referral rewards when a referred user makes their first booking
 */
const processReferrals = async (referredUserId, session = null) => {
  try {
    let referral;
    if (global.USE_IN_MEMORY_FALLBACK) {
      referral = await mockDbService.referrals.findOne({ referredId: referredUserId, status: 'pending' });
    } else {
      referral = await Referral.findOne({ referredId: referredUserId, status: 'pending' }).session(session);
    }

    if (referral) {
      const reward = referral.rewardAmount || 50;

      // 1. Credit Referrer
      let referrer;
      if (global.USE_IN_MEMORY_FALLBACK) {
        referrer = await mockDbService.users.findById(referral.referrerId);
        if (referrer) {
          await referrer.creditWallet(reward, `Referral reward for inviting user ID ${referredUserId}`);
        }
      } else {
        referrer = await User.findById(referral.referrerId).session(session);
        if (referrer) {
          await referrer.creditWallet(reward, `Referral reward for inviting user ID ${referredUserId}`);
        }
      }

      // 2. Credit Referee
      let referee;
      if (global.USE_IN_MEMORY_FALLBACK) {
        referee = await mockDbService.users.findById(referredUserId);
        if (referee) {
          await referee.creditWallet(reward, `Sign-up referral bonus reward`);
        }
      } else {
        referee = await User.findById(referredUserId).session(session);
        if (referee) {
          await referee.creditWallet(reward, `Sign-up referral bonus reward`);
        }
      }

      // 3. Complete referral record
      referral.status = 'completed';
      await referral.save(session ? { session } : {});
      console.log(`Referral reward system activated! Credited Referrer and Referee with ${reward} credits each.`);
    }
  } catch (err) {
    console.error('Failed to process referral rewards:', err.message);
  }
};

/**
 * Complete a booking using Mongoose Transactions / In-Memory transactions
 */
const completeBooking = async (userId, eventId, seatIds, paymentMethod, transactionId = null, couponCode = null) => {
  // --- IN-MEMORY RESILIENT FALLBACK PATH ---
  if (global.USE_IN_MEMORY_FALLBACK) {
    console.log('Booking Engine: Executing Booking in Resilient Fallback Mode');

    const user = await mockDbService.users.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    const event = await mockDbService.events.findById(eventId);
    if (!event) throw new AppError('Event not found', 404);

    const seats = await mockDbService.seats.find({ _id: { $in: seatIds } });
    if (seats.length !== seatIds.length) throw new AppError('Some selected seats do not exist.', 404);

    // Verify lock states in memory
    for (const seat of seats) {
      if (seat.status === 'booked') throw new AppError(`Seat ${seat.seatNumber} is already booked.`, 409);
      const owner = mockQueueService.getLockOwner(seat._id);
      if (seat.status !== 'locked' || owner !== userId.toString()) {
        throw new AppError(`Seat ${seat.seatNumber} is not locked by you, or lock has expired.`, 400);
      }
    }

    let totalAmount = seats.reduce((sum, s) => sum + s.price, 0);

    // Apply Coupon discount
    let coupon = null;
    let discountApplied = 0;
    if (couponCode) {
      coupon = await mockDbService.coupons.findOne({ code: couponCode });
      if (coupon && coupon.isValid()) {
        if (coupon.discountType === 'percentage') {
          discountApplied = totalAmount * (coupon.discountValue / 100);
        } else {
          discountApplied = coupon.discountValue;
        }
        totalAmount = Math.max(0, totalAmount - discountApplied);
        coupon.usedCount += 1;
        await coupon.save();
      } else {
        throw new AppError('Invalid, expired, or deactivated coupon code.', 400);
      }
    }

    // Debit wallet balance if wallet payment
    if (paymentMethod === 'wallet') {
      await user.debitWallet(totalAmount, `Booking for event: ${event.title}`);
    }

    // Create Booking Document
    const booking = await mockDbService.bookings.create({
      userId,
      eventId,
      seatIds: seatIds.map(id => id.toString()),
      totalAmount,
      paymentMethod,
      transactionId: transactionId || `txn_${Math.random().toString(36).substring(2, 15)}`,
      status: 'confirmed',
      couponCode: couponCode || null,
      discountApplied
    });

    // Generate ticket QR Code URL
    const qrToken = jwt.sign(
      { bookingId: booking._id, email: user.email, eventId: event._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '30d' }
    );
    booking.qrCode = await QRCode.toDataURL(qrToken);
    await booking.save();

    // Mark seats booked and clear locking caches
    for (const seat of seats) {
      seat.status = 'booked';
      seat.lockedBy = null;
      seat.lockedUntil = null;
      await seat.save();
      
      mockQueueService.releaseLock(seat._id);
      socketService.emitSeatUpdate(eventId, seat._id, seat.seatNumber, 'booked', seat.price);
    }

    // Recalculate event dynamic price metrics
    event.seatsSold += seatIds.length;
    const oldPrice = event.dynamicPrice;
    const newPrice = event.calculateDynamicPrice();
    await event.save();

    if (newPrice !== oldPrice) {
      socketService.emitEventPricingUpdate(eventId, newPrice);
    }

    // Process peer-to-peer referral credits on first-time ticket bookings
    const pastBookings = await mockDbService.bookings.find({ userId });
    if (pastBookings.length <= 1) { // Current booking included
      await processReferrals(userId);
    }

    return booking;
  }

  // --- STANDARD HIGH-PERFORMANCE PRODUCTION PATH ---
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const event = await Event.findById(eventId).session(session);
    if (!event) {
      throw new AppError('Event not found', 404);
    }

    const seats = await Seat.find({ _id: { $in: seatIds } }).session(session);
    
    if (seats.length !== seatIds.length) {
      throw new AppError('Some selected seats do not exist.', 404);
    }

    const now = new Date();
    for (const seat of seats) {
      if (seat.status === 'booked') {
        throw new AppError(`Seat ${seat.seatNumber} is already booked.`, 409);
      }
      if (seat.status !== 'locked' || !seat.lockedBy || seat.lockedBy.toString() !== userId.toString()) {
        throw new AppError(`Seat ${seat.seatNumber} is not locked by you, or lock has expired.`, 400);
      }
      if (seat.lockedUntil && seat.lockedUntil < now) {
        throw new AppError(`Lock on seat ${seat.seatNumber} has expired.`, 400);
      }
    }

    let totalAmount = seats.reduce((sum, s) => sum + s.price, 0);

    // Apply Coupon discount
    let coupon = null;
    let discountApplied = 0;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).session(session);
      if (coupon && coupon.isValid()) {
        if (coupon.discountType === 'percentage') {
          discountApplied = totalAmount * (coupon.discountValue / 100);
        } else {
          discountApplied = coupon.discountValue;
        }
        totalAmount = Math.max(0, totalAmount - discountApplied);
        coupon.usedCount += 1;
        await coupon.save({ session });
      } else {
        throw new AppError('Invalid, expired, or deactivated coupon code.', 400);
      }
    }

    if (paymentMethod === 'wallet') {
      if (user.walletBalance < totalAmount) {
        throw new AppError('Insufficient wallet balance to complete this booking.', 400);
      }
      user.walletBalance -= totalAmount;
      user.walletTransactions.push({
        amount: totalAmount,
        type: 'debit',
        description: `Booking for event: ${event.title}`
      });
      await user.save({ session });
    }

    const booking = new Booking({
      userId,
      eventId,
      seatIds,
      totalAmount,
      paymentMethod,
      transactionId: transactionId || `txn_${Math.random().toString(36).substring(2, 15)}`,
      status: 'confirmed'
    });

    // Dynamically store coupon info inside booking model
    booking.set('couponCode', couponCode || null, { strict: false });
    booking.set('discountApplied', discountApplied, { strict: false });

    const qrToken = jwt.sign(
      { bookingId: booking._id, email: user.email, eventId: event._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    const qrCodeDataUrl = await QRCode.toDataURL(qrToken);
    booking.qrCode = qrCodeDataUrl;

    await booking.save({ session });

    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { $set: { status: 'booked', lockedBy: null, lockedUntil: null } },
      { session }
    );

    event.seatsSold += seatIds.length;
    const oldPrice = event.dynamicPrice;
    const newPrice = event.calculateDynamicPrice();
    await event.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Release Redis distributed lock keys and cancel jobs
    for (const seatId of seatIds) {
      if (!global.USE_REDIS_FALLBACK) {
        try {
          await redis.del(`lock:seat:${seatId}`);
        } catch (err) {}
      }
      await cancelSeatRelease(seatId);
    }

    seats.forEach((seat) => {
      socketService.emitSeatUpdate(eventId, seat._id, seat.seatNumber, 'booked', seat.price);
    });

    if (newPrice !== oldPrice) {
      socketService.emitEventPricingUpdate(eventId, newPrice);
    }

    // Process referral rewards on the user's first-ever ticket booking
    const pastBookingsCount = await Booking.countDocuments({ userId });
    if (pastBookingsCount <= 1) {
      await processReferrals(userId);
    }

    return booking;

  } catch (error) {
    if (session && typeof session.inTransaction === 'function' && session.inTransaction()) {
      await session.abortTransaction();
    }
    if (session) {
      session.endSession();
    }
    throw error;
  }
};

module.exports = {
  initiateStripePayment,
  completeBooking
};
