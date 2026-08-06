const Redis = require('ioredis');

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379;

const redis = new Redis({
  host: redisHost,
  port: parseInt(redisPort),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: false, // Immediately throw errors if Redis is down, instead of queuing/hanging commands
  // Prevent crash if Redis is unavailable
  retryStrategy(times) {
    if (process.env.NODE_ENV === 'test') {
      return null; // Stop retrying immediately in test environments to trigger fallback
    }
    // Keep trying to reconnect every 2s in development/production
    return Math.min(times * 100, 2000);
  }
});

let errorLogged = false;

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
  global.USE_REDIS_FALLBACK = false;
  errorLogged = false;
});

redis.on('error', (err) => {
  global.USE_REDIS_FALLBACK = true;
  if (!errorLogged) {
    console.warn('⚠️ Redis Connection Error: ' + err.message + ' (using in-memory fallback)');
    errorLogged = true;
  }
});

module.exports = { redis };
