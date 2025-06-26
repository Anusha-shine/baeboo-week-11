const Product = require("../models/productSchema");
const Category = require("../models/categorySchema");
const User = require("../models/userSchema");


const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.query.id;
    const product = await Product.findById(productId).populate("category");
    const findCategory = product.category;
    const categoryOffer = findCategory?.categoryOffer || 0;
    const productOffer = product.productOffer || 0;
    const totalOffer = categoryOffer + productOffer;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isBlocked: false,
      status: 'Available',
      quantity: { $gt: 0 }
    }).limit(4);

    res.render("user/product-details", {
      user: userData,
      product: product,
      quantity: product.quantity,
      totalOffer: totalOffer,
      category: findCategory,
      relatedProducts
    });
  } catch (error) {
    conole.error("Error for fetching product details", error);
    res.redirect("/user/pageNotFound");
  }
}
const relatedProducts = async (req, res) => {
  try {
    const productId = req.params.id;

    // Find the current product
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Find related products in the same category, exclude current product, limit 4
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isBlocked: false,
      status: 'Available',
      stock: { $gt: 0 }
    }).limit(4);

    // Pass data to EJS template (adjust view name as needed)
    res.render('productDetail', {
      product,
      relatedProducts,
      category: product.category,
      quantity: product.stock
    });
  } catch (err) {
    console.error('Error fetching product detail:', err);
    res.status(500).send('Internal Server Error');
  }
};


module.exports = { productDetails, relatedProducts };