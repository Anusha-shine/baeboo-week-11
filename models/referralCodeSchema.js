const mongoose = require('mongoose');
const { Schema } = mongoose;
const referralCodeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  referralLink: {
    type: String,
    required: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedCount: {
    type: Number,
    default: 0
  },
  usageLimit: {
    type: Number,
    default: 100,
  },
  rewardAmount: {
    type: Number,
    default: 100,
  },
}, { timestamps: true });


const ReferralCode = mongoose.model('ReferralCode', referralCodeSchema);
module.exports = ReferralCode;