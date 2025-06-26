const Wallet = require("../models/walletSchema");

const viewWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 7;
    const skip = (page - 1) * limit;

    const wallet = await Wallet.findOne({ userId });
    const allTxns = wallet?.transactions || [];

    // Filter only credit transactions
    const creditTxns = allTxns.filter(txn => txn.type === 'credit');

    // Debug log
    console.log("Credit Transactions for wallet:", creditTxns);
    creditTxns.forEach((txn, i) =>
      console.log(`Txn #${i}: type=${txn.type}, amount=${txn.amount}, desc=${txn.description}`)
    );

    // Only sum credit transactions
    const finalAmount = creditTxns.reduce((sum, txn) => {
      const amt = Number(txn.amount) || 0;
      return sum + amt;
    }, 0);

    console.log('Computed finalAmount:', finalAmount);

    // Paginate only credit transactions
    const totalTransactions = creditTxns.length;
    const transactions = creditTxns
      .sort((a, b) => b.date - a.date)
      .slice(skip, skip + limit);
    const totalPages = Math.ceil(totalTransactions / limit);

    res.render('user/wallet', {
      finalAmount,
      transactions,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error('Error fetching wallet:', err);
    res.status(500).send('Server Error');
  }
};

module.exports = { viewWallet };






module.exports = { viewWallet }