const PDFDocument = require("pdfkit");
const path = require("path");
const Order = require("../models/orderSchema");

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

module.exports = {
  generateInvoice}