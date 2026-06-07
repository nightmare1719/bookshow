const express = require('express');
const Seat = require('../models/Seat');
const AppError = require('../utils/AppError');
const { protect } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { lockSeatSchema } = require('../validators/schemas');
const { redis } = require('../config/redis');
const mockQueueService = require('../services/mockQueueService');

const router = express.Router();

const LOCK_DURATION_MINUTES = 10;

// POST /api/seats/lock - Lock a seat for 10 minutes (concurrency safe)
router.post('/lock', protect, validateRequest(lockSeatSchema), async (req, res, next) => {
  try {
    const { seatId } = req.body;
    const now = new Date();

    const seat = await Seat.findById(seatId);
    if (!seat) return next(new AppError('Seat not found.', 404));

    if (seat.status === 'booked') {
      return next(new AppError('Seat is already booked.', 400));
    }

    // Distributed lock acquisition via Redis or mock Queue
    const lockKey = `lock:seat:${seatId}`;
    let lockAcquired = false;

    if (global.USE_REDIS_FALLBACK) {
      lockAcquired = await mockQueueService.acquireLock(seatId, req.user._id, LOCK_DURATION_MINUTES * 60 * 1000);
    } else {
      try {
        const result = await redis.set(lockKey, req.user._id.toString(), 'NX', 'EX', LOCK_DURATION_MINUTES * 60);
        lockAcquired = (result === 'OK');
      } catch (err) {
        // Fallback to mockQueueService if Redis throws error during request
        lockAcquired = await mockQueueService.acquireLock(seatId, req.user._id, LOCK_DURATION_MINUTES * 60 * 1000);
      }
    }

    // Check if the lock was acquired
    if (!lockAcquired) {
      // Double check if the current user is the one who already has the lock
      let lockOwner = null;
      if (global.USE_REDIS_FALLBACK) {
        lockOwner = await mockQueueService.getLockOwner(seatId);
      } else {
        try {
          lockOwner = await redis.get(lockKey);
        } catch (_) {
          lockOwner = await mockQueueService.getLockOwner(seatId);
        }
      }

      if (lockOwner !== String(req.user._id)) {
        return res.status(409).json({
          status: 'fail',
          message: 'Seat is already locked by another user.'
        });
      }
      // If current user is lock owner, we let them re-lock/refresh
    }

    seat.status = 'locked';
    seat.lockedBy = req.user._id;
    seat.lockedUntil = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);
    await seat.save();

    res.status(200).json({
      status: 'success',
      message: `Seat locked for ${LOCK_DURATION_MINUTES} minutes.`,
      data: { seat }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/seats/release - Release a locked seat
router.post('/release', protect, async (req, res, next) => {
  try {
    const { seatId } = req.body;
    const seat = await Seat.findById(seatId);
    if (!seat) return next(new AppError('Seat not found.', 404));

    if (seat.status === 'locked' && seat.lockedBy.toString() === req.user._id.toString()) {
      seat.status = 'available';
      seat.lockedBy = null;
      seat.lockedUntil = null;
      await seat.save();

      // Release Redis lock
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

    res.status(200).json({ status: 'success', message: 'Seat released.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
