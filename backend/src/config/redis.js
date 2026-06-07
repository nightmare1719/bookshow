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

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
  global.USE_REDIS_FALLBACK = false;
});

redis.on('error', (err) => {
  // Gracefully log instead of crashing
  console.warn('⚠️ Redis Connection Error: ' + err.message);
  global.USE_REDIS_FALLBACK = true;
});

module.exports = { redis };
// Trigger nodemon restart comment
