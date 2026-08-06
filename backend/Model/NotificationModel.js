const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'success', 'warning'], default: 'info' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('notifications', mongoose.model('Notification', notificationSchema));
