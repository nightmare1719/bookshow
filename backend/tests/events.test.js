process.env.NODE_ENV = 'test';
process.env.JWT_EXPIRES_IN = '7d';
// Force fast, deterministic in-memory mode (no Mongo/Redis connection attempts)
global.USE_IN_MEMORY_FALLBACK = true;
global.USE_REDIS_FALLBACK = true;
global.USE_TRANSACTIONS = false;

const request = require('supertest');
const app = require('../app');

describe('Events API', () => {
  jest.setTimeout(30000);

  it('lists all active seeded events with pagination metadata', async () => {
    const res = await request(app).get('/api/events');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.pages).toBe(1);
    expect(res.body.data.events.length).toBe(3);
  });

  it('paginates with limit and page', async () => {
    const res = await request(app).get('/api/events?limit=1&page=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.events.length).toBe(1);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.pages).toBe(3);
  });

  it('sanitizes invalid page/limit values instead of crashing', async () => {
    const res = await request(app).get('/api/events?page=abc&limit=-5');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.events.length).toBeGreaterThan(0);
  });

  it('caps the limit at 100', async () => {
    const res = await request(app).get('/api/events?limit=99999');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.events.length).toBeLessThanOrEqual(100);
  });

  it('filters events by category', async () => {
    const res = await request(app).get('/api/events?category=Music');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.events[0].category).toBe('Music');
  });

  it('searches events by text', async () => {
    const res = await request(app).get('/api/events?search=Sunburn');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.events[0].title).toContain('Sunburn');
  });

  it('returns 404 JSON for an unknown event id (API 404 handler runs)', async () => {
    const res = await request(app).get('/api/events/000000000000000000000000');
    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe('fail');
  });

  describe('vendor ownership', () => {
    let organizerToken;
    let otherOrganizerToken;
    let eventId;

    beforeAll(async () => {
      const orgLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'organizer@demo.com', password: 'organizer123' });
      organizerToken = orgLogin.body.token;

      const other = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'other-org@test.com',
          password: 'password123',
          role: 'organizer',
          profile: { firstName: 'Other', lastName: 'Organizer' }
        });
      otherOrganizerToken = other.body.token;

      const created = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Ownership Test Show',
          description: 'Vendor ownership verification',
          venue: 'Test Hall',
          date: new Date(Date.now() + 86400000).toISOString(),
          basePrice: 100,
          totalSeats: 50,
          columns: '10',
          rows: 5
        });
      eventId = created.body.data.event._id;
    });

    it('allows the owning organizer to create a vendor', async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/vendors`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Acme Catering', category: 'Catering', cost: 5000 });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.vendor.eventId).toBe(eventId);
    });

    it('blocks a different organizer from creating a vendor on someone else event', async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/vendors`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send({ name: 'Evil Catering', category: 'Catering', cost: 100 });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toMatch(/not found or not authorized/i);
    });

    it('blocks a different organizer from reading the vendors list', async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/vendors`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('allows the owning organizer to read the vendors list', async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/vendors`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.vendors.length).toBe(1);
    });
  });
});
