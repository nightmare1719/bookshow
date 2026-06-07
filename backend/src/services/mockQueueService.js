const locks = new Map();

const mockQueueService = {
  locks,
  getLockOwner: async (seatId) => {
    const lock = locks.get(String(seatId));
    if (lock && lock.expiresAt > Date.now()) {
      return lock.userId;
    }
    locks.delete(String(seatId));
    return null;
  },
  acquireLock: async (seatId, userId, durationMs = 600000) => {
    const owner = await mockQueueService.getLockOwner(seatId);
    if (owner && owner !== String(userId)) {
      return false;
    }
    locks.set(String(seatId), {
      userId: String(userId),
      expiresAt: Date.now() + durationMs,
    });
    return true;
  },
  releaseLock: async (seatId) => {
    locks.delete(String(seatId));
    return true;
  },
};

module.exports = mockQueueService;
