const Order = require("../models/orderSchema");
const Wallet = require("../models/walletSchema");

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

      // Total item price
      const itemTotal = item.price * item.quantity;

      // Total order value before discount (sum of all items)
      const orderTotalBeforeDiscount = order.orderedItems.reduce((sum, i) => {
        return sum + i.price * i.quantity;
      }, 0);

      // Total coupon discount used
      const couponDiscount = order.couponDiscount || 0;
      const offer = item.product.productOffer || 0;
      const itemDiscount = ((item.price * offer) / 100) * item.quantity;
      const totalDiscount = itemDiscount + couponDiscount;

      // Calculate proportional discount share
      const itemDiscountShare = (itemTotal / orderTotalBeforeDiscount) * totalDiscount;

      // Final refund amount
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

const returnOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findById(orderId).populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('errorPage', { message: 'Order not found' });
    }

    // Restrict access to only that user
    if (order.user.toString() !== req.session.user.toString()) {
      return res.status(403).render('errorPage', { message: 'Unauthorized access to return form' });
    }

    // Prevent access if not delivered
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

module.exports = {
  cancelOrderItem,returnOrder,returnOrderRequest}