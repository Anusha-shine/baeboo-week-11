const Order = require('../models/orderSchema');

exports.getFilteredOrders = async (queryParams) => {
  const { filter, fromDate, toDate } = queryParams;

  const now = new Date();
  let match = {};

  if (filter === 'daily') {
    const start = new Date(now.setHours(0, 0, 0, 0));
    const end = new Date(now.setHours(23, 59, 59, 999));
    match.createdAt = { $gte: start, $lte: end };
  } else if (filter === 'weekly') {
    const start = new Date();
    start.setDate(now.getDate() - 7);
    match.createdAt = { $gte: start, $lte: new Date() };
  } else if (filter === 'monthly') {
    const start = new Date();
    start.setMonth(now.getMonth() - 1);
    match.createdAt = { $gte: start, $lte: new Date() };
  } else if (fromDate && toDate) {
    match.createdAt = {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    };
  }

  match.status = { $in: ['delivered','placed','shipped','cancelled','return_approved'] };

  //pagination
  const page = parseInt(queryParams.page) || 1;
  const limit = 6;
  const skip = (page - 1) * limit;
  const totalOrders = await Order.countDocuments(match);

  const orders = await Order.find(match)
         .populate('user','name')
         .sort({createdAt: -1})
         .skip(skip)
         .limit(limit);

  return {orders,totalOrders, page, limit};
};
