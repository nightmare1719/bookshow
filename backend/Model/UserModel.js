const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['attendee', 'organizer', 'admin'],
    default: 'attendee'
  },
  profile: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  theaterName: {
    type: String,
    default: ''
  },
  gstNumber: {
    type: String,
    default: ''
  },
  walletBalance: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const createDualModel = require('../Utils/dualModel');

module.exports = createDualModel('users', mongoose.model('User', userSchema));
