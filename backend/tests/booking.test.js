process.env.NODE_ENV = 'test';
require('dotenv').config();

const originalUri = process.env.MONGODB_URI;
if (originalUri && originalUri.includes('mongodb+srv://')) {
  process.env.MONGODB_URI = originalUri.replace(/\/bookshow(?:\?|$)/, '/bookshow_test?');
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ai_event_platform_test';
}

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Event = require('../src/models/Event');
const Seat = require('../src/models/Seat');
const Booking = require('../src/models/Booking');
const { redis } = require('../src/config/redis');
const mockDbService = require('../src/services/mockDbService');
const mockQueueService = require('../src/services/mockQueueService');

describe('AI Ticket Booking Engine Integration Tests', () => {
  jest.setTimeout(60000);
  let attendeeToken;
  let attendeeId;
  let organizerToken;
  let eventId;
  let seatId;

  // DB wrappers to check fallback state
  const getSeat = async (id) => {
    if (global.USE_IN_MEMORY_FALLBACK) {
      return mockDbService.seats.findById(id);
    }
    return Seat.findById(id);
  };

  const getEvent = async (id) => {
    if (global.USE_IN_MEMORY_FALLBACK) {
      return mockDbService.events.findById(id);
    }
    return Event.findById(id);
  };

  const getRedisLock = async (id) => {
    if (global.USE_REDIS_FALLBACK) {
      return mockQueueService.getLockOwner(id);
    }
    return redis.get(`lock:seat:${id}`);
  };

  beforeAll(async () => {
    // 1. Safe Mongoose Connect
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_event_platform_test', {
          serverSelectionTimeoutMS: 1500,
          connectTimeoutMS: 1500
        });
      }
      // Clean Mongoose collections
      await User.deleteMany({});
      await Event.deleteMany({});
      await Seat.deleteMany({});
      await Booking.deleteMany({});
    } catch (err) {
      console.warn('⚠️ MongoDB is unreachable in tests. Activating Resilient In-Memory Fallback.');
      global.USE_IN_MEMORY_FALLBACK = true;
    }

    // 2. Safe Redis connection
    try {
      if (!global.USE_REDIS_FALLBACK && redis && typeof redis.ping === 'function') {
        await redis.ping();
        await redis.flushall();
      } else {
        global.USE_REDIS_FALLBACK = true;
      }
    } catch (err) {
      console.warn('⚠️ Redis is unreachable in tests. Activating In-Memory lock manager.');
      global.USE_REDIS_FALLBACK = true;
    }

    // 3. Register Organizer User
    const orgRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'organizer@test.com',
        password: 'password123',
        role: 'organizer',
        profile: { firstName: 'Event', lastName: 'Organizer' }
      });
    organizerToken = orgRes.body.token;

    // 4. Create Event
    const eventRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'High Concurrency Tech Summit',
        description: 'Scale systems dynamically',
        venue: 'Silicon Valley Hall',
        date: new Date(Date.now() + 86400000).toISOString(),
        basePrice: 100,
        totalSeats: 20,
        demandFactor: 0.5
      });
    eventId = eventRes.body.data.event._id;

    // Fetch pre-generated seat
    let seat;
    if (global.USE_IN_MEMORY_FALLBACK) {
      const seats = await mockDbService.seats.find({ eventId });
      seat = seats[0];
    } else {
      seat = await Seat.findOne({ eventId });
    }
    seatId = seat._id.toString();

    // 5. Register Attendee User
    const attRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'attendee@test.com',
        password: 'password123',
        role: 'attendee',
        profile: { firstName: 'Smart', lastName: 'Attendee' }
      });
    attendeeToken = attRes.body.token;
    attendeeId = attRes.body.data.user._id;

    // Credit attendee virtual wallet
    await request(app)
      .post('/api/bookings/deposit-wallet')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({ amount: 500 });
  });

  afterAll(async () => {
    try {
      if (!global.USE_IN_MEMORY_FALLBACK) {
        await User.deleteMany({});
        await Event.deleteMany({});
        await Seat.deleteMany({});
        await Booking.deleteMany({});
      }
      if (!global.USE_REDIS_FALLBACK && redis) {
        await redis.flushall();
        await redis.quit();
      }
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    } catch (err) {
      // Graceful ignore cleanup failures
    }
  });

  describe('Distributed Locking Suite', () => {
    it('should successfully lock an available seat for 10 minutes', async () => {
      const res = await request(app)
        .post('/api/seats/lock')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ seatId });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('locked');

      // Verify seat locked state in DB
      const seat = await getSeat(seatId);
      expect(seat.status).toBe('locked');
      expect(seat.lockedBy.toString()).toBe(attendeeId);

      // Verify lock state in Redis / Lock Manager
      const lockOwner = await getRedisLock(seatId);
      expect(lockOwner).toBe(attendeeId);
    });

    it('should prevent double-locking (race conditions) by throwing a 409 Conflict', async () => {
      // Register rival booker
      const secondAttRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'competitor@test.com',
          password: 'password123',
          role: 'attendee',
          profile: { firstName: 'Rival', lastName: 'Booker' }
        });
      const rivalToken = secondAttRes.body.token;

      // Request lock on same seat
      const res = await request(app)
        .post('/api/seats/lock')
        .set('Authorization', `Bearer ${rivalToken}`)
        .send({ seatId });

      expect(res.statusCode).toBe(409);
      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('already locked');
    });
  });

  describe('Transactional Booking Suite', () => {
    it('should successfully book the locked seat using wallet balance in MongoDB Transaction', async () => {
      const res = await request(app)
        .post('/api/bookings/complete')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId,
          seatIds: [seatId],
          paymentMethod: 'wallet'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.booking.status).toBe('confirmed');
      expect(res.body.data.booking.qrCode).toBeDefined();

      // Verify seat status updated to booked
      const seat = await getSeat(seatId);
      expect(seat.status).toBe('booked');
      expect(seat.lockedBy).toBeNull();

      // Verify Redis lock evicted
      const lockOwner = await getRedisLock(seatId);
      expect(lockOwner).toBeNull();

      // Verify Event pricing updated (seatsSold went from 0 to 1, changing ratio)
      const event = await getEvent(eventId);
      expect(event.seatsSold).toBe(1);
      expect(event.dynamicPrice).toBeGreaterThanOrEqual(event.basePrice);
    });
  });
});
