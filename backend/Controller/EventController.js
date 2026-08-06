const mongoose = require('mongoose');
const Event = require('../Model/EventModel');
const Seat = require('../Model/SeatModel');
const Booking = require('../Model/BookingModel');
const Vendor = require('../Model/VendorModel');
const AppError = require('../Utils/AppError');
const { redis } = require('../Config/redis');

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

const getColumnCount = (colStr) => {
  if (!colStr) return 0;
  const clean = String(colStr).trim();
  if (clean.includes(',')) {
    return clean.split(',').map(s => s.trim()).filter(Boolean).length;
  }
  const parsed = parseInt(clean, 10);
  if (!isNaN(parsed) && parsed > 0) return parsed;
  return clean.length;
};

const generateSeats = (eventId, totalSeats, basePrice, seatCategories, bookingType, eventCategory = 'General', eventColumns = '10', eventRows = 10, showtime = '') => {
  const seats = [];
  const rows = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

  if (bookingType === 'zone') {
    if (seatCategories && seatCategories.length > 0) {
      for (const cat of seatCategories) {
        const catCount = cat.count !== undefined ? cat.count : (cat.totalSeats !== undefined ? cat.totalSeats : 0);
        for (let s = 1; s <= catCount; s++) {
          seats.push({
            eventId,
            showtime,
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
          showtime,
          seatNumber: `General-${s}`,
          category: 'General',
          status: 'available',
          price: basePrice
        });
      }
    }
  } else {
    // Seated booking type
    let colNames = [];
    const cleanCols = String(eventColumns).trim();
    if (cleanCols.includes(',')) {
      colNames = cleanCols.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const colCount = parseInt(cleanCols) || 10;
      for (let i = 1; i <= colCount; i++) colNames.push(String(i));
    }

    const rowNames = rows.slice(0, eventRows || 10);

    // Sort seat categories based on movie vs non-movie pricing rules
    let sortedCats = [];
    if (seatCategories && seatCategories.length > 0) {
      const isMovie = eventCategory.toLowerCase().includes('movie') || eventCategory.toLowerCase().includes('moive');
      if (isMovie) {
        // Movies: low amount in front, max amount in backend (Ascending order)
        sortedCats = [...seatCategories].sort((a, b) => a.price - b.price);
      } else {
        // Concerts, plays, etc.: higher amount comes first, lower amount goes back (Descending order)
        sortedCats = [...seatCategories].sort((a, b) => b.price - a.price);
      }
    } else {
      sortedCats = [{ name: 'General', price: basePrice, count: totalSeats }];
    }

    const flatCats = [];
    for (const cat of sortedCats) {
      const count = cat.count !== undefined ? cat.count : (cat.totalSeats !== undefined ? cat.totalSeats : 0);
      for (let i = 0; i < count; i++) {
        flatCats.push(cat);
      }
    }

    let seatAssignIndex = 0;
    for (let r = 0; r < rowNames.length; r++) {
      for (let c = 0; c < colNames.length; c++) {
        const cat = flatCats[seatAssignIndex] || { name: 'General', price: basePrice };
        seats.push({
          eventId,
          showtime,
          seatNumber: `${rowNames[r]}${colNames[c]}`,
          category: cat.name,
          status: 'available',
          price: cat.price
        });
        seatAssignIndex++;
      }
    }
  }
  return seats;
};

const getAllEvents = async (req, res, next) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 12;

    const cacheKey = `events:list:search:${search || ''}:cat:${category || ''}:p:${safePage}:l:${safeLimit}`;

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

    const filter = { isActive: true };
    if (search) {
      filter.$text = { $search: search };
    }
    if (category && category !== 'all') {
      filter.category = category;
    }

    const skip = (safePage - 1) * safeLimit;
    const [events, total] = await Promise.all([
      Event.find(filter).sort({ date: 1 }).skip(skip).limit(safeLimit).lean(),
      Event.countDocuments(filter)
    ]);

    const resultData = {
      events,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit)
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
};

const getMyEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ organizerId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: 'success', data: { events } });
  } catch (err) {
    next(err);
  }
};

const getOrganizerStats = async (req, res, next) => {
  try {
    const organizerId = req.user._id;

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
};

const getEventById = async (req, res, next) => {
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
};

const getEventSeats = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return next(new AppError('Event not found.', 404));

    await Seat.updateMany(
      { eventId: req.params.id, status: 'locked', lockedUntil: { $lt: new Date() } },
      { $set: { status: 'available', lockedBy: null, lockedUntil: null } }
    );

    let showtime = req.query.showtime;
    if (!showtime && event.showtimes && event.showtimes.length > 0) {
      showtime = event.showtimes[0];
    }

    let seats = [];
    if (showtime) {
      seats = await Seat.find({ eventId: req.params.id, showtime }).sort({ seatNumber: 1 }).lean();
    }

    if (seats.length === 0) {
      seats = await Seat.find({ eventId: req.params.id, $or: [{ showtime: '' }, { showtime: { $exists: false } }] }).sort({ seatNumber: 1 }).lean();
    }

    if (seats.length === 0) {
      seats = await Seat.find({ eventId: req.params.id }).sort({ seatNumber: 1 }).lean();
    }

    res.status(200).json({ status: 'success', data: { seats } });
  } catch (err) {
    next(err);
  }
};

const createEvent = async (req, res, next) => {
  const session = global.USE_TRANSACTIONS ? await mongoose.startSession() : null;
  if (session) session.startTransaction();
  try {
    const {
      title, description, venue, date, category, basePrice,
      totalSeats, seatCategories = [], bookingType = 'seated',
      image, screenName, columns, rows, showtimes = []
    } = req.body;

    let finalVenue = venue;
    let finalTotalSeats = totalSeats;
    let finalBasePrice = basePrice;

    if (finalBasePrice === undefined || finalBasePrice === null || isNaN(Number(finalBasePrice))) {
      finalBasePrice = 0;
    }

    // Defensive clamping: never allow negative geometry/prices
    finalBasePrice = Math.max(0, Number(finalBasePrice) || 0);
    const safeRows = Math.max(0, Number(rows) || 0);
    const safeColumns = String(columns || '').trim();

    if (bookingType === 'seated') {
      // Admin theater is default venue
      finalVenue = venue || req.user.theaterName || 'My Theater';
      
      const colCount = getColumnCount(safeColumns);
      const rowCount = safeRows;
      const calculatedCapacity = colCount * rowCount;

      const sumCount = (cat) => (cat.count !== undefined ? Number(cat.count) : (cat.totalSeats !== undefined ? Number(cat.totalSeats) : 0));

      // Calculate allocated seats count
      let allocatedSeats = seatCategories.reduce((sum, cat) => sum + sumCount(cat), 0);

      // If the organizer gave category prices but left seat counts blank,
      // spread the seating capacity across those priced categories so each
      // category's price is actually used instead of collapsing to a single
      // "General" zone at the cheapest price.
      const remaining = calculatedCapacity - allocatedSeats;
      const autoFillCats = seatCategories.filter((cat) => sumCount(cat) === 0 && Number(cat.price) > 0);
      if (autoFillCats.length > 0 && remaining > 0) {
        const base = Math.floor(remaining / autoFillCats.length);
        const extra = remaining % autoFillCats.length;
        autoFillCats.forEach((cat, i) => {
          const n = base + (i < extra ? 1 : 0);
          cat.count = n;
          cat.totalSeats = n;
        });
        allocatedSeats = calculatedCapacity;
      }

      if (allocatedSeats > calculatedCapacity) {
        throw new AppError(`Total configured category seats (${allocatedSeats}) exceeds the seating capacity (${calculatedCapacity}).`, 400);
      } else if (allocatedSeats < calculatedCapacity) {
        // Make balance seats as base price under category "General"
        const balance = calculatedCapacity - allocatedSeats;
        let defaultPrice = Number(finalBasePrice);
        if (defaultPrice === 0 && seatCategories.length > 0) {
          defaultPrice = Math.min(...seatCategories.map(cat => Number(cat.price) || 0));
        }
        if (defaultPrice === 0) {
          defaultPrice = 199; // sensible default fallback
        }
        
        seatCategories.push({
          name: 'General',
          price: defaultPrice,
          totalSeats: balance,
          count: balance
        });
      }
      
      finalTotalSeats = calculatedCapacity;
    } else {
      // Zone booking
      if (venue === undefined || venue === null || venue.trim() === '') {
        throw new AppError('Venue is required for zone booking.', 400);
      }
      if (seatCategories && seatCategories.length > 0) {
        const sumCount = (cat) => (cat.count !== undefined ? Number(cat.count) : (cat.totalSeats !== undefined ? Number(cat.totalSeats) : 0));
        finalTotalSeats = seatCategories.reduce((sum, cat) => sum + sumCount(cat), 0);
        finalBasePrice = Math.min(...seatCategories.map(cat => cat.price || 0));

        // Auto-fill zone capacities when only prices were provided
        if (finalTotalSeats <= 0) {
          const target = 100;
          const base = Math.floor(target / seatCategories.length);
          const extra = target % seatCategories.length;
          seatCategories.forEach((cat, i) => {
            const n = base + (i < extra ? 1 : 0);
            cat.count = n;
            cat.totalSeats = n;
          });
          finalTotalSeats = target;
        }
      }
    }

    if (!finalTotalSeats || finalTotalSeats <= 0) {
      finalTotalSeats = 100;
    }

    const colors = ['#e50914', '#e5a914', '#14e5a9', '#14a9e5', '#a914e5'];
    const formattedSeatCategories = (seatCategories || []).map((cat, idx) => ({
      name: cat.name,
      price: Number(cat.price),
      totalSeats: cat.count !== undefined ? Number(cat.count) : (cat.totalSeats !== undefined ? Number(cat.totalSeats) : 0),
      count: cat.count !== undefined ? Number(cat.count) : (cat.totalSeats !== undefined ? Number(cat.totalSeats) : 0),
      color: cat.color || colors[idx % colors.length]
    }));

    const showtimesList = showtimes && showtimes.length > 0 ? showtimes : ['06:40 PM'];

    const event = await Event.create([{
      title, description, venue: finalVenue,
      date: new Date(date),
      category: category || 'General',
      basePrice: finalBasePrice,
      totalSeats: finalTotalSeats,
      bookingType: bookingType || 'seated',
      organizerId: req.user._id,
      image: image || '',
      screenName: screenName || '',
      columns: safeColumns,
      rows: safeRows,
      seatCategories: formattedSeatCategories,
      showtimes: showtimesList,
      isActive: true
    }], session ? { session } : {});

    const seatsToInsert = [];
    for (const time of showtimesList) {
      const generated = generateSeats(
        event[0]._id,
        finalTotalSeats,
        finalBasePrice,
        formattedSeatCategories,
        bookingType || 'seated',
        category || 'General',
        safeColumns,
        safeRows,
        time
      );
      seatsToInsert.push(...generated);
    }
    await Seat.insertMany(seatsToInsert, session ? { session } : {});

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    await clearEventCache();

    res.status(201).json({ status: 'success', data: { event: event[0] } });
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    next(err);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const allowed = ['title', 'description', 'venue', 'date', 'category', 'image', 'isActive'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) event[field] = req.body[field];
    });

    await event.save();
    await clearEventCache(event._id);

    res.status(200).json({ status: 'success', data: { event } });
  } catch (err) {
    next(err);
  }
};

const getEventBookings = async (req, res, next) => {
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
};

const getEventAiAnalytics = async (req, res, next) => {
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
};

const getEventVendors = async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const vendors = await Vendor.find({ eventId: req.params.id });
    res.status(200).json({ status: 'success', data: { vendors } });
  } catch (err) {
    next(err);
  }
};

const createEventVendor = async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

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
};

const settleEventVendor = async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    const vendor = await Vendor.findOne({ _id: req.params.vendorId, eventId: req.params.id });
    if (!vendor) return next(new AppError('Vendor contract not found.', 404));
    
    vendor.status = 'settled';
    vendor.settlementDate = new Date();
    await vendor.save();
    
    res.status(200).json({ status: 'success', message: 'Vendor logistics settlement processed successfully.', data: { vendor } });
  } catch (err) {
    next(err);
  }
};

let liveStreams = {};

const getEventStreaming = async (req, res, next) => {
  const eventId = req.params.id;
  const stream = liveStreams[eventId] || { isLive: false, streamUrl: '' };
  res.status(200).json({ status: 'success', data: { stream } });
};

const toggleEventStreaming = async (req, res, next) => {
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
};

const deleteEvent = async (req, res, next) => {
  const session = global.USE_TRANSACTIONS ? await mongoose.startSession() : null;
  if (session) session.startTransaction();
  try {
    const event = await Event.findOne({ _id: req.params.id, organizerId: req.user._id });
    if (!event) return next(new AppError('Event not found or not authorized.', 404));

    await Event.deleteOne({ _id: req.params.id }, session ? { session } : {});
    await Seat.deleteMany({ eventId: req.params.id }, session ? { session } : {});

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    await clearEventCache(req.params.id);

    res.status(200).json({ status: 'success', message: 'Event deleted successfully.' });
  } catch (err) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    next(err);
  }
};

module.exports = {
  getAllEvents,
  getMyEvents,
  getOrganizerStats,
  getEventById,
  getEventSeats,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventBookings,
  getEventAiAnalytics,
  getEventVendors,
  createEventVendor,
  settleEventVendor,
  getEventStreaming,
  toggleEventStreaming
};
