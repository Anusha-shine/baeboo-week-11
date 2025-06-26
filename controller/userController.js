const User = require("../models/userSchema");
const Category = require("../models/categorySchema");
const Product = require("../models/productSchema");
const Brand = require("../models/brandSchema");
const bcrypt = require('bcryptjs');
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const Coupon = require("../models/couponSchema");
const { generateReferralCode } = require("../helpers/referralGenerate");
const ReferralCode = require("../models/referralCodeSchema");
const Wallet = require("../models/walletSchema");


const pageNotFound = (req, res) => {
    try {
        return res.render('user/page-404');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const loadHome = async (req, res) => {
    try {
        const user = req.session.user;
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find(
            {
                isBlocked: false,
                category: { $in: categories.map(category => category._id) }, quantity: { $gt: 0 }
            })
        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if (user) {
            const userData = await User.findOne({ _id: user });
            res.locals.user = userData;
            return res.render('user/home', { user: userData, products: productData });
        } else {
            return res.render('user/home', { products: productData });
        }
    } catch (error) {
        console.error("Error loading home:", error);
        res.status(500).send("Internal Server Error");
    }
};

const loadSignup = (req, res) => {
    const referralCode = req.query.ref || '';
    res.render('user/signup', { message: null,referralCode });
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp} </b>`
        })
        return info.accepted.length > 0;

    } catch (error) {
        console.error("Error sending email", error);
        return false;

    }
}

const signup = async (req, res) => {
    try {
        const { name, email, phone, password, confirmPassword } = req.body;
        const referralCode = req.body.referralCode || req.query.ref;

        if (password !== confirmPassword) {
            return res.render('user/signup', { message: 'password doesnot match' });
        }

        const user = await User.findOne({ email })

        if (user) {
            return res.render('user/signup', { message: 'User already exists' });
        }
        const refCode = req.body.referralCode || req.query.ref || null;
        let referredBy = null;

        if (refCode) {
            const referral = await ReferralCode.findOne({ code: refCode });

            if (!referral || referral.usedCount >= referral.usageLimit) {
                return res.render("user/signup", { message: "Invalid or expired referral code" });
            }

            referredBy = referral.user; // ✅ Correct referrer
        }


        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.json("email-error")
        }
        req.session.userOtp = otp;
        req.session.userData = {
            name,
            phone,
            email,
            password,
            referralCode: referralCode || null,
            referredBy
        };
        res.render("user/verify-otp");
        console.log("OTP Sent", otp);

    } catch (error) {
        console.error("Signup error", error);
        res.redirect("/pageNotFound");

    }
}
const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)

        return passwordHash;
    } catch (error) {
        console.error("Error hashing the password:", error);
        throw new Error('Password hashing failed');

    }
}
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log(otp);
        console.log('Session userOtp:', req.session.userOtp);
        console.log('Session userData:', req.session.userData);

        if (String(otp).trim() === String(req.session.userOtp).trim()) {
            const userData = req.session.userData;
            const passwordHash = await securePassword(userData.password);

            // Create the new user
            const newUser = new User({
                name: userData.name,
                phone: userData.phone,
                email: userData.email,
                password: passwordHash,
                referredBy: userData.referredBy || null
            });

            await newUser.save();

            const newCode = generateReferralCode();
            const baseUrl = "http://localhost:3008";
            const referralLink = `${baseUrl}/signup?ref=${newCode}`;

            const newReferral = new ReferralCode({
                user: newUser._id,
                code: newCode,
                referralLink,
                referredBy: userData.referredBy || null
            });

            await newReferral.save();

            if (userData.referralCode) {
                const referral = await ReferralCode.findOne({ code: userData.referralCode });

                if (referral) {
                    referral.usedCount += 1;
                    await referral.save();

                    const rewardAmount = referral.rewardAmount || 100;

                    // 🎁 1. Credit the **referrer**
                    await Wallet.updateOne(
                        { userId: referral.user },
                        {
                            $inc: { balance: rewardAmount },
                            $push: {
                                transactions: {
                                    type: "credit",
                                    amount: rewardAmount,
                                    description: `Referral bonus for inviting ${userData.email}`
                                }
                            }
                        },
                        { upsert: true }
                    );

                    // Credit the **referred new user**
                    await Wallet.updateOne(
                        { userId: newUser._id },
                        {
                            $inc: { balance: rewardAmount },
                            $push: {
                                transactions: {
                                    type: "credit",
                                    amount: rewardAmount,
                                    description: `Welcome bonus for using referral code`
                                }
                            }
                        },
                        { upsert: true }
                    );
                }
            }
            req.session.user = {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
            };

            //Clear session and redirect
            req.session.userOtp = null;
            req.session.userData = null;

            return res.json({ success: true, redirectUrl: '/' });


        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
        }

    } catch (error) {
        console.error("Error verifying OTP", error);
        res.status(500).json({ success: false, message: "An error occurred" });
    }
};


const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" })
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "OTP Resend successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP.Please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP", error);
        res.status(500).json({ success: false, message: "Internal Server Error.Please try again" });

    }
}

const loadLogin = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render("user/login")
        } else {
            res.redirect("/")
        }
    } catch (error) {
        res.redirect("/pageNotFound")

    }
}

const Login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ email });
        if (!findUser) {
            return res.render('user/login', { msg: "User not found" })
        }
        if (findUser.isBlocked) {
            return res.render('user/login', { msg: "Your account has been blocked" })
        }
        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render('user/login', { msg: "Invalid password" })
        }
        const name = findUser.name;
        req.session.user = findUser._id;
        res.redirect('/');
    } catch (error) {
        console.error("Error during login:", error);
        res.render('user/login', { msg: "login failed.Please try again later" })

    }
}
const Logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destruction error:", err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/login');
        })
    } catch (error) {
        console.error("Error during logout:", error);
        res.redirect('/pageNotFound');
    }
}
const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const categories = await Category.find({ isListed: true });
        const categoryIds = categories.map((category) => category._id.toString());
        const brands = await Brand.find({ isBlocked: false });
        const brandNames = brands.map((brand) => brand.brandName);
        const page = parseInt(req.query.page) || 1;
        const limit = 9;
        const skip = (page - 1) * limit;

        const products = await Product.find({
            isBlocked: false,
            category: { $in: categoryIds },
            quantity: { $gt: 0 },
            brand: { $in: brandNames }
        }).sort({ createdOn: -1 }).skip(skip).limit(limit);
        const totalProducts = await Product.countDocuments({
            isBlocked: false,
            category: { $in: categoryIds },
            brand: { $in: brandNames },
            quantity: { $gt: 0 }
        });
        const totalPages = Math.ceil(totalProducts / limit);
        const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));
        res.render("user/shop", {
            user: userData,
            products: products,
            category: categoriesWithIds,
            brand: brands,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages
        })

    } catch (error) {
        console.error("Error in loading shop", error);
        res.redirect("/pageNotFound");

    }
}
const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;
        const findCategory = category ? await Category.findOne({ _id: category }) : null;
        const findBrand = brand ? await Brand.findOne({ _id: brand }) : null;
        const brands = await Brand.find({ isBlocked: false }).lean();
        const brandNames = brands.map((brand) => brand.brandName);
        const query = {
            isBlocked: false,
            quantity: { $gt: 0 },
            brand: { $in: brandNames }
        }

        if (findCategory) {
            query.category = findCategory._id;
        }
        if (findBrand) {
            query.brand = findBrand.brandName;
        }
        let findProducts = await Product.find(query).lean();
        findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

        const categories = await Category.find({ isListed: true });
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex, endIndex);
        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user });
            if (userData) {
                const searchEntry = {
                    category: findCategory ? findCategory._id : null,
                    brand: findBrand ? findBrand.brandName : null,
                    searchedOn: new Date()
                }
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filterProduct = currentProduct;
        res.render("user/shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            selectedCategory: category || null,
            selectedBrand: brand || null
        })
    } catch (error) {
        res.redirect("/pageNotFound");
    }
}
const filterByPrice = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const brands = await Brand.find({ isBlocked: false }).lean();
        const brandNames = brands.map((brand) => brand.brandName);
        const categories = await Category.find({ isListed: true }).lean();

        let findProducts = await Product.find({
            salesPrice: { $gt: req.query.gt, $lt: req.query.lt },
            isBlocked: false,
            quantity: { $gt: 0 },
            brand: { $in: brandNames }
        }).lean();

        findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const currentProduct = findProducts.slice(startIndex, endIndex);
        req.session.filteredProducts = findProducts;

        res.render("user/shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage
        })

    } catch (error) {
        console.log(error);
        res.redirect("/pageNotFound");
    }
}
const searchProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        let search = req.body.query;

        const brands = await Brand.find({ isBlocked: false }).lean();
        const brandNames = brands.map((brand) => brand.brandName);
        const categories = await Category.find({ isListed: true }).lean();
        const categoryIds = categories.map(category => category._id.toString());
        let searchResult = [];
        if (req.session.filteredProducts && req.session.filteredProducts.length > 0) {
            searchResult = req.session.filteredProducts.filter(product =>
                product.productName.toLowerCase().includes(search.toLowerCase())
            )
        } else {
            searchResult = await Product.find({
                productName: { $regex: ".*" + search + ".*", $options: "i" },
                isBlocked: false,
                quantity: { $gt: 0 },
                category: { $in: categoryIds },
                brand: { $in: brandNames }
            })
        }
        searchResult.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length / itemsPerPage);
        const currentProduct = searchResult.slice(startIndex, endIndex);

        res.render("user/shop", {
            user: userData,
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            count: searchResult.length
        })
    } catch (error) {
        console.log("Error: error");
        res.redirect("/pageNotFound");
    }
}
module.exports = {
    loadHome,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    Login,
    Logout,
    loadShoppingPage,
    filterProduct,
    filterByPrice,
    searchProducts
};

