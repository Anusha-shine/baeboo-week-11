const User = require("../models/userSchema");
const Category = require("../models/categorySchema");
const Product = require("../models/productSchema");
const Brand = require("../models/brandSchema");
const bcrypt = require('bcryptjs');
const nodemailer = require("nodemailer");
const { generateReferralCode } = require("../helpers/referralGenerate");
const ReferralCode = require("../models/referralCodeSchema");
const Wallet = require("../models/walletSchema");
const process = require('process');


const pageNotFound = (req, res) => {
    try {
        return res.render('user/page-404');
    } catch (error) {
        console.error("Error rendering pageNotFound:", error);
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
        const productsRow1 = productData.slice(0, 4);
        const productsRow2 = productData.slice(4, 8);

        const renderData = { productsRow1, productsRow2 };


         if (user) {
      const userData = await User.findById(user);
      res.locals.user = userData;
      renderData.user = userData;
    }
    res.render('user/home', renderData);
  }  catch (error) {
        console.error("Error loading home:", error);
        res.status(500).send("Internal Server Error");
    }
};

const loadSignup = (req, res) => {
    const referralCode = req.query.ref || '';
    res.render('user/signup', { message: null, referralCode });
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

            referredBy = referral.user;
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
            const baseUrl = process.env.BASE_URL
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

                    //credit referrer
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

                    // Credit the referred new user
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
           req.session.userId = newUser._id.toString();


            //Clear session and redirect
            req.session.userOtp = null;
            req.session.userData = null;

            return res.json({ success: true, redirectUrl: '/login' });


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
        console.error("Error loading login page:", error);
        res.redirect("/pageNotFound")

    }
}

const Login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ email });

        if (!findUser) {
            return res.render('user/login', { msg: "User not found" });
        }

        // Check if user is blocked
        if (findUser.isBlocked) {
            return res.render('user/login', { msg: "Your account has been blocked. Please contact support." });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render('user/login', { msg: "Invalid password" });
        }

        req.session.user = findUser._id;
        res.redirect('/');
    } catch (error) {
        console.error("Error during login:", error);
        res.render('user/login', { msg: "Login failed. Please try again later." });
    }
};

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

    const sort = req.query.sort || ""; // Read sort from query
    let sortOption = { createdOn: -1, _id: -1 }; // Default: Newest first

    if (sort === "price-asc") {
      sortOption = { salesPrice: 1, _id: -1 };
    } else if (sort === "price-desc") {
      sortOption = { salesPrice: -1, _id: -1 };
    } else if (sort === "newest") {
      sortOption = { createdOn: -1, _id: -1 };
    }

    const productFilter = {
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
      brand: { $in: brandNames },
    };

    const products = await Product.find(productFilter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(productFilter);
    const totalPages = Math.ceil(totalProducts / limit);

    const categoriesWithIds = categories.map((category) => ({
      _id: category._id,
      name: category.name,
    }));
     const basePath = req.baseUrl + req.path; 
       const filterParams = {
    category: req.query.category || "",
    brand: req.query.brand || "",
    sort: req.query.sort || "",
    search: req.query.search || "",
    minPrice: req.query.minPrice || "",
    maxPrice: req.query.maxPrice || "",
  };
    res.render("user/shop", {
      user: userData,
      products: products,
      basePath,
      filterParams,
      category: categoriesWithIds,
      selectedCategory: req.query.category || "",
      brand: brands,
      selectedBrand: req.query.brand || "",
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages,
      selectedSort: req.query.sort || "",
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      searchQuery: req.query.search || "",
    });

  } catch (error) {
    console.error("Error in loading shop", error);
    res.redirect("/pageNotFound");
  }
};

const filterProduct = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findById(user) : null;

    const brands = await Brand.find({ isBlocked: false });
    const categories = await Category.find({ isListed: true });

    const brandParam = req.query.brand;
    const categoryParam = req.query.category;
    const minPrice = parseInt(req.query.minPrice) || 0;
    const maxPrice = parseInt(req.query.maxPrice) || 1000000;
    const sort = req.query.sort || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    let sortOption = { createdOn: -1, _id: -1 }; // Default: newest
    if (sort === 'price-asc') sortOption = { salesPrice: 1, _id: -1 };
    if (sort === 'price-desc') sortOption = { salesPrice: -1, _id: -1 };
    if (sort === 'newest') sortOption = { createdOn: -1, _id: -1 };

    const brandNames = brands.map(b => b.brandName);
    const query = {
      isBlocked: false,
      quantity: { $gt: 0 },
      brand: { $in: brandNames },
      salesPrice: { $gte: minPrice, $lte: maxPrice }
    };

    if (categoryParam) {
      const categoryDoc = await Category.findById(categoryParam);
      if (categoryDoc) query.category = categoryDoc._id;
    }

    if (brandParam) {
      const brandDoc = await Brand.findById(brandParam);
      if (brandDoc) query.brand = brandDoc.brandName;
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);
    const basePath = req.baseUrl + req.path; 
    res.render("user/shop", {
      user: userData,
      products,
      basePath,
      filterParams:{category: req.query.category,brand:req.query.brand},
      category: categories,
      brand: brands,
      totalProducts,
      currentPage: page,
      totalPages,
      selectedSort: sort,
      selectedCategory: categoryParam || null,
      selectedBrand: brandParam || null,
      minPrice,
      maxPrice
    });

  } catch (error) {
    console.log(error);
    res.redirect("/pageNotFound");
  }
};

const filterByPrice = async(req,res)=>{
    try{
       const user = req.session.user;
       const userData = await User.findOne({_id:user});
       const brands = await Brand.find({isBlocked:false}).lean();
       const brandNames = brands.map((brand) => brand.brandName);
       const categories = await Category.find({isListed:true}).lean();

       let findProducts = await Product.find({
        salesPrice: {$gt: req.query.gt,$lt: req.query.lt},
        isBlocked: false,
        quantity : {$gt: 0},
        brand:{$in: brandNames}
       }).lean();

       findProducts.sort((a,b)=>new Date(b.createdOn) - new Date(a.createdOn));

       let itemsPerPage = 6;
       let currentPage = parseInt(req.query.page) || 1;
       let startIndex = (currentPage - 1) * itemsPerPage;
       let endIndex = startIndex + itemsPerPage;
       let totalPages = Math.ceil(findProducts.length/itemsPerPage);
       const currentProduct = findProducts.slice(startIndex,endIndex);
       req.session.filteredProducts = findProducts;
       const basePath = req.baseUrl + req.path; 
       const filterParams = {
    gt: req.query.gt || "",
    lt: req.query.lt || "",
    sort: req.query.sort || "",
    category: req.query.category || "",
    brand: req.query.brand || "",
    search: req.query.search || ""
  };

       res.render("user/shop",{
        user : userData,
        basePath,
        filterParams,
        products :currentProduct,
        selectedSort: req.query.sort || "",
        category : categories,
        brand : brands,
        totalPages,
        currentPage,
        selectedCategory: req.query.category || "",
        selectedBrand: req.query.brand || "",
      maxPrice: req.query.maxPrice,
      minPrice: req.query.minPrice,
      searchQuery: req.query.search || "",
       })

    }catch(error){
        console.log(error);
        res.redirect("/pageNotFound");
    }
}
const searchProducts = async(req,res) => {
    try{
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        let search = req.query.query;

        const brands = await Brand.find({isBlocked:false}).lean();
        const brandNames = brands.map((brand) => brand.brandName);
        const categories = await Category.find({isListed:true}).lean();
        const categoryIds = categories.map(category=> category._id.toString());
        let searchResult = [];
        if(req.session.filteredProducts && req.session.filteredProducts.length>0){
            searchResult = req.session.filteredProducts.filter(product=> 
                product.productName.toLowerCase().includes(search.toLowerCase())
            )
        }else {
            searchResult = await Product.find({
                productName : {$regex:".*"+search+".*",$options:"i"},
                isBlocked: false,
                quantity:{$gt:0},
                category:{$in:categoryIds},
                brand: {$in:brandNames}
            })
        }
        searchResult.sort((a,b)=>new Date(b.createdOn) - new Date(a.createdOn));
        let itemsPerPage =6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);
        const basePath = req.baseUrl + req.path; 
          const filterParams = {
    search: search,
    sort: req.query.sort || "",
    category: req.query.category || "",
    brand: req.query.brand || ""
  };
        res.render("user/shop",{
            user: userData,
            basePath,
            filterParams,
            selectedSort: req.query.sort || "",
            selectedCategory: req.query.category || "",
            selectedBrand: req.query.brand || "",
                search: req.query.search || "",
    minPrice: req.query.minPrice || "",
    maxPrice: req.query.maxPrice || "",
            products: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            count: searchResult.length
        })
    }catch(error){
        console.log("Error:", error);
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
    loadShoppingPage,filterProduct,filterByPrice,searchProducts
};

