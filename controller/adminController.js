const User = require('../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Order = require('../models/orderSchema');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { getFilteredOrders } = require('../helpers/salesReportHelper');
const Brand = require('../models/brandSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

const pageError = async (req, res) => [
  res.render('admin/pageError')
]


const loadLogin = (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { message: null });
}

const Login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });
    if (admin) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (passwordMatch) {
        req.session.admin = true;
        return res.redirect('/admin/dashboard');
      } else {
        return res.redirect('/admin/login');
      }
    }
  } catch (error) {
    console.log("login error", error);
    return res.redirect('/pageError');
  }
}

const loadDashboard = async (req, res) => {
  try {
    let { range, startDate, endDate } = req.query;

    const match = { status: "delivered" };

    // Filter Logic
    const now = new Date();
    if (range === '7') {
      const date = new Date(now);
      date.setDate(now.getDate() - 7);
      match.createdAt = { $gte: date };
    } else if (range === '30') {
      const date = new Date(now);
      date.setDate(now.getDate() - 30);
      match.createdAt = { $gte: date };
    } else if (range === 'year') {
      const start = new Date(now.getFullYear(), 0, 1);
      match.createdAt = { $gte: start };
    } else if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    // Orders for stats
    const orders = await Order.find(match).populate("orderedItems.product");

    const totalOrders = orders.length;
    const totalSales = Math.round( orders.reduce((sum, o) => sum + o.totalAmount, 0));
    const netRevenue = Math.round(orders.reduce((sum,o) => sum + o.finalAmount, 0));
    const totalDiscount = Math.round(totalSales - netRevenue);

    // 🟦 Sales Chart Data (group by day/month)
    const salesData = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: range === 'year' ? "%B" : "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          total: { $sum: "$finalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const salesChart = {
      labels: salesData.map(d => d._id),
      data: salesData.map(d => d.total)
    };

    // 🟨 Category Pie Chart
    const categoryChartAgg = await Order.aggregate([
      { $match: match },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $group: {
          _id: "$productInfo.category",
          totalQty: { $sum: "$orderedItems.quantity" }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      {
        $project: {
          name: "$categoryInfo.name",
          totalQty: 1
        }
      },
      { $sort: { totalQty: -1 } }
    ]);

    const categoryChart = {
      labels: categoryChartAgg.map(c => c.name),
      data: categoryChartAgg.map(c => c.totalQty)
    };

    // 🟩 Top 10 Products
    const topProductsAgg = await Order.aggregate([
      { $match: match },
      { $unwind: "$orderedItems" },
      {
        $group: {
          _id: "$orderedItems.product",
          totalQty: { $sum: "$orderedItems.quantity" }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.productName",
          brand: "$product.brand",
          image: { $arrayElemAt: ["$product.productImage", 0] },
          totalQty: 1
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 }
    ]);

    // 🟥 Top 10 Brands
    const topBrandsAgg = await Order.aggregate([
  { $match: match },
  { $unwind: "$orderedItems" },
  {
    $lookup: {
      from: "products",
      localField: "orderedItems.product",
      foreignField: "_id",
      as: "product"
    }
  },
  { $unwind: "$product" },
  {
    $group: {
      _id: "$product.brand", // brand name string
      totalQty: { $sum: "$orderedItems.quantity" }
    }
  },
  {
    $lookup: {
      from: "brands",
      localField: "_id",          // brand name
      foreignField: "brandName",  // match on brandName (String)
      as: "brand"
    }
  },
  { $unwind: "$brand" },
  {
    $project: {
      name: "$brand.brandName",
      totalQty: 1
    }
  },
  { $sort: { totalQty: -1 } },
  { $limit: 10 }
]);

    // 🟪 Top 10 Categories
    const topCategoriesAgg = await Order.aggregate([
      { $match: match },
      { $unwind: "$orderedItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          totalQty: { $sum: "$orderedItems.quantity" }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $project: {
          name: "$category.name",
          totalQty: 1
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 }
    ]);

    res.render("admin/dashboard", {
      totalOrders,
      totalSales,
      totalDiscount,
      netRevenue,
      salesChart,
      categoryChart,
      topProducts: topProductsAgg.slice(0, 3),
      topBrands: topBrandsAgg.slice(0, 3),
      topCategories: topCategoriesAgg.slice(0, 3),
      startDate,
      endDate,
      range
    });

  } catch (error) {
    console.log("Dashboard Error:", error);
    res.render("admin/dashboard", {
      totalOrders: 0,
      totalSales: 0,
      totalDiscount: 0,
      salesChart: { labels: [], data: [] },
      categoryChart: { labels: [], data: [] },
      topProducts: [],
      topBrands: [],
      topCategories: [],
      startDate: '',
      endDate: '',
      range: ''
    });
  }
};


const Logout = async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) {
        console.log("Error in destroying session", err);
        return res.redirect('/pageError');
      }
      res.redirect('/admin/login');
    });

  } catch (error) {
    console.log("Unexpected error in logout", error);
    return res.redirect('/pageError');

  }
}

const getSalesReport = async (req, res) => {
  const filters = req.query;

  // 1. Construct match condition for both orders and summary
  const match = { status: "delivered" };

  if (filters.filter === 'daily') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    match.createdAt = { $gte: today };
  } else if (filters.filter === 'weekly') {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    match.createdAt = { $gte: startOfWeek };
  } else if (filters.filter === 'monthly') {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    match.createdAt = { $gte: startOfMonth };
  }

  if (filters.fromDate && filters.toDate) {
    const from = new Date(filters.fromDate);
    const to = new Date(filters.toDate);
    to.setHours(23, 59, 59, 999);
    match.createdAt = { $gte: from, $lte: to };
  }

  // 2. Get paginated filtered orders using the match
  const { orders, totalOrders, page, limit } = await getFilteredOrders(match, req.query.page);

  // 3. Fetch unpaginated orders for summary
  const allOrders = await Order.find(match);

  let totalAmount = 0;
  let finalAmount = 0;

  allOrders.forEach(order => {
    totalAmount += order.totalAmount || 0;
    finalAmount += Math.round(order.finalAmount || 0);
  });

  const totalDiscount = Math.round(totalAmount - finalAmount);
  const summary = {
    totalOrderCount: allOrders.length,
    totalAmount,
    totalDiscount,
    finalAmount
  };

  const totalPages = Math.ceil(totalOrders / limit);

  res.render('admin/salesReport', {
    orders,
    summary,
    filters,
    pagination: {
      totalPages,
      currentPage: page
    }
  });
};

const downloadSalesReport = async (req, res) => {
  try {
    const { type } = req.params;
    // Reconstruct same filter logic as in getSalesReport (without pagination)
    const filters = req.query;
    const match = {status : "delivered"};

    if (filters.filter === 'daily') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      match.createdAt = { $gte: today };
    } else if (filters.filter === 'weekly') {
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      startOfWeek.setHours(0, 0, 0, 0);
      match.createdAt = { $gte: startOfWeek };
    } else if (filters.filter === 'monthly') {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      match.createdAt = { $gte: startOfMonth };
    }

    if (filters.fromDate && filters.toDate) {
      match.createdAt = {
        $gte: new Date(filters.fromDate),
        $lte: new Date(filters.toDate),
      };
    }

    // Fetch all matching orders (no pagination)
    const orders = await Order.find(match).populate('user');


    // Summary
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalFinal = orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0);
    const totalDiscount = totalAmount - totalFinal;

    if (type === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // Summary Rows
      worksheet.addRow(['Summary']);
      worksheet.addRow(['Total Orders', totalOrders]);
      worksheet.addRow(['Total Amount', totalAmount.toFixed(2)]);
      worksheet.addRow(['Total Discount', totalDiscount.toFixed(2)]);
      worksheet.addRow(['Final Amount', totalFinal.toFixed(2)]);
      worksheet.addRow([]); // empty row for spacing

      worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Order ID', key: 'orderId', width: 25 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Discount', key: 'discount', width: 10 },
        { header: 'Final', key: 'final', width: 10 },
        { header: 'Payment Method', key: 'payment', width: 15 },
      ];

      orders.forEach(order => {
        worksheet.addRow({
          date: order.createdAt.toLocaleDateString(),
          orderId: order._id,
          customer: order.user?.name || 'Unknown',
          total: order.totalAmount?.toFixed(2) || 0,
          discount: ((order.totalAmount - order.finalAmount) || 0).toFixed(2),
          final: order.finalAmount?.toFixed(2) || 0,
          payment: order.paymentMethod,
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
      await workbook.xlsx.write(res); // Await ensures stream completes before ending response
      res.end();

    } else if (type === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const tableTop = 180;
      const rowHeight = 20;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
      doc.pipe(res);

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
      doc.moveDown();

      // Summary
      doc.fontSize(12).font('Helvetica-Bold').text('Summary:', 40);
      doc.font('Helvetica').text(`Total Orders: ${totalOrders}`);
      doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`);
      doc.text(`Total Discount: ₹${totalDiscount.toFixed(2)}`);
      doc.text(`Final Amount: ₹${totalFinal.toFixed(2)}`);
      doc.moveDown();

      // Table Headers
      doc.rect(40, tableTop, 520, rowHeight).fill('#eeeeee');
      doc.fillColor('#000').fontSize(12).font('Helvetica-Bold');

      const headers = ['Date', 'Order ID', 'Customer', 'Total', 'Discount', 'Final', 'Payment'];
      const columnWidths = [70, 80, 100, 60, 60, 60, 90];
      const columnStarts = columnWidths.reduce((acc, width, i) => {
        acc.push(i === 0 ? 40 : acc[i - 1] + columnWidths[i - 1]);
        return acc;
      }, []);

      headers.forEach((header, i) => {
        doc.text(header, columnStarts[i] + 2, tableTop + 5, { width: columnWidths[i] - 4, align: 'left' });
      });

      // Table Rows
      let y = tableTop + rowHeight;
      doc.font('Helvetica').fontSize(10);

      for (let order of orders) {
        if (y > 750) {
          doc.addPage();
          y = 60;

          // Repeat table headers on new page
          doc.rect(40, y, 520, rowHeight).fill('#eeeeee');
          headers.forEach((header, i) => {
            doc.fillColor('#000').font('Helvetica-Bold').fontSize(12);
            doc.text(header, columnStarts[i] + 2, y + 5, { width: columnWidths[i] - 4, align: 'left' });
          });
          y += rowHeight;
          doc.font('Helvetica').fontSize(10);
        }

        const rowData = [
          order.createdAt.toLocaleDateString(),
          order._id.toString().slice(-6),
          order.user?.name || 'Unknown',
          `₹${(order.totalAmount || 0).toFixed(2)}`,
          `₹${((order.totalAmount - order.finalAmount) || 0).toFixed(2)}`,
          `₹${(order.finalAmount || 0).toFixed(2)}`,
          order.paymentMethod || 'N/A',
        ];

        rowData.forEach((text, i) => {
          doc.text(text, columnStarts[i] + 2, y + 5, { width: columnWidths[i] - 4, align: 'left' });
        });

        y += rowHeight;
      }

      doc.end();

    } else {
      res.status(400).send('Invalid format requested.');
    }
  } catch (error) {
    console.error('Error in downloadSalesReport:', error);
    res.status(500).send('Internal Server Error');
  }
};



module.exports = {
  loadLogin, Login, loadDashboard, pageError, Logout, getSalesReport,
  downloadSalesReport
};