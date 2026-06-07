const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  venue: { type: String, required: true },
  date: { type: Date, required: true },
  category: { type: String, default: 'General' },
  image: { type: String, default: '' },
  basePrice: { type: Number, required: true, min: 0 },
  totalSeats: { type: Number, required: true, min: 1 },
  seatsSold: { type: Number, default: 0 },
  demandFactor: { type: Number, default: 0 },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: { type: Boolean, default: true },
  bookingType: { type: String, enum: ['seated', 'zone'], default: 'seated' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

eventSchema.virtual('dynamicPrice').get(function() {
  const demandFactor = this.demandFactor || 0;
  return this.basePrice * (1 + (this.seatsSold / this.totalSeats) * demandFactor);
});

eventSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Event', eventSchema);
