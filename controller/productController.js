const Product = require("../models/productSchema");
const Category = require("../models/categorySchema");
const Brand = require("../models/brandSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function calculateSalesPrice(regularPrice, productOffer = 0, categoryOffer = 0) {
    const bestOffer = Math.max(productOffer, categoryOffer);
    return Math.floor(regularPrice - (regularPrice * bestOffer / 100));
}


const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        res.render("admin/addProducts", {
            cat: category,
            brand: brand
        });
    }catch(error){
        console.log(error)
        res.redirect("/admin/pageError");
    }
}
const addProducts = async (req, res) => {
    try {
        const products = req.body;
const name = products.productName.trim();
const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');  // escape special chars
const regex = new RegExp(`^${escaped}$`, 'i');

const productExists = await Product.findOne({ productName: regex });

        if(productExists) {
            return res.status(400).json({message: "Product already exists. Please try another name"});
        }

        if (!productExists) {
            const images = [];

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const file = req.files[i];
                    const originalImagePath = file.path;
                    const resizedImageName = file.filename;
                    const resizedImagePath = path.join("public", "uploads", "product-images", resizedImageName);

                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push(resizedImageName);
                }
            }

            const categoryId = await Category.findOne({ name: products.category });

            if (!categoryId) {
                return res.status(400).json({ message: "Category not found" });
            }

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: products.brand,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salesPrice: products.salesPrice,
                createdOn: new Date(),
                quantity: products.quantity,
                size: products.size,
                color: products.color,
                productImage: images,
                status: "Available"
            });

            await newProduct.save();
            return res.json({ success: true, redirect: "/admin/addProducts" });
        } else {
            return res.status(400).json({ message: "Product already exists. Please try another name" });
        }
    } catch (error) {
        console.error("Error saving product:", error);
        return res.json({success: false,redirect:"/admin/pageError"});
    }
};
const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;
        const productData = await Product.find({
            $or: [
                {productName : {$regex: new RegExp(".*"+search+".*","i")}},
                {brand : {$regex:new RegExp(".*"+search+".*","i")}}, 
            ],
        }).limit(limit*1).skip((page-1)*limit).populate("category").exec();

        const count = await Product.find({
            $or: [
                {productName : {$regex:new RegExp(".*"+search+".*","i")}},
                {brand: {$regex:new RegExp(".*"+search+".*","i")}}
            ],
        }).countDocuments();

        const category = await Category.find({isListed: true});
        const brand = await Brand.find({isBlocked:false});

        if(category && brand) {
            res.render("admin/products", {
                data: productData,
                currentPage : page,
                totalPages : Math.ceil(count/limit),
                cat:category,
                brand:brand,
            })
        } else {
            res.render("page-404");
        }
    }catch(error) {
        console.error("Error fetching products:", error);
        res.redirect("/admin/pageError");
    }
}
const addProductOffer = async (req, res) => {
    try {
        const { productId, percentage } = req.body;
        const parsedPercentage = parseInt(percentage);
        
        if (isNaN(parsedPercentage) || parsedPercentage <= 0 || parsedPercentage > 100) {
            return res.status(400).json({ status: false, message: "Invalid offer percentage" });
        }

        const findProduct = await Product.findById(productId);
        if (!findProduct) {
            return res.status(404).json({ status: false, message: "Product not found" });
        }

        const findCategory = await Category.findById(findProduct.category);
        const categoryOffer = findCategory?.categoryOffer || 0;

        findProduct.productOffer = parsedPercentage;
        findProduct.salesPrice = calculateSalesPrice(findProduct.regularPrice, parsedPercentage, categoryOffer);

        await findProduct.save();

        res.json({ status: true });
    } catch (error) {
        console.error("addProductOffer error:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;
        const findProduct = await Product.findById(productId);
        if (!findProduct) {
            return res.status(404).json({ status: false, message: 'Product not found' });
        }

        const category = await Category.findById(findProduct.category);
        const categoryOffer = category?.categoryOffer || 0;

        // Remove product offer and recalculate sales price
        findProduct.productOffer = 0;
        findProduct.salesPrice = calculateSalesPrice(findProduct.regularPrice, 0, categoryOffer);

        await findProduct.save();

        res.json({ status: true });
    } catch (error) {
        console.error('removeProductOffer error:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
};

const blockProduct = async (req, res) => {
    try{
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/products");
    }catch(error) {
        console.log(error);
        res.redirect("/admin/pageError");
    }
}
const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect("/admin/products");
    }catch(error) {
        console.log(error);
        res.redirect("/admin/pageError");
    }
}
const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        const category = await Category.find({});
        const brand = await Brand.find({});
        res.render("admin/editProduct", {
            product: product,
            cat: category,
            brand: brand
        });
    }catch(error){
        console.log(error);
        res.redirect("/admin/pageError");
    }
}
const editProduct = async (req, res) => {
    try{
        const id = req.params.id;
        const product = await Product.findOne({_id:id});
        const data = req.body;
        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: {$ne: id}
        })
        if(existingProduct){
            return res.status(400).json({message:"Product already exists"});
        }
        const images = [];
        if(req.files && req.files.length > 0) {
            for(let i= 0; i <req.files.length; i++){
                images.push(req.files[i].filename);
            }
        }
        const updateFields ={
            productName : data.productName,
            description : data.description,
            brand : data.brand,
            category : product.category,
            regularPrice: data.regularPrice,
            salesPrice: data.salesPrice,
            quantity: data.quantity,
            size: data.size,
            color: data.color
        }
        if(req.files.length > 0){
            updateFields.$push = {productImage : {$each: images}};
        }
        await Product.findByIdAndUpdate(id,updateFields,{new:true});
        res.redirect("/admin/products");
    }catch(error){
        console.error(error);
        res.redirect("/admin/pageError");

    }
}
const deleteSingleImage = async (req, res) => {
    try {
        const {imageNameToServer, productIdToServer} = req.body;
        await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
        const imagePath = path.join("public","uploads","re-image",imageNameToServer);
        if (fs.existsSync(imagePath)) {
            await fs.unlinkSync(imagePath);
            console.log(`image ${imageNameToServer} delleted successfully`);
        }else {
            console.log(`image ${imageNameToServer} not found`);
        }
        res.send({status:true});

}catch(error){
    console.log(error);
    res.redirect("/admin/pageError");
}
}
module.exports = {getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage};

