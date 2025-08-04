const User = require('../models/userSchema');
const bcrypt = require('bcrypt');
const Order = require('../models/orderSchema');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { getFilteredOrders } = require('../helpers/salesReportHelper');

const pageError = async (req, res) => {
  res.render('admin/pageError')
}

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
        req.session.admin = admin._id;
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
    
    // Sales Chart Data (group by day/month)
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

    // Category Pie Chart
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

    // Top 10 Products
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

    //  Top 10 Brands
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

    //  Top 10 Categories
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
  //  match condition for both orders and summary
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

  //Get paginated filtered orders using the match
  const { orders, totalOrders, page, limit } = await getFilteredOrders(match, req.query.page);

  // Fetch unpaginated orders for summary
  const allOrders = await Order.find(match);

  let totalAmount = 0;
  let totalDiscount = 0;
  let finalAmount = 0;

  allOrders.forEach(order => {
    totalAmount += order.totalAmount || 0;
    finalAmount += Math.round(order.finalAmount || 0);
    totalDiscount += order.discount || 0;
  });
  
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
    const filters = req.query;

    const match = { status: 'delivered' };

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
      match.createdAt = { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
    }

    if (filters.fromDate && filters.toDate) {
      const from = new Date(filters.fromDate);
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      match.createdAt = { $gte: from, $lte: to };
    }

    // Fetch all filtered orders
    const pageOrders = await Order.find(match).populate('user');
    const totalOrderCount = pageOrders.length;
    const totalAmount = pageOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const finalAmount = pageOrders.reduce((sum, o) => sum + Math.round(o.finalAmount || 0), 0);
    const totalDiscount = pageOrders.reduce((sum, o) => sum + (o.discount || 0), 0);

    const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.${type === 'excel' ? 'xlsx' : 'pdf'}`;

    if (type === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      worksheet.addRow(['Summary']);
      worksheet.addRow(['Exported Date', new Date().toLocaleDateString()]);
      worksheet.addRow(['Total Orders', totalOrderCount]);
      worksheet.addRow(['Total Amount', totalAmount.toFixed(2)]);
      worksheet.addRow(['Total Discount', totalDiscount.toFixed(2)]);
      worksheet.addRow(['Final Amount', finalAmount.toFixed(2)]);
      worksheet.addRow([]);

      worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Order ID', key: 'orderId', width: 30 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Discount', key: 'discount', width: 12 },
        { header: 'Final', key: 'final', width: 12 },
        { header: 'Payment', key: 'payment', width: 18 },
      ];

      pageOrders.forEach(o => {
        worksheet.addRow({
          date: o.createdAt.toLocaleDateString(),
          orderId: o.orderId.toString(),
          customer: o.user?.name || 'Unknown',
          total: (o.totalAmount || 0).toFixed(2),
          discount: ((o.discount != null)
            ? o.discount
            : ((o.totalAmount || 0) - (o.finalAmount || 0))
          ).toFixed(2),
          final: (o.finalAmount || 0).toFixed(2),
          payment: o.paymentMethod || 'N/A'
        });
      });

      await workbook.xlsx.write(res);
      res.end();
    } else if (type === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      doc.pipe(res);

      doc.on('error', err => {
        console.error('PDF generation error:', err);
        if (!res.headersSent) {
          res.status(500).send('PDF generation failed');
        }
      });

      // Title
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(`Sales Report`, { align: 'center' })
        .moveDown();

      // Summary
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Summary:')
        .font('Helvetica')
        .text(`Exported Date: ${new Date().toLocaleDateString()}`)
        .text(`Total Orders: ${totalOrderCount}`)
        .text(`Final Amount: ₹${finalAmount.toFixed(2)}`)
        .moveDown();

      // Table headers
      const headers = ['Date', 'Order ID', 'Customer','Amount Paid', 'Payment'];
      const colW = [60, 200, 120, 80, 70];
      let y = doc.y;
      const x = doc.x;

      doc.font('Helvetica-Bold').fontSize(11);
      headers.forEach((h, i) => {
        doc.text(h, x + colW.slice(0, i).reduce((a, b) => a + b, 0) + 2, y);
      });
      doc.moveDown();
      y = doc.y;

      // Table rows
      doc.font('Helvetica').fontSize(10);
      pageOrders.forEach(o => {
        if (y > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage();
          y = doc.y;
          doc.font('Helvetica-Bold').fontSize(11);
          headers.forEach((h, i) => {
            doc.text(h, x + colW.slice(0, i).reduce((a, b) => a + b, 0) + 2, y);
          });
          y = doc.y + 15;
          doc.font('Helvetica').fontSize(10);
        }

        const row = [
          o.createdAt.toLocaleDateString(),
          o.orderId.toString(),           //changed
          o.user?.name || 'Unknown',
          (o.finalAmount || 0).toFixed(2),
          o.paymentMethod || 'N/A',
        ];

        row.forEach((val, i) => {
          doc.text(val, x + colW.slice(0, i).reduce((a, b) => a + b, 0) + 2, y);
        });
        y = doc.y + 15;
      });

      doc.end();
    } else {
      res.status(400).send('Invalid format requested: only "excel" or "pdf" allowed.');
    }
  } catch (err) {
    console.error('Error in downloadSalesReport:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
};



module.exports = {
  loadLogin, Login, loadDashboard, pageError, Logout, getSalesReport,
  downloadSalesReport
};