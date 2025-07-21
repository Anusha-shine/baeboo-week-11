const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const {adminAuth} = require('../middlewares/auth');
const customerController = require('../controller/customerController');
const categoryController = require('../controller/categoryController');
const multer = require('multer');
const storage = require('../helpers/multer');
const uploads = multer({storage:storage});
const brandController = require("../controller/brandController");
const productController = require("../controller/productController");
const adminOrderController = require("../controller/adminOrderController");
const couponController = require("../controller/couponController");

router.get('/pageError',adminController.pageError);
router.get('/login', adminController.loadLogin);
router.post('/login',adminController.Login);
router.get('/logout',adminController.Logout);
router.get('/dashboard',adminAuth,adminController.loadDashboard);


//customer management
router.get("/users",adminAuth,customerController.customerInfo);
router.post("/blockCustomer",adminAuth,customerController.customerBlocked);
router.post("/unblockCustomer",adminAuth,customerController.customerUnBlocked);

//category management
router.get('/addCategory',adminAuth,categoryController.categoryInfo);
router.post('/addCategory',adminAuth,categoryController.addCategory);
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer);
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer);
router.get("/listCategory",adminAuth,categoryController.getListCategory);
router.get("/unlistCategory",adminAuth,categoryController.getUnlistCategory);
router.get('/editCategory',adminAuth,categoryController.getEditCategory);
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);

//brand management
router.get("/brands",adminAuth,brandController.getBrandPage);
router.post("/addBrand",adminAuth,uploads.single("image"),brandController.addBrand);
router.get("/blockBrand",adminAuth,brandController.blockBrand);
router.get("/unBlockBrand",adminAuth,brandController.unBlockBrand);
router.get("/deleteBrand",adminAuth,brandController.deleteBrand);

//product management
router.get("/addProducts",adminAuth,productController.getProductAddPage);
router.post("/addProducts",adminAuth,uploads.array("images",4),productController.addProducts);
router.get("/products",adminAuth,productController.getAllProducts);
router.post("/addProductOffer",adminAuth,productController.addProductOffer);
router.post("/removeProductOffer",adminAuth,productController.removeProductOffer);
router.get("/blockProduct",adminAuth,productController.blockProduct);
router.get("/unblockProduct",adminAuth,productController.unblockProduct);
router.get("/editProduct",adminAuth,productController.getEditProduct);
router.post("/editProduct/:id",adminAuth,uploads.array("images",4),productController.editProduct);
router.post("/deleteImage",adminAuth,productController.deleteSingleImage);

//Order Management
router.get("/adminOrders",adminAuth,adminOrderController.listOrders);
router.get("/order/:orderId",adminAuth,adminOrderController.getOrderDetails);
router.post("/order/:orderId/status",adminAuth,adminOrderController.updateOrderStatus);
router.post("/approveReturnItem/:orderId/:itemIndex",adminAuth,adminOrderController.approveReturnItem);
router.post("/rejectReturnItem/:orderId/:itemIndex",adminAuth,adminOrderController.rejectReturnItem);

//coupon Management
router.get("/coupon",adminAuth,couponController.loadCoupon);
router.post("/createCoupon",adminAuth,couponController.createCoupon);
router.get("/editCoupon",adminAuth,couponController.editCoupon);
router.post("/updateCoupon",adminAuth,couponController.updateCoupon);
router.get("/deleteCoupon",adminAuth,couponController.deleteCoupon);

//sales report
router.get("/salesReport",adminAuth,adminController.getSalesReport);
// Export Sales Report
router.get('/salesReport/download/:type', adminController.downloadSalesReport);


module.exports = router;