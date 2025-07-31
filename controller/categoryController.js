const Category = require('../models/categorySchema');
const Product = require('../models/productSchema');

function calculateSalesPrice(regularPrice, productOffer = 0, categoryOffer = 0) {
  const bestOffer = Math.max(productOffer, categoryOffer);
  return Math.floor(regularPrice - (regularPrice * bestOffer / 100));
}

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";

    const query = search
      ? { name: { $regex: new RegExp(search, "i") } }
      : {};

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/addCategory", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search, // send this to retain search value
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.redirect("/admin/pageError");
  }
};


const addCategory = async (req, res) => {
  try {
    let { name, description } = req.body;

    // Normalize input by removing spaces and lowercasing
    const normalize = str => str.replace(/\s+/g, '').toLowerCase();
    const normalizedInputName = normalize(name);

    // Fetch all categories and check manually
    const categories = await Category.find();

    const duplicate = categories.find(cat => normalize(cat.name) === normalizedInputName);

    if (duplicate) {
      return res.status(400).json({
        error: 'Category already exists',
        name: await Category.find()
      });
    }

    // Format for storing (optional: Title Case)
    const formattedName = name.trim().replace(/\s+/g, ' ')
      .toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

    const newCategory = new Category({
      name: formattedName,
      description
    });

    await newCategory.save();

    return res.json({ message: 'Category added successfully' });

  } catch (error) {
    console.error("Error adding category:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const addCategoryOffer = async (req, res) => {
  try {
    const percentage = parseInt(req.body.percentage);
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
      return res.status(400).json({ status: false, message: 'Invalid offer percentage' });
    }

    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: 'Category not found' });
    }

    // Save the offer on category
    await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: percentage } });

    // Recalculate salesPrice for all products in that category
    const products = await Product.find({ category: category._id });

    for (const product of products) {
      product.salesPrice = calculateSalesPrice(product.regularPrice, product.productOffer, percentage);
      await product.save();
    }

    res.json({ status: true });
  } catch (error) {
    console.error("Error in addCategoryOffer:", error);
    res.status(500).json({ status: false, message: 'Internal server error' });
  }
};


const removeCategoryOffer = async (req, res) => {
  try {
    const categoryId = req.body.categoryId;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: 'Category not found' });
    }

    await Category.updateOne({ _id: categoryId }, { $set: { categoryOffer: 0 } });

    const products = await Product.find({ category: categoryId });
    for (const product of products) {
      product.salesPrice = calculateSalesPrice(product.regularPrice, product.productOffer, 0);
      await product.save();
    }

    res.json({ status: true });
  } catch (error) {
    console.error("Error in removeCategoryOffer:", error);
    res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        res.redirect('/admin/addCategory');
    } catch (error) {
        console.error("Error listing category:", error);
        res.redirect('/admin/pageError');
    }
}
const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        res.redirect('/admin/addCategory');
    } catch (error) {
        console.error("Error unlisting category:", error);
        res.redirect('/admin/pageError');
    }
}
const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id;
        const category = await Category.findOne({ _id: id });
        res.render('admin/editCategory', { category: category });
    } catch (error) {
        console.error("Error fetching category for edit:", error);
        res.redirect('/admin/pageError');
    }
}
const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryName, categoryDescription } = req.body;

    // Normalization function (remove all spaces + lowercase)
    const normalize = str => str.replace(/\s+/g, '').toLowerCase();
    const normalizedInput = normalize(categoryName);

    // Get all other categories
    const allCategories = await Category.find({ _id: { $ne: id } });

    // Check for duplicates using normalized form
    const duplicate = allCategories.find(cat => normalize(cat.name) === normalizedInput);

    if (duplicate) {
      const category = await Category.findById(id);
      return res.render("admin/editCategory", {
        category,
        error: "Category name already exists"
      });
    }

    // Optional: Format saved name to "Title Case" or trimmed spacing
    const formattedName = categoryName.trim().replace(/\s+/g, ' ')
      .toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: formattedName,
        description: categoryDescription
      },
      { new: true }
    );

    if (updatedCategory) {
      res.redirect("/admin/addCategory");
    } else {
      const category = await Category.findById(id);
      return res.render("admin/editCategory", {
        category,
        error: "Category not found"
      });
    }

  } catch (error) {
    console.error("Error editing category:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


module.exports = {
    categoryInfo,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory
};