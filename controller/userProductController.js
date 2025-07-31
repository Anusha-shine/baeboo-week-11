const Product = require("../models/productSchema");
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
    console.error("Error for fetching product details", error);
    res.redirect("/user/pageNotFound");
  }
}

module.exports = { productDetails };