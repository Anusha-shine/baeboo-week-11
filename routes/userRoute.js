const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controller/userController');
const userProfileController = require("../controller/userProfilecontroller");
const {userAuth, isUserBlocked} = require("../middlewares/auth");
const userProductController = require("../controller/userProductController");
const multer = require("multer");
const storage = require("../helpers/multer");
const upload = multer ({storage});
const wishlistController = require("../controller/wishlistController");
const cartController = require("../controller/cartController");
const orderController = require("../controller/orderController");
const userWalletController = require("../controller/userWalletController");
const ajaxShopController = require("../controller/ajaxShopController");
const paymentController = require("../controller/paymentController");
const invoiceController = require("../controller/invoiceController");
const returnOrderController = require("../controller/returnOrderController");
//Error management
router.get('/pageNotFound', userController.pageNotFound);
router.get('/user/blocked', (req, res) => {
  res.render('user/blocked');
});


router.get('/',userController.loadHome);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.get("/auth/google",passport.authenticate('google',{scope:['profile','email']}));
router.get("/auth/google/callback",passport.authenticate('google',{failureRedirect:'/signup'}),
(req,res)=> { req.session.user = req.user._id; // Store the user's _id in session
        res.redirect('/');})
router.get('/login', userController.loadLogin);
router.post('/login', userController.Login);
router.get('/logout', userController.Logout);

//Shopping page
router.get("/shop",userAuth,isUserBlocked,userController.loadShoppingPage);
router.get("/filter",userAuth,isUserBlocked,userController.filterProduct);
router.get("/filterPrice",userAuth,isUserBlocked,userController.filterByPrice);
router.post("/search",userAuth,isUserBlocked,userController.searchProducts);
router.get("/shop/ajax",ajaxShopController.ajaxLoadProducts);

//profile Management
router.get("/forgot-password",userProfileController.getForgotPassPage);
router.post("/forgot-password",userProfileController.forgotPassPage);
router.post("/verify-passForgot-otp",userProfileController.verifyForgotPassOtp);
router.post('/resend-otp', userProfileController.resendForgotPassOtp);
router.get("/reset-password",userProfileController.getResetPassPage);
router.post("/reset-password",userProfileController.postNewPassword);
router.get("/userProfile",userAuth,userProfileController.userProfile);
router.get("/change-email",userAuth,userProfileController.changeEmail);
router.post("/change-email",userAuth,userProfileController.changeEmailValid);
router.post("/verify-email-otp",userAuth,userProfileController.verifyEmailOtp);
router.post("/update-email",userAuth,userProfileController.updateEmail);
router.get("/change-password",userAuth,userProfileController.changePassword);
router.post("/change-password",userAuth,userProfileController.changePasswordValid);
router.post("/upload-profile-pic",upload.single("profileImage"),userProfileController.uploadProfileImage);
router.get("/profile",userAuth,userProfileController.loadProfile);
router.get("/edit-profile",userAuth,userProfileController.loadEditProfile);
router.post("/edit-profile",userAuth,userProfileController.editProfile);
//address Management
router.get("/addAddress",userAuth,userProfileController.addAddress);
router.post("/addAddress",userAuth,userProfileController.postAddAddress);
router.get("/editAddress",userAuth,userProfileController.editAddress);
router.post("/editAddress",userAuth,userProfileController.postEditAddress);
router.get("/deleteAddress",userAuth,userProfileController.deleteAddress);
//product Management
router.get("/productDetails",userAuth,isUserBlocked,userProductController.productDetails);
router.get("/product/:id",userAuth,userProductController.relatedProducts);

//wishlist Management
router.get("/wishlist",userAuth,wishlistController.loadWishlist);
router.post("/addToWishlist",userAuth,isUserBlocked,wishlistController.addToWishlist);
router.get("/removeFromWishlist",userAuth,isUserBlocked,wishlistController.removeProduct);
//cart Management
router.get("/cart",userAuth,cartController.loadCart);
router.post("/addToCart",userAuth,isUserBlocked,cartController.addToCart);
router.post("/remove-from-cart",userAuth,cartController.removeFromCart);
router.post("/cart/update-quantity",userAuth,cartController.updateCartQuantity);
router.post("/wishlist/add-to-cart",userAuth,isUserBlocked,wishlistController.addToCartFromWishlist);
//order Management
router.get("/check-cart", userAuth,isUserBlocked, orderController.checkCart);
router.get("/checkout",userAuth,isUserBlocked,orderController.getCheckoutPage);
router.get("/payment",userAuth,isUserBlocked,orderController.getPaymentPage);
router.post("/orderPlaced",userAuth,isUserBlocked,orderController.orderPlaced);
router.post("/createRazorpayOrder",userAuth,isUserBlocked,paymentController.createRazorpayOrder);
router.post("/verifyPayment",userAuth,paymentController.verifyPayment);
router.post("/paymentConfirm",userAuth,paymentController.paymentConfirm);
router.get("/orderSuccess",userAuth,paymentController.orderSuccess);
router.get("/orderFailure/:orderId",userAuth,paymentController.orderFailure);
router.post("/markOrderFailed",userAuth,paymentController.markOrderFailed);
router.get("/retry-payment/:orderId",userAuth,isUserBlocked,paymentController.retryPayment);
router.get("/orders",userAuth,isUserBlocked,orderController.getOrdersPage);
router.get("/order/:orderId",userAuth,isUserBlocked,orderController.getOrderDetails);
router.post("/order/:orderId/item/:itemId/cancel",userAuth,isUserBlocked,returnOrderController.cancelOrderItem);
router.get("/invoice/:orderId",userAuth,invoiceController.generateInvoice);
router.get("/returnOrder/:orderId",userAuth,returnOrderController.returnOrder);
router.post("/returnOrder/:orderId",userAuth,returnOrderController.returnOrderRequest);
//wallet Management
router.get("/wallet",userAuth,isUserBlocked,userWalletController.viewWallet);

//coupon Management
router.post("/applyCoupon",userAuth,orderController.applyCoupon);
router.post("/removeCoupon",userAuth,orderController.removeCoupon);
router.get("/availableCoupons", userAuth, orderController.getAvailableCoupons);




module.exports = router;