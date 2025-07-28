const Order = require("../models/orderSchema");
const Product = require("../models/productSchema");
const Wallet = require("../models/walletSchema");

const listOrders = async (req, res) => {
  try {
    const perPage = 6;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search ? req.query.search.trim() : '';

    // Build the match filter for search
    const match = {status: {$in:["placed","delivered","returned","cancelled","out for delivery","return requested"]}};

    if (search) {
      match.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
        { 'user.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Aggregation pipeline to get orders with user info, filtered, sorted, paginated
const pipeline = [
  {
    $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'user'
    }
  },
  { $unwind: '$user' },
  { $match: match },

  // Step 1: Compute returnRequested BEFORE unwinding
  {
    $addFields: {
      returnRequested: {
        $gt: [
          {
            $size: {
              $filter: {
                input: "$orderedItems",
                as: "item",
                cond: { $eq: ["$$item.returnStatus", "requested"] }
              }
            }
          },
          0
        ]
      }
    }
  },

  // Optional: Still unwind for other calculations (discount etc.)
  { $unwind: { path: '$orderedItems', preserveNullAndEmptyArrays: true } },

  // Group by order ID
  {
    $group: {
      _id: '$_id',
      orderId: { $first: '$orderId' },
      user: { $first: '$user' },
      createdAt: { $first: '$createdAt' },
      status: { $first: '$status' },
      returnRequested: { $first: '$returnRequested' }, // include here!
      totalAmount: { $first: '$totalAmount' },
      deliveryCharge: { $first: '$deliveryCharge' },
      couponDiscount: { $first: '$couponDiscount' },
      discount: { $sum: '$orderedItems.discount' },
      coupon: { $first: '$couponCode' }
    }
  },

  // Ensure numeric fields
  {
    $addFields: {
      totalAmount: { $toDouble: { $ifNull: ['$totalAmount', 0] } },
      couponDiscount: { $toDouble: { $ifNull: ['$couponDiscount', 0] } },
      deliveryCharge: { $toDouble: { $ifNull: ['$deliveryCharge', 0] } },
      discount: { $toDouble: { $ifNull: ['$discount', 0] } }
    }
  },

  // Conditionally apply delivery charge
  {
    $addFields: {
      effectiveDeliveryCharge: {
        $cond: {
          if: { $lt: ['$totalAmount', 500] },
          then: '$deliveryCharge',
          else: 0
        }
      }
    }
  },

  // Final price calculation
  {
    $addFields: {
      finalAmount: {
        $subtract: [
          { $add: ['$totalAmount', '$effectiveDeliveryCharge'] },
          { $add: ['$discount', '$couponDiscount'] }
        ]
      }
    }
  },

  // Pagination
  { $sort: { createdAt: -1 } },
  { $skip: perPage * (page - 1) },
  { $limit: perPage },

  // Final projection
  {
    $project: {
      orderId: 1,
      createdAt: 1,
      status: 1,
      returnRequested: 1,
      totalAmount: 1,
      discount: 1,
      couponDiscount: 1,
      deliveryCharge: 1,
      effectiveDeliveryCharge: 1,
      finalAmount: 1,
      'user.name': 1,
      'user.email': 1,
      'user.phone': 1,
      coupon: 1
    }
  }
];

    const orders = await Order.aggregate(pipeline);

    // Count total matching documents for pagination
    const countPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $match: match },
      { $count: 'total' }
    ];

    const countResult = await Order.aggregate(countPipeline);
    const totalOrders = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalOrders / perPage);

    res.render('admin/adminOrders', {
      orders,
      currentPage: page,
      totalPages,
      search
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).send('Server Error');
  }
};
const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .populate('orderedItems.product')
      .populate('address')
      .populate('user', 'name email phone'); // optionally include user info

    if (!order) {
      return res.status(404).send('Order not found');
    }
    res.render('admin/orderDetails', { order });
  } catch (err) {
    console.log('Error fetching order details:', err);
    res.status(500).send('Server error');
  }
};
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status: newStatus } = req.body;

    const validStatuses = ['pending', 'shipped', 'out for delivery', 'delivered', 'cancelled'];

    if (!validStatuses.includes(newStatus)) {
      return res.status(400).send('Invalid status value');
    }

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).send('Order not found');

    const currentIndex = validStatuses.indexOf(order.status);
    const newIndex = validStatuses.indexOf(newStatus);

    //  Allow only forward progression or cancelation (if needed)
    const isForward = newIndex > currentIndex;
    const isCancelAllowed = newStatus === 'cancelled' && order.status !== 'delivered';

    if (!isForward && !isCancelAllowed) {
      return res.status(400).send('Invalid status transition');
    }

    order.status = newStatus;
    await order.save();

    res.redirect(`/admin/order/${orderId}`);
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).send('Server error');
  }
};

const approveReturnItem = async (req, res) => {
  try {
    const { orderId, itemIndex } = req.params;
    const order = await Order.findById(orderId).populate('orderedItems.product');
    if (!order) return res.status(404).send('Order not found');

    const item = order.orderedItems[itemIndex];
    if (!item) return res.status(404).send('Item not found');

    // Make sure the item is actually requested for return
    if (item.returnStatus !== 'requested') {
      return res.status(400).send('Return not requested or already processed for this item');
    }

    // Update product stock for this item
    const product = await Product.findById(item.product._id);
    if (product) {
      product.quantity += item.quantity;
      await product.save();
    }

    // Update item return status
    item.returnStatus = 'approved';

    const allProcessed = order.orderedItems.every(
      (i) => i.returnStatus === 'approved' || i.returnStatus === 'rejected' || !i.returnStatus
    );
    if (allProcessed) {
      order.returnStatus = 'completed'; 
      order.status = 'returned';
    }

    await order.save();

    // Refund wallet for only this item
    let wallet = await Wallet.findOne({ userId: order.user });
    if (!wallet) {
      wallet = new Wallet({
        userId: order.user,
        balance: 0,
        transactions: []
      });
    }

    // Total price for the returned item
const itemTotal = item.price * item.quantity;

//  Total order value before discount
const orderTotalBeforeDiscount = order.orderedItems.reduce((sum, i) => {
  return sum + i.price * i.quantity;
}, 0);

//  Coupon discount (stored during order placement)
const couponDiscount = order.couponDiscount || 0;

//  Calculate proportional share of discount
const itemDiscountShare = (itemTotal / orderTotalBeforeDiscount) * couponDiscount;

// Final refund amount (rounded to 2 decimals)
const refundAmount = Math.round((itemTotal - itemDiscountShare) * 100) / 100;

    wallet.transactions.push({
      type: 'credit',
      amount: refundAmount,
      description: `Refund for returned item ${item.product.productName} in order ${order.orderId}`
    });

    wallet.balance += refundAmount;
    await wallet.save();

    res.redirect('/admin/adminOrders');
  } catch (err) {
    console.error('Error approving return item:', err);
    res.status(500).send('Internal Server Error');
  }
};
const rejectReturnItem = async (req, res) => {
  try {
    const { orderId, itemIndex } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    const item = order.orderedItems[itemIndex];
    if (!item) return res.status(404).send('Item not found');

    if (item.returnStatus !== 'requested') {
      return res.status(400).send('Return not requested or already processed for this item');
    }

    item.returnStatus = 'rejected';

    // Optionally update overall order returnStatus as above
    const allProcessed = order.orderedItems.every(
      (i) => i.returnStatus === 'approved' || i.returnStatus === 'rejected' || !i.returnStatus
    );
    if (allProcessed) {
      order.returnStatus = 'completed'; // or 'rejected' if you want
    }

    await order.save();

    res.redirect('/admin/adminOrders');
  } catch (err) {
    console.error('Error rejecting return item:', err);
    res.status(500).send('Internal Server Error');
  }
};


module.exports = { listOrders, getOrderDetails, updateOrderStatus, approveReturnItem, rejectReturnItem };