const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  venue: { type: String, required: true },
  date: { type: Date, required: true },
  category: { type: String, default: 'General' },
  image: { type: String,default: '' },
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
  bookingType: { type: String, enum: ['seated', 'zone'], default: 'seated' },
  showtimes: { type: [String], default: [] },
  screenName: { type: String, default: '' },
  columns: { type: String, default: '' },
  rows: { type: Number, default: 0 },
  seatCategories: {
    type: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
        totalSeats: { type: Number, default: 0 },
        count: { type: Number },
        color: { type: String }
      }
    ],
    default: []
  }
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

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('events', mongoose.model('Event', eventSchema));
