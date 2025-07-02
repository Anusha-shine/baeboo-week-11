const Order = require('../models/orderSchema');

exports.getFilteredOrders = async (match, pageQuery) => {
  const page = parseInt(pageQuery) || 1;
  const limit = 6;
  const skip = (page - 1) * limit;

  const totalOrders = await Order.countDocuments(match);

  const orders = await Order.find(match)
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return { orders, totalOrders, page, limit };
};