const { Queue, Worker } = require('bullmq');
const { redis } = require('../Config/redis');
const Seat = require('../Model/SeatModel');

let bookingQueue = null;
let worker = null;

try {
  bookingQueue = new Queue('bookingQueue', { connection: redis });

  worker = new Worker(
    'bookingQueue',
    async (job) => {
      if (job.name === 'release-lock') {
        const { seatId } = job.data;
        const seat = await Seat.findById(seatId);
        if (seat && seat.status === 'locked' && (!seat.lockedUntil || seat.lockedUntil <= new Date())) {
          seat.status = 'available';
          seat.lockedBy = null;
          seat.lockedUntil = null;
          await seat.save();

          // Real-time broadcast lock expiration via Socket.io
          if (global.io) {
            global.io.emit('seat-status-changed', {
              seatId,
              status: 'available',
            });
          }
        }
      }
    },
    { connection: redis }
  );

  worker.on('error', (err) => {
    console.warn('⚠️ BullMQ Worker Error: ' + err.message);
  });
} catch (err) {
  console.warn('⚠️ BullMQ is offline (falling back to dynamic interval checks): ' + err.message);
}

module.exports = { bookingQueue };
