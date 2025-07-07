const Wallet = require("../models/walletSchema");
const User = require("../models/userSchema");

const viewWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const page = parseInt(req.query.page) || 1;
    const limit = 7;
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ userId });
    const allTxns = wallet?.transactions || [];

    // Calculate wallet balance: total credits - total debits
    const creditTotal = allTxns
      .filter(txn => txn.type === 'credit')
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    const debitTotal = allTxns
      .filter(txn => txn.type === 'debit')
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    const finalAmount = creditTotal - debitTotal;

    // Sort all transactions and paginate
    const sortedTxns = [...allTxns].sort((a, b) => b.date - a.date);
    const paginatedTxns = sortedTxns.slice(skip, skip + limit);
    const totalPages = Math.ceil(allTxns.length / limit);

    res.render('user/wallet', {
      finalAmount: finalAmount.toFixed(2),
      transactions: paginatedTxns,
      currentPage: page,
      totalPages,
      user: userData
    });
  } catch (err) {
    console.error('Error fetching wallet:', err);
    res.status(500).send('Server Error');
  }
};






module.exports = { viewWallet }