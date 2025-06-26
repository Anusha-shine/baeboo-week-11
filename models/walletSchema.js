const mongoose = require("mongoose");


const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  balance: {
    type: Number,
    default: 0
  },
  transactions: [{
    type: { type: String }, // e.g., 'credit', 'debit'
    amount: Number,
    date: { type: Date, default: Date.now },
    description: String
  }]
});

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;