const User = require("../models/userSchema");
const Product = require("../models/productSchema");
const Cart = require("../models/cartSchema");
const Wishlist = require("../models/wishlistSchema");


const loadWishlist = async(req,res) => {
    try{
        const userId = req.session.user;
        const user = await User.findById(userId);
        const products = await Product.find({_id:{$in:user.wishlist}}).populate("category");

        res.render("user/wishlist",{
            user,
            wishlist: products
        });
    }catch(error){
        console.error(error);
        res.redirect("/pageNotFound");
    }
}
const addToWishlist = async (req, res) => {
  try {
    const productId = req.body.productId;
    const userId = req.session.user;

    const product = await Product.findById(productId).populate("category");


    const user = await User.findById(userId);

    if (user.wishlist.includes(productId)) {
      return res.status(200).json({
        success: false,
        message: "Product already in wishlist"
      });
    }

    user.wishlist.push(productId);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Product added to wishlist"
    });

  } catch (error) {
    console.error("Error adding to wishlist:", error);
    return res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
};

const removeProduct = async(req,res)=> {
    try{
        const productId = req.query.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        const index = user.wishlist.indexOf(productId);
        user.wishlist.splice(index,1);
        await user.save();
        return res.redirect("/wishlist");
    }catch(error){
        console.error(error);
        return res.status(500).json({status:false,message:"Server error"});

    }
}
const addToCartFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.body.productId;

    const product = await Product.findById(productId);
    if (!product || product.quantity <= 0) {
      return res.redirect('/wishlist'); // Optionally show a message
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(item => item.productId.equals(productId));

    if (existingItem) {
      existingItem.quantity += 1;
      existingItem.totalPrice = existingItem.quantity * product.salesPrice;
    } else {
      cart.items.push({
        productId,
        quantity: 1,
        price: product.salesPrice,
        totalPrice: product.salesPrice
      });
    }

    await cart.save();

    // ✅ Remove from user's wishlist (since you store it in User model)
    const user = await User.findById(userId);
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();

    res.redirect('/wishlist');

  } catch (error) {
    console.error('Error adding to cart from wishlist:', error);
    res.redirect('/wishlist');
  }
};

module.exports = {loadWishlist,addToWishlist,removeProduct,addToCartFromWishlist};