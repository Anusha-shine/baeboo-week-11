const Brand = require("../models/brandSchema");

const getBrandPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const brandData = await Brand.find({}).sort({createdAt:-1}).skip(skip).limit(limit);
        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands / limit);
        const currentBrand = brandData.reverse();
        res.render("admin/brands", {
            data:currentBrand,
            currentPage: page,
            totalPages: totalPages,
            totalBrands: totalBrands,
            error: req.query.error
        })
    }catch(error){
        console.error("Error fetching brands:", error);
        res.redirect("/admin/pageError");
    }
}
const addBrand = async (req, res) => {
  try {
    const brand = req.body.name.trim();

    const existingBrand = await Brand.findOne({
      brandName: { $regex: `^${brand}$`, $options: "i" },
    });

    if (existingBrand) {
      return res.redirect("/admin/brands?error=Brand already exists");
    }

    if (!req.file) {
      return res.redirect("/admin/brands?error=Please upload a valid image");
    }

    const image = req.file.filename;

    const newBrand = new Brand({
      brandName: brand,
      brandImage: image,
    });

    await newBrand.save();
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Add Brand Error:", error);
    res.redirect("/admin/pageError");
  }
};

const blockBrand = async (req, res) => {
    try{
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/brands");
    }catch(error){
        console.error("Error blocking brand:", error);
        res.redirect("/admin/pageError");
    }
}
const unBlockBrand = async (req, res) => {
    try{
        const id = req.query.id;
        await Brand.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/brands");

    }catch(error){
        console.error("Error unblocking brand:", error);
        res.redirect("/admin/pageError");
    }
}
const deleteBrand = async (req,res) => {
    try {
        const {id} = req.query;
        if(!id) {
            return res.status(400).redirect("/admin/pageError");
        }
        await Brand.deleteOne({_id:id});
        res.redirect("/admin/brands");
    }catch(error){
        console.error("Error deleting brands:", error);
        res.status(500).redirect("/admin/pageError");

    }
}
module.exports = {getBrandPage,addBrand,blockBrand,unBlockBrand,deleteBrand};