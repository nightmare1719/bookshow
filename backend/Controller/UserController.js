const jwt = require('jsonwebtoken');
const User = require('../Model/UserModel');
const Notification = require('../Model/NotificationModel');
const Referral = require('../Model/ReferralModel');
const AppError = require('../Utils/AppError');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '2d'
});

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.cookie('jwt', token, {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  // Sanitize a copy so the stored document is never mutated
  const userData = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete userData.password;
  res.status(statusCode).json({ status: 'success', token, data: { user: userData } });
};

const registerUser = async (req, res, next) => {
  try {
    const { email, password, role, profile, theaterName, gstNumber, referralCode } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return next(new AppError('Email already registered.', 400));

    if (role === 'admin' || role === 'organizer') {
      if (gstNumber) {
        const digitsCount = (gstNumber.match(/\d/g) || []).length;
        const lettersCount = (gstNumber.match(/[a-zA-Z]/g) || []).length;
        if (gstNumber.length !== 15 || digitsCount !== 12 || lettersCount !== 3) {
          return next(new AppError('GST number must be exactly 15 characters, containing 12 digits and 3 letters.', 400));
        }
      }
    }

    const user = await User.create({
      email,
      password,
      role: role || 'attendee',
      profile,
      theaterName: (role === 'admin' || role === 'organizer') ? theaterName : '',
      gstNumber: (role === 'admin' || role === 'organizer') ? gstNumber : ''
    });

    if (referralCode) {
      try {
        const cleanCode = referralCode.trim().toUpperCase();
        if (cleanCode.startsWith('REF-')) {
          const suffix = cleanCode.replace('REF-', '');
          const users = await User.find({});
          const referrer = users.find(u => u._id.toString().substring(18).toUpperCase() === suffix);
          if (referrer && referrer._id.toString() !== user._id.toString()) {
            await Referral.create({
              referrerId: referrer._id,
              referredId: user._id,
              rewardAmount: 50,
              status: 'pending'
            });
          }
        }
      } catch (refErr) {
        console.warn('⚠️ Automatic Referral Failed:', refErr.message);
      }
    }

    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

const loginUser = async (req, res, next) => {
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
};

const getMe = (req, res) => {
  res.status(200).json({ status: 'success', data: { user: req.user } });
};

const logoutUser = (req, res) => {
  res.cookie('jwt', 'loggedout', { expires: new Date(Date.now() + 1000), httpOnly: true });
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
};

const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ status: 'success', data: { notifications } });
  } catch (err) {
    next(err);
  }
};

const markNotificationRead = async (req, res, next) => {
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
};

const clearNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    res.status(200).json({ status: 'success', message: 'Notifications cleared.' });
  } catch (err) {
    next(err);
  }
};

const broadcastNotification = async (req, res, next) => {
  try {
    const { title, message, type = 'info' } = req.body;
    if (!title || !message) {
      return next(new AppError('Title and message are required.', 400));
    }

    const users = await User.find({});
    const notifications = users.map(user => ({
      userId: user._id,
      title,
      message,
      type
    }));

    await Notification.insertMany(notifications);

    if (global.io) {
      global.io.emit('broadcast-notification', { title, message, type });
    }

    res.status(200).json({ status: 'success', message: 'Ad broadcasted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  getNotifications,
  markNotificationRead,
  clearNotifications,
  broadcastNotification
};
