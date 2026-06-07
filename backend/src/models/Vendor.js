const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, enum: ['Catering', 'Security', 'Sound & Lights', 'Production', 'Logistics'] },
  cost: { type: Number, required: true, min: 0 },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  status: { type: String, enum: ['pending', 'settled'], default: 'pending' },
  settlementDate: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
