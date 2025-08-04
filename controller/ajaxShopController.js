const ejs = require('ejs');
const path = require('path');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const Brand = require('../models/brandSchema');

const ajaxLoadProducts = async (req, res) => {
  try {
    const {
      query: search,
      category: categoryId,
      brand: brandId,
      sort,
      page = 1,
      gt,
      lt,
    } = req.query;

    const currentPage = parseInt(page) || 1;
    const limit = 6;
    const skip = (currentPage - 1) * limit;

    // Get only active categories and brands
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({ isBlocked: false }).lean();

    const filter = {
      isBlocked: false,
      quantity: { $gt: 0 },
    };

    // Filter by category
    if (categoryId) {
      filter.category = categoryId;
    } else {
      filter.category = { $in: categories.map(c => c._id.toString()) };
    }

    // Filter by brand
    if (brandId) {
      const brand = await Brand.findById(brandId).lean();
      if (brand) {
        filter.brand = brand.brandName;
      }
    } else {
      filter.brand = { $in: brands.map(b => b.brandName) };
    }

    // Filter by search query
    if (search) {
      filter.productName = { $regex: search, $options: 'i' };
    }

    // Filter by price range
const gtNum = parseInt(gt);
const ltNum = parseInt(lt);

if (!isNaN(gtNum) && !isNaN(ltNum)) {
  filter.salesPrice = { $gte: gtNum, $lte: ltNum };
}

    // Sorting logic
    let sortOption = { createdOn: -1 };
    if (sort === 'price-asc') sortOption = { salesPrice: 1 };
    else if (sort === 'price-desc') sortOption = { salesPrice: -1 };
    else if (sort === 'newest') sortOption = { createdOn : -1};

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(totalProducts / limit), 1); // ensure at least 1 page

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    const productsHTML = await ejs.renderFile(
      path.join(__dirname, "../views/partials/user/productgrid.ejs"),
      { products }
    );

    const paginationHTML = await ejs.renderFile(
      path.join(__dirname, "../views/partials/user/pagination.ejs"),
  {
    currentPage,
    totalPages,
    query: search || '',
    sort: sort || '',
    category: categoryId || '',
    brand: brandId || '',
    gt: gt || '',
    lt: lt || ''
  }
);

    return res.json({
      success: true,
      productsHTML,
      paginationHTML
    });

  } catch (err) {
    console.error("AJAX Shop Load Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { ajaxLoadProducts };
