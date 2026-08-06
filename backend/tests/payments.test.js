process.env.NODE_ENV = 'test';
process.env.JWT_EXPIRES_IN = '7d';
// Force fast, deterministic in-memory mode (no Mongo/Redis connection attempts)
global.USE_IN_MEMORY_FALLBACK = true;
global.USE_REDIS_FALLBACK = true;
global.USE_TRANSACTIONS = false;

const request = require('supertest');
const app = require('../app');

describe('Payments / Coupons / Referrals API', () => {
  jest.setTimeout(30000);
  let attendeeToken;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@demo.com', password: 'user123' });
    attendeeToken = login.body.token;
  });

  describe('coupons', () => {
    it('validates the seeded DEMO20 coupon', async () => {
      const res = await request(app)
        .post('/api/bookings/coupons/validate')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ code: 'DEMO20' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.code).toBe('DEMO20');
      expect(res.body.data.discountType).toBe('percentage');
      expect(res.body.data.discountValue).toBe(20);
    });

    it('rejects an unknown coupon', async () => {
      const res = await request(app)
        .post('/api/bookings/coupons/validate')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ code: 'NOPE99' });

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('fail');
    });
  });

  describe('wallet deposits', () => {
    it('credits the wallet and returns the new balance', async () => {
      const res = await request(app)
        .post('/api/bookings/deposit-wallet')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ amount: 100 });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.walletBalance).toBe(2100); // seed 2000 + 100
    });

    it('rejects a non-positive deposit amount', async () => {
      const res = await request(app)
        .post('/api/bookings/deposit-wallet')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ amount: 0 });

      expect(res.statusCode).toBe(400);
    });

    it('returns a mock Razorpay deposit order in fallback mode', async () => {
      const res = await request(app)
        .post('/api/bookings/deposit-wallet/order')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ amount: 250 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.orderId).toMatch(/^order_mock_deposit_/);
      expect(res.body.data.amount).toBe(25000);
    });
  });

  describe('referrals', () => {
    let newAttendeeToken;

    beforeAll(async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'referred-user@test.com',
          password: 'password123',
          role: 'attendee',
          profile: { firstName: 'Referred', lastName: 'User' }
        });
      newAttendeeToken = reg.body.token;
    });

    it('returns a referral code for a user', async () => {
      const res = await request(app)
        .get('/api/bookings/referral/code')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.referralCode).toMatch(/^REF-/);
    });

    it('rejects applying your own referral code', async () => {
      const codeRes = await request(app)
        .get('/api/bookings/referral/code')
        .set('Authorization', `Bearer ${attendeeToken}`);
      const code = codeRes.body.data.referralCode;

      const res = await request(app)
        .post('/api/bookings/referral/apply')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({ code });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/refer yourself/i);
    });

    it('applies a valid referral code for a new user', async () => {
      const codeRes = await request(app)
        .get('/api/bookings/referral/code')
        .set('Authorization', `Bearer ${attendeeToken}`);
      const code = codeRes.body.data.referralCode;

      const res = await request(app)
        .post('/api/bookings/referral/apply')
        .set('Authorization', `Bearer ${newAttendeeToken}`)
        .send({ code });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
    });

    it('rejects applying a referral code twice', async () => {
      const codeRes = await request(app)
        .get('/api/bookings/referral/code')
        .set('Authorization', `Bearer ${attendeeToken}`);
      const code = codeRes.body.data.referralCode;

      const res = await request(app)
        .post('/api/bookings/referral/apply')
        .set('Authorization', `Bearer ${newAttendeeToken}`)
        .send({ code });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/already applied/i);
    });
  });
});
