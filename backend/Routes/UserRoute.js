const express = require('express');
const { protect, restrictTo } = require('../Middleware/authMiddleware');
const {
  getNotifications,
  markNotificationRead,
  clearNotifications,
  broadcastNotification
} = require('../Controller/UserController');

const router = express.Router();

router.get('/notifications', protect, getNotifications);
router.patch('/notifications/:id/read', protect, markNotificationRead);
router.post('/notifications/clear', protect, clearNotifications);
router.post('/notifications/broadcast', protect, restrictTo('admin'), broadcastNotification);

module.exports = router;
