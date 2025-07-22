const User = require("../models/userSchema");
const Cart = require("../models/cartSchema");
const Address = require("../models/addressSchema");
const Product = require("../models/productSchema");
const Order = require("../models/orderSchema");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const path = require("path");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Coupon = require("../models/couponSchema");
const Wallet = require("../models/walletSchema");
const process = require('process');

// Route: GET /check-cart
const checkCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.json({ success: false, message: 'Your cart is empty.' });
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
    coupon.usedBy.push(userId);
    await coupon.save();

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
      couponCode = req.session.couponCode || null;
      totalFinalAmount -= couponDiscount;
      totalDiscount += couponDiscount;
    }

    // Declare walletCredit/walletDebit early so they are accessible later
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

const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const order = await instance.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `order_rcptid_${Date.now()}`
    });
    res.status(200).json({
      order,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ message: "Error creating Razorpay order." });

  }
}
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body.order;
    const { orderId } = req.body;

    console.log("Verifying payment for:", {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    });

    // Generate signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature === razorpay_signature) {
      const orderDoc = await Order.findOneAndUpdate(
        { orderId: orderId },
        {
          status: 'placed',
          invoiceDate: new Date(),
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentStatus: 'paid',
          isPaid: true
        },
        { new: true }
      );

      if (!orderDoc) {
        console.log("Order not found for orderId:", orderId);
        return res.status(404).json({ message: "Order not found" });
      }

      console.log("Order verified and updated:", orderDoc);
      return res.status(200).json({ status: true });
    } else {
      console.warn("Invalid Razorpay signature");
      return res.status(400).json({ status: false, message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

const paymentConfirm = async (req, res) => {
  try {
    const { status, orderId } = req.body;

    const order = await Order.findOne({ orderId }).populate('orderedItems.product');
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (status !== "Paid") {
      // Restock products if payment failed
      for (const item of order.orderedItems) {
  const productId = item.product._id || item.product;
  const result = await Product.findByIdAndUpdate(
    productId,
    { $inc: { quantity: item.quantity } },
    { new: true }
  );
  console.log(`Restocked ${item.quantity}, new qty: ${result?.quantity}`);
}

    }

    // Update status
    order.status = status === "Paid" ? "placed" : "failed";
    order.invoiceDate = new Date();
    await order.save();

    res.status(200).json({ message: "Payment confirmed", order });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ message: "Server error confirming payment" });
  }
};


const orderSuccess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    res.render('user/orderSuccess', { orderId });
  } catch (error) {
    console.error('Error rendering order success page:', error);
    res.status(500).send('Something went wrong.');
  }
}
const orderFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    res.render('user/orderFailure', { orderId });
  } catch (error) {
    console.error('Error rendering order failure page:', error);
    res.status(500).send('Something went wrong.');

  }
}
const markOrderFailed = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).send('Order ID is required.');
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { status: 'failed' },
      { new: true }
    );
    if (!updatedOrder) {
      return res.status(404).send('Order not found.');
    };
    res.status(200).send('Order marked as failed.');
  } catch (error) {
    console.error('Error marking order as failed:', error);
    res.status(500).send('Something went wrong.');

  }
}
const retryPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.log("Retrying order for ID:", req.params.orderId);
    const order = await Order.findOne({ orderId });
    if (!order || order.status !== 'failed') {
      return res.status(404).json({ message: "Order not found or not eligible for retry." });
    };

    res.render("user/retryPayment", { order });
  } catch (error) {
    console.error('Retry Payment Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
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
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('orderedItems.product'); // Populate product details

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


const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).populate('orderedItems.product');
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    if (order.user.toString() !== req.session.user.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    // Find the specific item to cancel
    const item = order.orderedItems.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: "Item not found in order." });

    // Check order status and item status
    if (!['placed', 'shipped'].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Item cannot be canceled at this stage." });
    }

    if (item.cancelStatus === 'cancelled') {
      return res.status(400).json({ success: false, message: "Item already cancelled." });
    }

    // Restock the item
    if (item.product) {
      item.product.quantity += item.quantity;
      await item.product.save();
    }

    // Mark item as cancelled
    item.cancelStatus = 'cancelled';
    item.cancelReason = reason?.trim() || 'Cancelled by user';

    // Wallet Refund Logic (only Razorpay-paid orders)
    if (order.paymentMethod === 'razorpay' && order.isPaid) {

      // Step 1: Total item price
      const itemTotal = item.price * item.quantity;

      // Step 2: Total order value before discount (sum of all items)
      const orderTotalBeforeDiscount = order.orderedItems.reduce((sum, i) => {
        return sum + i.price * i.quantity;
      }, 0);

      // Step 3: Total coupon discount used
      const couponDiscount = order.couponDiscount || 0;
      const offer = item.product.productOffer || 0;
      const itemDiscount = (item.price* offer) /100;
      const totalDiscount = itemDiscount + couponDiscount;

      // Step 4: Calculate proportional discount share
      const itemDiscountShare = (itemTotal / orderTotalBeforeDiscount) * totalDiscount;

      // Step 5: Final refund amount
      const refundAmount = itemTotal - itemDiscountShare;

      const userId = order.user;

      // Update or create wallet
      let wallet = await Wallet.findOne({ userId });

      if (!wallet) {
        // Create new wallet if doesn't exist
        wallet = new Wallet({
          userId,
          balance: refundAmount,
          transactions: [{
            type: 'credit',
            amount: refundAmount,
            description: `Refund for cancelled item: ${item.product.productName}`,
          }]
        });
      } else {
        // Add to existing wallet
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: 'credit',
          amount: refundAmount,
          description: `Refund for cancelled item: ${item.product.productName}`,
        });
      }

      await wallet.save();
    }
    // Check if all items are cancelled or returned
    const allItemsCancelled = order.orderedItems.every(i =>
      i.cancelStatus === 'cancelled' || i.returnStatus === 'returned'
    );

    // Update order status if all items are cancelled or returned
    if (allItemsCancelled) {
      order.status = 'cancelled';
    }

    // Save changes to the order
    await order.save();

    return res.json({ success: true, message: "Item cancelled successfully." });
  } catch (error) {
    console.error("Error cancelling item:", error);
    return res.status(500).json({ success: false, message: "Server error. Please try again later." });
  }
};


const generateInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('orderedItems.product');

    if (!order || order.user.toString() !== req.session.user.toString()) {
      return res.status(403).send("Unauthorized or Order not found");
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // === Company Header ===
    doc.fontSize(18).text('INVOICE', { align: 'center' }).moveDown(0.5);
    doc.fontSize(10)
      .text('Sold By: Baeboo Private Limited')
      .text('From Address: Baeboo, Kochi')
      .text('GSTIN: 29AACCB9999Z1Z')
      .moveDown();

    // === Invoice Metadata ===
    const invoiceNumber = `BAE${Date.now()}`;
    doc.text(`Invoice Number: ${invoiceNumber}`);
    doc.text(`Order ID: ${order._id}`);
    doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    // === Customer Details ===
    doc.font('Helvetica-Bold').text('Billing Address:', { underline: true });
    doc.font('Helvetica')
      .text(order.address.name)
      .text(order.address.landMark)
      .text(`${order.address.city}, ${order.address.state} - ${order.address.pincode}`)
      .text(`Phone: ${order.address.phone}`);
    doc.moveDown();

    // === Table Column Coordinates & Widths ===
    const colWidths = {
      desc: 200,
      qty: 50,
      price: 70,
      discount: 70,
      total: 70,
    };
    const rowWidth = colWidths.desc + colWidths.qty + colWidths.price + colWidths.discount + colWidths.total;
    const tableX = 50; // left margin
    let y = doc.y + 10;
    const rowHeight = 25;

    // === Draw Header Row with Borders ===
    doc.font('Helvetica-Bold').fontSize(10);
    doc.rect(tableX, y, rowWidth, rowHeight).stroke();
    doc.text('Description', tableX + 5, y + 7, { width: colWidths.desc - 10 });
    doc.text('Qty', tableX + colWidths.desc + 5, y + 7);
    doc.text('Price', tableX + colWidths.desc + colWidths.qty + 5, y + 7);
    doc.text('Discount', tableX + colWidths.desc + colWidths.qty + colWidths.price + 5, y + 7);
    doc.text('Total', tableX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.discount + 5, y + 7);

    y += rowHeight;
    doc.font('Helvetica');

    // === Draw Table Rows ===
    order.orderedItems.forEach(item => {
      const salesPrice = item.price;
      const offer = item.product.productOffer || 0;

      const discountPerUnit = (salesPrice * offer) / 100;
      const totalDiscount = discountPerUnit * item.quantity;
      const totalPrice = salesPrice * item.quantity;
      const finalAmount = totalPrice - totalDiscount;

      doc.rect(tableX, y, rowWidth, rowHeight).stroke();

      doc.text(item.product.productName, tableX + 5, y + 7, { width: colWidths.desc - 10 });
      doc.text(item.quantity.toString(), tableX + colWidths.desc + 5, y + 7);
      doc.text(`Rs. ${salesPrice.toFixed(2)}`, tableX + colWidths.desc + colWidths.qty + 5, y + 7);
      doc.text(`- Rs. ${totalDiscount.toFixed(2)}`, tableX + colWidths.desc + colWidths.qty + colWidths.price + 5, y + 7);
      doc.text(`Rs. ${finalAmount.toFixed(2)}`, tableX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.discount + 5, y + 7);

      y += rowHeight;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    // === Calculate Totals ===
    let subtotal = 0;
    let discount = 0;
    let finalTotal = 0;

    order.orderedItems.forEach(item => {
      const salesPrice = item.price;
      const offer = item.product.productOffer || 0;

      const discountPerUnit = (salesPrice * offer) / 100;
      const itemDiscount = discountPerUnit * item.quantity;
      const itemTotalPrice = salesPrice * item.quantity;
      const itemFinalAmount = itemTotalPrice - itemDiscount;

      subtotal += itemTotalPrice;
      discount += itemDiscount;
      finalTotal += itemFinalAmount;
    });
    console.log(discount, subtotal, finalTotal);

    // === Totals Rows ===
    // Subtotal
    doc.rect(tableX, y, rowWidth, rowHeight).stroke();
    doc.text('Subtotal', tableX + 5, y + 7, { width: colWidths.desc + colWidths.qty + colWidths.price + colWidths.discount - 10, align: 'right' });
    doc.text(`Rs. ${subtotal.toFixed(2)}`, tableX + colWidths.desc + colWidths.qty + colWidths.price + colWidths.discount + 5, y + 7);
    y += rowHeight;
    // Coupon Discount row (only if applied)
    if (order.couponDiscount && order.couponDiscount > 0) {
      doc.rect(tableX, y, rowWidth, rowHeight).stroke();
      doc.text('Coupon Discount', tableX + 5, y + 7, { width: rowWidth - colWidths.total - 10, align: 'right' });
      doc.text(`- Rs. ${order.couponDiscount.toFixed(2)}`, tableX + rowWidth - colWidths.total + 5, y + 7);
      y += rowHeight;
    }

    // Delivery Charge row
    doc.rect(tableX, y, rowWidth, rowHeight).stroke();
    doc.text('Delivery Charge', tableX + 5, y + 7, { width: rowWidth - colWidths.total - 10, align: 'right' });
    doc.text(`Rs. ${order.deliveryCharge.toFixed(2)}`, tableX + rowWidth - colWidths.total + 5, y + 7);
    y += rowHeight;

    // Final Payable Total
    doc.font('Helvetica-Bold');
    doc.rect(tableX, y, rowWidth, rowHeight).stroke();
    doc.text('Final Payable', tableX + 5, y + 7, { width: rowWidth - colWidths.total - 10, align: 'right' });
    doc.text(`Rs. ${order.finalAmount.toFixed(2)}`, tableX + rowWidth - colWidths.total + 5, y + 7);
    doc.font('Helvetica');
    y += rowHeight;


    // === Signature Section ===
    doc.moveDown(2);
    doc.text('Baeboo Private Limited');

    try {
      const signaturePath = path.join(__dirname, '../public/images/signature.png');
      doc.image(signaturePath, { width: 100 });
    } catch {
      doc.text('(Signature Placeholder)');
    }

    doc.text('Authorized Signatory');

    doc.end();
  } catch (err) {
    console.error('Error generating invoice:', err);
    res.status(500).send("Failed to generate invoice");
  }
};
const returnOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId).populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('errorPage', { message: 'Order not found' });
    }

    // Optional: Restrict access to only that user
    if (order.user.toString() !== req.session.user.toString()) {
      return res.status(403).render('errorPage', { message: 'Unauthorized access to return form' });
    }

    // Optional: Prevent access if not delivered
    if (order.status !== 'delivered') {
      return res.status(400).render('errorPage', { message: 'Only delivered orders can be returned' });
    }

    res.render('user/returnForm', { order });
  } catch (error) {
    console.error('Error fetching order for return:', error);
    res.status(500).render('errorPage', { message: 'Something went wrong while loading the return form.' });
  }
};

const returnOrderRequest = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { reason, itemId } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Return reason is required.' });
    }

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required for per-item return.' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Check if the item exists in the ordered items
    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Ordered item not found.' });
    }

    // Optional: only allow return for delivered items
    if (order.status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned.' });
    }

    // Update only the selected item's return status and reason
    item.returnStatus = 'requested';
    item.returnReason = reason;

    await order.save();

    res.status(200).json({ success: true, message: 'Return request submitted successfully for the item.' });

  } catch (error) {
    console.error('Error submitting return request:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};



module.exports = {checkCart,
  getCheckoutPage, getPaymentPage, getAvailableCoupons, applyCoupon, removeCoupon, orderPlaced,
  createRazorpayOrder, verifyPayment, paymentConfirm, orderSuccess,
  orderFailure, markOrderFailed, retryPayment, getOrdersPage, getOrderDetails,
  cancelOrderItem, generateInvoice, returnOrder, returnOrderRequest
}