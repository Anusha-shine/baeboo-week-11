const User = require("../models/userSchema");
const Cart = require("../models/cartSchema");
const Address = require("../models/addressSchema");
const Product = require("../models/productSchema");
const Order = require("../models/orderSchema");
const mongoose = require("mongoose");
const Coupon = require("../models/couponSchema");
const Wallet = require("../models/walletSchema");

const checkCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.json({ success: false, message: 'Your cart is empty.' });
    }

    const blockedItems = [];
    for (const item of cart.items) {
      const product = await Product.findById(item.productId).lean();
      if (!product || product.isBlocked) {
        blockedItems.push(item.productId);
      }
    }

    if (blockedItems.length) {
      return res.json({
        success: false,
        message: 'Removed blocked/unavailable items from cart.',
        removed: blockedItems
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Cart check error:", err);
    res.json({ success: false, message: 'Something went wrong.' });
  }
};


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId)
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const userAddress = await Address.findOne({ userId });

    let grandTotal = 0;
    let discount = 0;
    let cartItems = [];

    if (cart && cart.items.length > 0) {
      cartItems = cart.items.map(item => {
        const product = item.productId;
        const quantity = item.quantity;
        const salesPrice = product.salesPrice;
        const offer = product.productOffer || 0;

        const discountPerUnit = (salesPrice * offer) / 100;
        const totalDiscount = discountPerUnit * quantity;
        const totalPrice = salesPrice * quantity;
        const finalAmount = totalPrice - totalDiscount;

        grandTotal += totalPrice;
        discount += totalDiscount;

        return {
          productDetails: [product], // wrapped in array for EJS
          quantity,
          totalPrice,
          discount: totalDiscount,
          finalAmount
        };
      });
    }

    // Apply coupon discount if available
    let couponDiscount = 0;
    let coupon = null;
    if (req.session.coupon) {
      couponDiscount = req.session.coupon.Discount;
      coupon = req.session.coupon;
    }
    const totalAfterCoupon = grandTotal - couponDiscount;

    res.render('user/checkout', {
      user: userData,
      product: cartItems,
      userAddress,
      grandTotal,
      discount,
      totalAfterCoupon,
      coupon,
      isCart: "true"
    });
  } catch (err) {
    console.error("Checkout load error:", err);
    res.redirect('/cart');
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isList: true,
      createdAt: { $lte: now },
      expireOn: { $gte: now }
    });

    res.json({ success: true, coupons });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

const applyCoupon = async (req, res) => {
  const userId = req.session.user;
  const { couponCode, finalAmount } = req.body;

  try {
    const coupon = await Coupon.findOne({ couponName: couponCode, isList: true });
    const now = new Date();

    if (!coupon) {
      return res.json({ success: false, message: "Invalid coupon name" });
    }

    if (now < coupon.createdAt || now > coupon.expireOn) {
      return res.json({ success: false, message: "Coupon expired or inactive" });
    }

    if (finalAmount < coupon.minimumPrice) {
      return res.json({ success: false, message: `Minimum purchase of ₹${coupon.minimumPrice} required` });
    }

    if (coupon.usedBy.includes(userId)) {
      return res.json({ success: false, message: "You have already used this coupon" });
    }

    // Mark coupon as used
    //coupon.usedBy.push(userId);
    //await coupon.save();

    // Store in session
    req.session.coupon = {
      code: coupon.couponName,
      Discount: coupon.offerPrice
    };

    return res.json({
      success: true,
      discount: coupon.offerPrice,
      newTotal: finalAmount - coupon.offerPrice,
      couponCode: coupon.couponName
    });

  } catch (error) {
    console.error("Apply coupon error:", error);
    res.status(500).json({ success: false, message: "Server error while applying coupon" });
  }
};

const removeCoupon = async (req, res) => {
  try {
    if (req.session.coupon) {
      delete req.session.coupon;
      return res.json({ success: true, message: "Coupon removed successfully" });
    }
  } catch (error) {
    console.error("Error removing coupon:", error);
    return res.status(500).json({ success: false, message: "Server error while removing coupon" });
  }
}

const getPaymentPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId)
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    let grandTotal = 0;
    let discount = 0;

    for (const item of cart.items) {
      const product = item.productId;
      const quantity = item.quantity;
      const salesPrice = product.salesPrice;
      const offer = product.productOffer || 0;

      const discountPerUnit = (salesPrice * offer) / 100;
      const totalDiscount = discountPerUnit * quantity;
      const totalPrice = salesPrice * quantity;

      grandTotal += totalPrice;
      discount += totalDiscount;
    }

    // Apply coupon discount if available
    let couponDiscount = 0;
    let coupon = null;
    if (req.session.coupon) {
      couponDiscount = req.session.coupon.Discount;
      coupon = req.session.coupon;
    }
    const totalAfterCoupon = grandTotal - couponDiscount;
    const wallet = await Wallet.findOne({ userId });
    const creditTxns = wallet?.transactions?.filter(txn => txn.type === 'credit') || [];
    const debitTxns = wallet?.transactions?.filter(txn => txn.type === 'debit') || [];

    const walletCredit = creditTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);
    const walletDebit = debitTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);

    const walletBalance = walletCredit - walletDebit;

    res.render('user/payment', {
      user: userData,
      grandTotal,
      discount,
      totalAfterCoupon,
      coupon,
      walletBalance
    });

  } catch (error) {
    console.error("Error loading payment page:", error);
    res.status(500).json({ message: "Error loading payment page." });
  }
}
const orderPlaced = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, payment } = req.body;
    const wallet = await Wallet.findOne({ userId });

    const userCart = await Cart.findOne({ userId }).populate('items.productId');
    if (!userCart || userCart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const userAddressDoc = await Address.findOne({ userId });
    const selectedAddress = userAddressDoc?.address.find(addr => addr._id.toString() === addressId);
    if (!selectedAddress) {
      return res.status(400).json({ message: "Selected address not found." });
    }

    let totalAmount = 0;
    let totalDiscount = 0;
    let totalFinalAmount = 0;
    const orderedItems = [];
    let deliveryCharge = 50;

    for (const item of userCart.items) {
      const product = await Product.findById(item.productId._id);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId._id} not found.` });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for product ${product.name}.` });
      }

      const salesPrice = product.salesPrice;
      const offer = product.productOffer || 0;

      const discountPerUnit = (salesPrice * offer) / 100;
      const totalPrice = salesPrice * item.quantity;
      const itemDiscount = discountPerUnit * item.quantity;
      const finalAmount = totalPrice - itemDiscount;

      totalAmount += totalPrice;
      totalDiscount += itemDiscount;
      totalFinalAmount += finalAmount;

      product.quantity -= item.quantity;
      await product.save();

      orderedItems.push({
        product: product._id,
        quantity: item.quantity,
        price: salesPrice,
        totalPrice,
        discount: itemDiscount,
        finalAmount: finalAmount
      });
    }

    if (totalFinalAmount > 500) {
      deliveryCharge = 0;
    }
    totalFinalAmount += deliveryCharge;

    let couponDiscount = 0;
    let couponName = null;
    let couponCode = null;

    if (req.session.coupon) {
      couponDiscount = req.session.coupon.Discount || 0;
      couponCode = req.session.coupon?.code || null;
      totalFinalAmount -= couponDiscount;
      totalDiscount += couponDiscount;

      await Coupon.updateOne(
    { couponName: couponCode },
    { $addToSet: { usedBy: userId } }
  );
  }

    let walletCredit = 0;
    let walletDebit = 0;

    if (payment === "WALLET") {
      if (!wallet || !wallet.transactions) {
        return res.status(400).json({ message: "Wallet not found or empty" });
      }

      const creditTxns = wallet.transactions.filter(txn => txn.type === 'credit');
      const debitTxns = wallet.transactions.filter(txn => txn.type === 'debit');

      walletCredit = creditTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);
      walletDebit = debitTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);

      const walletBalance = walletCredit - walletDebit;

      if (walletBalance < totalFinalAmount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      wallet.transactions.push({
        type: "debit",
        amount: totalFinalAmount,
        description: `Purchase - Order`,
        date: new Date()
      });

      await wallet.save();
    }

    const updatedWalletBalance = walletCredit - walletDebit - totalFinalAmount;

    const newOrder = new Order({
      user: userId,
      orderedItems,
      address: selectedAddress,
      totalAmount,
      discount: totalDiscount,
      finalAmount: totalFinalAmount,
      deliveryCharge,
      invoiceDate: new Date(),
      status: "placed",
      coupenApplied: !!couponCode,
      couponName,
      couponDiscount,
      coupon: req.session.coupon || null,
      paymentMethod: payment
    });

    await newOrder.save();
    await Cart.deleteOne({ userId });
    delete req.session.coupon;

    const responsePayload = {
      method: payment,
      order: newOrder
    };

    if (payment === "WALLET") {
      responsePayload.updatedWalletBalance = updatedWalletBalance;
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Order placement failed:", error);
    res.status(500).json({ message: "Order placement failed." });
  }
};
const getOrdersPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    // Convert userId to ObjectId safely
    const queryUserId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const search = req.query.search ? req.query.search.trim() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;

    // Build base filter
    const filter = { user: queryUserId };

    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { 'address.name': { $regex: search, $options: 'i' } },
        { 'orderedItems.product.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const totalOrders = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalOrders / limit);

    // Fetch orders with populated products
const searchRegex = search ? new RegExp(search, 'i') : null;

const orders = await Order.aggregate([
  { $match: { user: queryUserId } },

  // Add optional filtering by orderId, status, or address.name (customer name)
  ...(searchRegex ? [{
    $match: {
      $or: [
        { orderId: { $regex: searchRegex } },
        { status: { $regex: searchRegex } },
        { 'address.name': { $regex: searchRegex } }
      ]
    }
  }] : []),

  // Lookup product details into prodInfo
  {
    $lookup: {
      from: 'products',
      let: { ids: '$orderedItems.product' },
      pipeline: [
        { $match: { $expr: { $in: ['$_id', '$$ids'] } } },
        { $project: { productName: 1, productImage: 1 } }
      ],
      as: 'prodInfo'
    }
  },

  // Rebuild orderedItems array and embed product document
  {
    $addFields: {
      orderedItems: {
        $map: {
          input: '$orderedItems',
          as: 'item',
          in: {
            $mergeObjects: [
              '$$item',
              {
                product: {
                  $first: {
                    $filter: {
                      input: '$prodInfo',
                      as: 'p',
                      cond: { $eq: ['$$p._id', '$$item.product'] }
                    }
                  }
                }
              }
            ]
          }
        }
      }
    }
  },

  { $project: { prodInfo: 0 } },

  { $sort: { createdAt: -1 } },
  { $skip: (page - 1) * limit },
  { $limit: limit }
]);


    res.render('user/orders', {
      user: userData,
      orders,
      search,
      currentPage: page,
      totalPages
    });

  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).send("Server Error");
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    const userData = await User.findById(userId);

    const order = await Order.findOne({ orderId }).populate('orderedItems.product');

    if (!order) return res.status(404).send('Order not found');

    if (!userId || order.user.toString() !== userId.toString()) {
      return res.status(403).send('Unauthorized');
    }

    res.render('user/orderDetails', {
      order,
      user: userData
    });

  } catch (err) {
    console.error('Error in getOrderDetails:', err);
    res.status(500).send('Server error');
  }
};

module.exports = {checkCart,
  getCheckoutPage, getPaymentPage, getAvailableCoupons, applyCoupon, removeCoupon, orderPlaced,
  getOrdersPage, getOrderDetails}