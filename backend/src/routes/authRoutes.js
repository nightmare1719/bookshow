const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const { protect } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { registerSchema, loginSchema } = require('../validators/schemas');

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '7d'
});

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.cookie('jwt', token, {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  user.password = undefined;
  res.status(statusCode).json({ status: 'success', token, data: { user } });
};

// POST /api/auth/register
router.post('/register', validateRequest(registerSchema), async (req, res, next) => {
  try {
    const { email, password, role, profile } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return next(new AppError('Email already registered.', 400));

    const user = await User.create({ email, password, role: role || 'attendee', profile });
    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Invalid email or password.', 401));
    }
    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.status(200).json({ status: 'success', data: { user: req.user } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('jwt', 'loggedout', { expires: new Date(Date.now() + 1000), httpOnly: true });
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

// GET /api/auth/notifications - Get all user notifications
router.get('/notifications', protect, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ status: 'success', data: { notifications } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/notifications/:id/read - Mark notification as read
router.patch('/notifications/:id/read', protect, async (req, res, next) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notif) return next(new AppError('Notification not found.', 404));
    res.status(200).json({ status: 'success', data: { notification: notif } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/notifications/clear - Delete all read notifications
router.post('/notifications/clear', protect, async (req, res, next) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    res.status(200).json({ status: 'success', message: 'Notifications cleared.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
