const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  seatIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seat' }],
  seatNumbers: [{ type: String }],
  totalAmount: { type: Number, required: true, min: 0 },
  transactionId: { type: String, unique: true, sparse: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['mock', 'wallet', 'razorpay'],
    default: 'mock'
  },
  qrCode: { type: String, default: '' },
  couponCode: { type: String, default: null },
  discountApplied: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
