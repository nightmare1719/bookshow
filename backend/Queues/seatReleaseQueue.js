const Seat = require('../Model/SeatModel');

const pendingTimers = new Map();

const scheduleSeatRelease = (seatId, lockDurationMs = 600000) => {
  cancelSeatRelease(seatId);

  const timer = setTimeout(async () => {
    try {
      const seat = await Seat.findById(seatId);
      if (seat && seat.status === 'locked' && (!seat.lockedUntil || seat.lockedUntil <= new Date())) {
        seat.status = 'available';
        seat.lockedBy = null;
        seat.lockedUntil = null;
        await seat.save();

        if (global.io) {
          global.io.emit('seat-status-changed', {
            seatId,
            status: 'available',
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ Seat release timer error:', err.message);
    }
    pendingTimers.delete(String(seatId));
  }, lockDurationMs);

  pendingTimers.set(String(seatId), timer);
};

const cancelSeatRelease = (seatId) => {
  const timer = pendingTimers.get(String(seatId));
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(String(seatId));
  }
};

module.exports = { scheduleSeatRelease, cancelSeatRelease };
