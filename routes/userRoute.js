const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controller/userController');
const userProfileController = require("../controller/userProfilecontroller");
const {userAuth,adminAuth, isUserBlocked} = require("../middlewares/auth");
const userProductController = require("../controller/userProductController");
const multer = require("multer");
const storage = require("../helpers/multer");
const upload = multer ({storage});
const wishlistController = require("../controller/wishlistController");
const cartController = require("../controller/cartController");
const orderController = require("../controller/orderController");
const userWalletController = require("../controller/userWalletController");
const {loadUserReferral} = require("../controller/userReferralController");
//Error management
router.get('/pageNotFound', userController.pageNotFound);

router.get('/',isUserBlocked,userController.loadHome);
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
router.post("/search",userAuth,userController.searchProducts);

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
router.post("/verify-changepassword-otp",userAuth,userProfileController.verifyChangePassOtp);
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
router.post("/addToWishlist",userAuth,wishlistController.addToWishlist);
router.get("/removeFromWishlist",userAuth,wishlistController.removeProduct);
//cart Management
router.get("/cart",userAuth,cartController.loadCart);
router.post("/addToCart",userAuth,cartController.addToCart);
router.post("/remove-from-cart",userAuth,cartController.removeFromCart);
router.post("/cart/update-quantity",userAuth,cartController.updateCartQuantity);
router.post("/wishlist/add-to-cart",userAuth,wishlistController.addToCartFromWishlist);
//order Management
router.get("/checkout",userAuth,orderController.getCheckoutPage);
router.get("/payment",userAuth,orderController.getPaymentPage);
router.post("/orderPlaced",userAuth,orderController.orderPlaced);
router.post("/createRazorpayOrder",userAuth,orderController.createRazorpayOrder);
router.post("/verifyPayment",userAuth,orderController.verifyPayment);
router.post("/paymentConfirm",userAuth,orderController.paymentConfirm);
router.get("/orderSuccess",userAuth,orderController.orderSuccess);
router.get("/orderFailure/:orderId",userAuth,orderController.orderFailure);
router.post("/markOrderFailed",userAuth,orderController.markOrderFailed);
router.get("/retry-payment/:orderId",userAuth,orderController.retryPayment);
router.get("/orders",userAuth,orderController.getOrdersPage);
router.get("/order/:orderId",userAuth,orderController.getOrderDetails);
router.post("/order/:orderId/item/:itemId/cancel",userAuth,orderController.cancelOrderItem);
router.get("/invoice/:orderId",userAuth,orderController.generateInvoice);
router.get("/returnOrder/:orderId",userAuth,orderController.returnOrder);
router.post("/returnOrder/:orderId",userAuth,orderController.returnOrderRequest);
//wallet Management
router.get("/wallet",userAuth,userWalletController.viewWallet);

//coupon Management
router.post("/applyCoupon",userAuth,orderController.applyCoupon);
router.post("/removeCoupon",userAuth,orderController.removeCoupon);
router.get("/availableCoupons", userAuth, orderController.getAvailableCoupons);




module.exports = router;