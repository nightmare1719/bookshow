const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  seatNumber: { type: String, required: true },
  showtime: { type: String, default: '' },
  category: { type: String, default: 'General' },
  status: {
    type: String,
    enum: ['available', 'locked', 'booked'],
    default: 'available'
  },
  price: { type: Number, required: true, min: 0 },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lockedUntil: { type: Date, default: null }
}, { timestamps: true });

seatSchema.index({ eventId: 1, showtime: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ eventId: 1, status: 1 });

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('seats', mongoose.model('Seat', seatSchema));
