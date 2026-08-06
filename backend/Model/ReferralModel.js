const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referredId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rewardAmount: { type: Number, default: 50 },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
}, { timestamps: true });

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('referrals', mongoose.model('Referral', referralSchema));
