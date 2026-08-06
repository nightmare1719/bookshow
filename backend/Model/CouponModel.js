const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue: { type: Number, required: true },
  expirationDate: { type: Date, required: true },
  maxUses: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

couponSchema.methods.isValid = function() {
  return this.isActive && this.expirationDate > new Date() && this.usedCount < this.maxUses;
};

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('coupons', mongoose.model('Coupon', couponSchema));
