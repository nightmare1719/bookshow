process.env.NODE_ENV = 'test';
process.env.JWT_EXPIRES_IN = '7d';
// Force fast, deterministic in-memory mode (no Mongo/Redis connection attempts)
global.USE_IN_MEMORY_FALLBACK = true;
global.USE_REDIS_FALLBACK = true;
global.USE_TRANSACTIONS = false;

const request = require('supertest');
const app = require('../app');

describe('Auth / User API', () => {
  jest.setTimeout(30000);

  it('registers a new attendee and returns a JWT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'attendee-auth@test.com',
        password: 'password123',
        role: 'attendee',
        profile: { firstName: 'Auth', lastName: 'Tester' }
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.token).toBeDefined();
    expect(res.body.data.user.email).toBe('attendee-auth@test.com');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'user@demo.com', // seeded attendee
        password: 'password123',
        role: 'attendee'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toContain('already registered');
  });

  it('rejects an invalid GST number for organizer registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'gst-org@test.com',
        password: 'password123',
        role: 'organizer',
        gstNumber: 'INVALID'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/GST/i);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@demo.com', password: 'user123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@demo.com', password: 'wrong-password' });

    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('fail');
  });

  it('returns the current user via /me with a valid token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@demo.com', password: 'user123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe('user@demo.com');
  });

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });
});
