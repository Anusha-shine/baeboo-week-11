const User = require("../models/userSchema");
const Product = require("../models/productSchema");
const Cart = require("../models/cartSchema");

const loadCart = async (req,res) => {
  try {
      const userId = req.session.user;
      const userData = await User.findById(userId);
      const cart =await Cart.findOne({userId}).populate("items.productId");

      let quantity = 0;
      let grandTotal = 0;
     if(cart && Array.isArray(cart.items)) {
        cart.items.forEach((item) => {
            quantity += item.quantity;
            grandTotal += item.productId.salesPrice * item.quantity;
        });
     }
      req.session.grandTotal = grandTotal;
      res.render("user/cart",{
        user: userData,
        quantity,
        cart,
        grandTotal
      });
  } catch (error) {
   console.error(error);
   res.redirect("/pageNotFound");
  }
};
const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId, quantity } = req.body;
        const quantityNum = parseInt(quantity); // ✅ Ensure it's a number

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        let cart = await Cart.findOne({ userId });

        let existingQuantity = 0;
        if (cart) {
            const itemInCart = cart.items.find(item => item.productId.toString() === productId);
            if (itemInCart) {
                existingQuantity = itemInCart.quantity;
            }
        }

        const requestedTotalQuantity = existingQuantity + quantityNum;

        if (requestedTotalQuantity > product.quantity) {
            return res.status(400).json({ success: false, message: "Insufficient stock" });
        }

        if (requestedTotalQuantity > 5) {
            return res.status(400).json({ success: false, message: "Cannot add more than 5 items of this product" });
        }

        const price = product.salesPrice;
        const totalPrice = price * quantityNum;

        if (cart) {
            const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
            if (itemIndex > -1) {
                cart.items[itemIndex].quantity += quantityNum;
                cart.items[itemIndex].totalPrice += totalPrice;
            } else {
                cart.items.push({ productId, quantity: quantityNum, price, totalPrice });
            }
        } else {
            cart = new Cart({
                userId,
                items: [{ productId, quantity: quantityNum, price, totalPrice }],
            });
        }
        await cart.save();

        return res.status(200).json({ success: true, message: "Added to cart successfully" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.body.productId;
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      if(req.xhr) return res.json({succcess: false, message: "Cart not found"});
      return res.redirect("/cart");
    }

    // Find the item to get its quantity before removing it
    const removedItem = cart.items.find(
      item => item.productId.toString() === productId
    );

    if (!removedItem) {
      if(req.xhr) return res.json({success: false, message: "Item not found in cart"});
      return res.redirect("/cart"); // item not found, nothing to remove
    }

    // Remove the item from the cart
    cart.items = cart.items.filter(
      item => item.productId.toString() !== productId
    );

    await cart.save(); // Save the updated cart
    if(req.xhr) {
      return res.json({success:true});
    }else {
      return res.redirect("/cart");
    }
    
  } catch (error) {
    console.error("Error removing from cart", error);
    if(req.xhr) return res.status(500).json({success: false, message: "Server error"});
    res.redirect("/pageNotFound");
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, action } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const item = cart.items.find(i => i.productId.toString() === productId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not in cart' });

    if (action === 'increment') {

      if (item.quantity >= 5) {
        return res.status(400).json({ success: false, message: 'Maximum 5 items allowed per product' });
    }

       if (item.quantity + 1 > product.quantity) {
  return res.status(400).json({ success: false, message: 'Only ' + product.quantity + ' in stock' });
}
      item.quantity += 1;
      item.totalPrice = item.quantity * item.price;
    } else if (action === 'decrement') {
      if (item.quantity > 1) {
        item.quantity -= 1;
        item.totalPrice = item.quantity * item.price;
      } else {
        return res.status(400).json({ success: false, message: 'Minimum quantity is 1' });
      }
    }

    await product.save();
    await cart.save();

    return res.status(200).json({ success: true, message: 'Cart updated successfully' });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



module.exports = {loadCart,addToCart,removeFromCart,updateCartQuantity}