const Order = require("../models/orderSchema");
const process = require('process');
const Razorpay = require('razorpay');
const crypto = require('crypto');

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

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: orderId },
      {
        $set: {
          status: status === "Paid" ? "placed" : "failed", // Status from Razorpay
          invoiceDate: new Date()
        }
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({ message: "Payment confirmed", order: updatedOrder });
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

module.exports = {createRazorpayOrder, verifyPayment, paymentConfirm, orderSuccess, 
    orderFailure, markOrderFailed, retryPayment};