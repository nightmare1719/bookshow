const express = require('express');
const { protect, restrictTo } = require('../Middleware/authMiddleware');
const validateRequest = require('../Middleware/validateRequest');
const { createEventSchema } = require('../Validators/schemas');
const {
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
} = require('../Controller/EventController');

const router = express.Router();

router.get('/', getAllEvents);
router.get('/my-events', protect, restrictTo('organizer', 'admin'), getMyEvents);
router.get('/organizer/stats', protect, restrictTo('organizer', 'admin'), getOrganizerStats);
router.get('/:id', getEventById);
router.get('/:id/seats', getEventSeats);
router.post('/', protect, restrictTo('organizer', 'admin'), validateRequest(createEventSchema), createEvent);
router.put('/:id', protect, restrictTo('organizer', 'admin'), updateEvent);
router.delete('/:id', protect, restrictTo('organizer', 'admin'), deleteEvent);
router.get('/:id/bookings', protect, restrictTo('organizer', 'admin'), getEventBookings);
router.get('/:id/ai-analytics', protect, restrictTo('organizer', 'admin'), getEventAiAnalytics);
router.get('/:id/vendors', protect, restrictTo('organizer', 'admin'), getEventVendors);
router.post('/:id/vendors', protect, restrictTo('organizer', 'admin'), createEventVendor);
router.post('/:id/vendors/:vendorId/settle', protect, restrictTo('organizer', 'admin'), settleEventVendor);
router.get('/:id/streaming', protect, getEventStreaming);
router.post('/:id/streaming', protect, restrictTo('organizer', 'admin'), toggleEventStreaming);

module.exports = router;
