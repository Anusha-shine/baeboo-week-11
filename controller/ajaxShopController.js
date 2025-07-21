const ejs = require('ejs');
const path = require('path');
const User = require('../models/userSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const Brand = require('../models/brandSchema');


const ajaxLoadProducts = async (req, res) => {
  try {
    const user = req.session.user;
    const userData = user ? await User.findById(user) : null;

    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({ isBlocked: false }).lean();
    const brandNames = brands.map(b => b.brandName);
    const categoryIds = categories.map(c => c._id.toString());

    const {
      query: search,
      category: categoryId,
      brand: brandId,
      sort,
      page = 1
    } = req.query;

    const currentPage = parseInt(page);
    const limit = 6;
    const skip = (currentPage - 1) * limit;

    // Filters
    const filter = {
      isBlocked: false,
      quantity: { $gt: 0 },
      category: { $in: categoryIds },
      brand: { $in: brandNames }
    };

    if (categoryId) filter.category = categoryId;
    if (brandId) {
      const brand = await Brand.findById(brandId);
      if (brand) filter.brand = brand.brandName;
    }
    if (search) {
      filter.productName = { $regex: search, $options: "i" };
    }
    //price filter
    const gt = parseInt(req.query.gt);
    const lt = parseInt(req.query.lt);
    if(!isNaN(gt) && !isNaN(lt)) {
        filter.salesPrice = { $gte: gt, $lte: lt };
    }

    // Sort
    let sortOption = { createdOn: -1 };
    if (sort === "price-asc") sortOption = { salesPrice: 1 };
    else if (sort === "price-desc") sortOption = { salesPrice: -1 };
    else if (sort === "popularity") sortOption = { soldCount: -1 };

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);
    

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    // Render partials to HTML strings
    const productsHTML = await ejs.renderFile(
      path.join(__dirname, "../views/partials/user/productgrid.ejs"),
      { products }
    );

    const paginationHTML = await ejs.renderFile(
      path.join(__dirname, "../views/partials/user/pagination.ejs"),
      { currentPage, totalPages }
    );

    res.json({
      success: true,
      productsHTML,
      paginationHTML
    });

  } catch (err) {
    console.error("AJAX Shop Load Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { ajaxLoadProducts };