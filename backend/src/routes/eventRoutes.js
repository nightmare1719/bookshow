const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Seat = require('../models/Seat');
const Booking = require('../models/Booking');
const Vendor = require('../models/Vendor');
const AppError = require('../utils/AppError');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { createEventSchema } = require('../validators/schemas');

const router = express.Router();
const { redis } = require('../config/redis');

// Invalidate event caches in Redis
const clearEventCache = async (eventId = null) => {
  if (global.USE_REDIS_FALLBACK) return;
  try {
    const keys = await redis.keys('events:list:*');
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
    if (eventId) {
      await redis.del(`event:detail:${eventId}`);
    }
  } catch (err) {
    console.warn('⚠️ Redis Cache Invalidation Failed:', err.message);
  }
};


// Generate seat grid for an event
// Generate seat grid for an event
const generateSeats = (eventId, totalSeats, basePrice, seatCategories, bookingType) => {
  const seats = [];
  const rows = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];

  if (bookingType === 'zone') {
    if (seatCategories && seatCategories.length > 0) {
      for (const cat of seatCategories) {
        for (let s = 1; s <= cat.count; s++) {
          seats.push({
            eventId,
            seatNumber: `${cat.name}-${s}`,
            category: cat.name,
            status: 'available',
            price: cat.price
          });
        }
      }
    } else {
      for (let s = 1; s <= totalSeats; s++) {
        seats.push({
          eventId,
          seatNumber: `General-${s}`,
          category: 'General',
          status: 'available',
          price: basePrice
        });
      }
    }
  } else {
    if (seatCategories && seatCategories.length > 0) {
      // Category-based seat generation
      let rowIndex = 0;
      for (const cat of seatCategories) {
        const seatsPerRow = 10;
        let remaining = cat.count;
        while (remaining > 0 && rowIndex < rows.length) {
          const inThisRow = Math.min(remaining, seatsPerRow);
          for (let s = 1; s <= inThisRow; s++) {
            seats.push({
              eventId,
              seatNumber: `${rows[rowIndex]}${s}`,
              category: cat.name,
              status: 'available',
              price: cat.price
            });
          }
          remaining -= inThisRow;
          rowIndex++;
        }
      }
    } else {
      // Simple grid generation
      const seatsPerRow = Math.ceil(totalSeats / rows.length);
      let count = 0;
      for (let r = 0; r < rows.length && count < totalSeats; r++) {
        for (let s = 1; s <= seatsPerRow && count < totalSeats; s++) {
          seats.push({
            eventId,
            seatNumber: `${rows[r]}${s}`,
            category: 'General',
            status: 'available',
            price: basePrice
          });
          count++;
        }
      }
    }
  }
  return seats;
};

// GET /api/events - List all active events
router.get('/', async (req, res, next) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;
    const cacheKey = `events:list:search:${search || ''}:cat:${category || ''}:p:${page}:l:${limit}`;

    if (!global.USE_REDIS_FALLBACK) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return res.status(200).json({
            status: 'success',
            fromCache: true,
            data: parsed
          });
        }
      } catch (err) {
        console.warn('⚠️ Redis Cache Read Failed:', err.message);
      }
    }

    const filter = { isActive: true, date: { $gte: new Date() } };

    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      Event.find(filter).sort({ date: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Event.countDocuments(filter)
    ]);

    const resultData = {
      events,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    };

    if (!global.USE_REDIS_FALLBACK) {
      try {
        await redis.set(cacheKey, JSON.stringify(resultData), 'EX', 60);
      } catch (err) {
        console.warn('⚠️ Redis Cache Write Failed:', err.message);
      }
    }

    res.status(200).json({
      status: 'success',
      fromCache: false,
      data: resultData
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/my-events - Organizer's events
router.get('/my-events', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const events = await Event.find({ organizerId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: 'success', data: { events } });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/organizer/stats - Detailed dashboard stats using MongoDB Aggregation Pipeline
router.get('/organizer/stats', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const organizerId = req.user._id;

    // Aggregation 1: Events and Booking Stats (total events, sold seats, capacity)
    const eventStats = await Event.aggregate([
      { $match: { organizerId: new mongoose.Types.ObjectId(organizerId) } },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          totalSeatsSold: { $sum: '$seatsSold' },
          totalCapacity: { $sum: '$totalSeats' }
        }
      }
    ]);

    // Aggregation 2: Gross revenue and discount applied
    const revenueStats = await Booking.aggregate([
      { $match: { status: 'confirmed' } },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'eventInfo'
        }
      },
      { $unwind: '$eventInfo' },
      { $match: { 'eventInfo.organizerId': new mongoose.Types.ObjectId(organizerId) } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalDiscount: { $sum: '$discountApplied' }
        }
      }
    ]);

    // Aggregation 3: Category sales count across the organizer's events
    const categoryStats = await Booking.aggregate([
      { $match: { status: 'confirmed' } },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'eventInfo'
        }
      },
      { $unwind: '$eventInfo' },
      { $match: { 'eventInfo.organizerId': new mongoose.Types.ObjectId(organizerId) } },
      {
        $group: {
          _id: '$eventInfo.category',
          ticketsSold: { $sum: { $size: '$seatIds' } },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { ticketsSold: -1 } }
    ]);

    // Aggregation 4: Vendor costs paid across the organizer's events
    const vendorStats = await Vendor.aggregate([
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'eventInfo'
        }
      },
      { $unwind: '$eventInfo' },
      { $match: { 'eventInfo.organizerId': new mongoose.Types.ObjectId(organizerId) } },
      {
        $group: {
          _id: null,
          totalVendorCost: { $sum: '$cost' },
          settledCost: {
            $sum: {
              $cond: [{ $eq: ['$status', 'settled'] }, '$cost', 0]
            }
          }
        }
      }
    ]);

    const stats = {
      totalEvents: eventStats[0]?.totalEvents || 0,
      totalSeatsSold: eventStats[0]?.totalSeatsSold || 0,
      totalCapacity: eventStats[0]?.totalCapacity || 0,
      grossRevenue: revenueStats[0]?.totalRevenue || 0,
      totalDiscount: revenueStats[0]?.totalDiscount || 0,
      vendorCost: vendorStats[0]?.totalVendorCost || 0,
      netProfit: (revenueStats[0]?.totalRevenue || 0) - (vendorStats[0]?.totalVendorCost || 0),
      categoryBreakdown: categoryStats.map(c => ({
        category: c._id,
        ticketsSold: c.ticketsSold,
        revenue: c.revenue
      }))
    };

    res.status(200).json({ status: 'success', data: { stats } });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id - Get single event
router.get('/:id', async (req, res, next) => {
  try {
    const cacheKey = `event:detail:${req.params.id}`;

    if (!global.USE_REDIS_FALLBACK) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return res.status(200).json({
            status: 'success',
            fromCache: true,
            data: { event: parsed }
          });
        }
      } catch (err) {
        console.warn('⚠️ Redis Cache Read Failed:', err.message);
      }
    }

    const event = await Event.findById(req.params.id).lean();
    if (!event) return next(new AppError('Event not found.', 404));

    if (!global.USE_REDIS_FALLBACK) {
      try {
        await redis.set(cacheKey, JSON.stringify(event), 'EX', 600);
      } catch (err) {
        console.warn('⚠️ Redis Cache Write Failed:', err.message);
      }
    }

    res.status(200).json({ status: 'success', fromCache: false, data: { event } });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id/seats - Get seat layout
router.get('/:id/seats', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return next(new AppError('Event not found.', 404));

    // Auto-release expired locks
    await Seat.updateMany(
      { eventId: req.params.id, status: 'locked', lockedUntil: { $lt: new Date() } },
      { $set: { status: 'available', lockedBy: null, lockedUntil: null } }
    );

    const seats = await Seat.find({ eventId: req.params.id }).sort({ seatNumber: 1 }).lean();
    res.status(200).json({ status: 'success', data: { seats } });
  } catch (err) {
    next(err);
  }
});

// POST /api/events - Create event (organizer only)
router.post('/', protect, restrictTo('organizer'), validateRequest(createEventSchema), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { title, description, venue, date, category, basePrice, totalSeats, seatCategories, bookingType } = req.body;

    const event = await Event.create([{
      title, description, venue,
      date: new Date(date),
      category: category || 'General',
      basePrice,
      totalSeats,
      bookingType: bookingType || 'seated',
      organizerId: req.user._id
    }], { session });

    const seatsToInsert = generateSeats(event[0]._id, totalSeats, basePrice, seatCategories, bookingType || 'seated');
    await Seat.insertMany(seatsToInsert, { session });

    await session.commitTransaction();
    session.endSession();

    await clearEventCache();

    res.status(201).json({ status: 'success', data: { event: event[0] } });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
});

// PUT /api/events/:id - Update event (organizer only)
router.put('/:id', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const allowed = ['title', 'description', 'venue', 'date', 'category', 'isActive'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) event[field] = req.body[field];
    });

    await event.save();
    await clearEventCache(event._id);

    res.status(200).json({ status: 'success', data: { event } });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id/bookings - Get bookings for an event (organizer)
router.get('/:id/bookings', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const bookings = await Booking.find({ eventId: req.params.id, status: 'confirmed' })
      .populate('userId', 'email profile')
      .lean();

    res.status(200).json({ status: 'success', data: { bookings } });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id/ai-analytics - Get predictive analytics for an event (organizer only)
router.get('/:id/ai-analytics', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const soldRatio = event.seatsSold / event.totalSeats;
    const daysLeft = Math.max(1, Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24)));
    
    const predictedAttendancePercent = Math.round(Math.min(100, Math.max(30, (soldRatio * 100) + (daysLeft * 1.5))));
    const satisfactionScore = Math.round(85 + Math.random() * 10);
    const trafficPrediction = soldRatio > 0.8 ? 'High (Sellout Warning)' : soldRatio > 0.4 ? 'Moderate' : 'Low';
    
    const recommendedPrice = Math.round(event.basePrice * (1 + (soldRatio * 0.3)));
    
    res.status(200).json({
      status: 'success',
      data: {
        eventId: event._id,
        predictions: {
          attendancePercent: predictedAttendancePercent,
          satisfactionScore,
          trafficLevel: trafficPrediction,
          velocityRating: soldRatio > 0.6 ? 'Fast Booking Curve' : 'Linear Progression'
        },
        dynamicPricingModel: {
          currentDynamicPrice: event.dynamicPrice,
          basePrice: event.basePrice,
          recommendedOptimizePrice: recommendedPrice,
          pricingStrategy: soldRatio > 0.7 ? 'Maximize Margins (+20%)' : 'Volume Pricing Promotion'
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id/vendors - List event vendors
router.get('/:id/vendors', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ eventId: req.params.id });
    res.status(200).json({ status: 'success', data: { vendors } });
  } catch (err) {
    next(err);
  }
});

// POST /api/events/:id/vendors - Add vendor contract
router.post('/:id/vendors', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const { name, category, cost } = req.body;
    if (!name || !category || !cost) {
      return next(new AppError('Vendor name, category, and cost are required.', 400));
    }
    
    const vendor = await Vendor.create({
      name,
      category,
      cost,
      eventId: req.params.id,
      status: 'pending'
    });
    
    res.status(201).json({ status: 'success', data: { vendor } });
  } catch (err) {
    next(err);
  }
});

// POST /api/events/:id/vendors/:vendorId/settle - Settle vendor logistics payout
router.post('/:id/vendors/:vendorId/settle', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ _id: req.params.vendorId, eventId: req.params.id });
    if (!vendor) return next(new AppError('Vendor contract not found.', 404));
    
    vendor.status = 'settled';
    vendor.settlementDate = new Date();
    await vendor.save();
    
    res.status(200).json({ status: 'success', message: 'Vendor logistics settlement processed successfully.', data: { vendor } });
  } catch (err) {
    next(err);
  }
});

// Live Streaming simulator metadata
let liveStreams = {}; 

// GET /api/events/:id/streaming - Get live stream info
router.get('/:id/streaming', protect, async (req, res, next) => {
  const eventId = req.params.id;
  const stream = liveStreams[eventId] || { isLive: false, streamUrl: '' };
  res.status(200).json({ status: 'success', data: { stream } });
});

// POST /api/events/:id/streaming - Start/stop stream
router.post('/:id/streaming', protect, restrictTo('organizer'), async (req, res, next) => {
  try {
    const { isLive } = req.body;
    const eventId = req.params.id;
    
    const event = await Event.findOne({ _id: eventId, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));
    
    const mockUrl = isLive ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' : '';
    liveStreams[eventId] = {
      isLive,
      streamUrl: mockUrl,
      startedAt: isLive ? new Date() : null
    };
    
    if (global.io) {
      global.io.emit('event-stream-status', { eventId, isLive, streamUrl: mockUrl });
    }
    
    res.status(200).json({ status: 'success', data: { stream: liveStreams[eventId] } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
