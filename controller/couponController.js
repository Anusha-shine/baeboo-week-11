const Coupon = require("../models/couponSchema");
const mongoose = require("mongoose");

const loadCoupon = async (req, res) => {
  try {
    const findCoupons = await Coupon.find({});
    return res.render("admin/coupon", { coupons: findCoupons });
  } catch (error) {
    console.error("Error loading coupons:", error);
    return res.redirect("/pageNotFound");
  }
}

const createCoupon = async (req, res) => {
  try {
    const { couponName, startDate, endDate, offerPrice, minimumPrice } = req.body;

    // Normalize function
    const normalize = str => str.replace(/\s+/g, '').toLowerCase();
    const normalizedInput = normalize(couponName);

    // Check against all existing coupons
    const coupons = await Coupon.find();
    const duplicate = coupons.find(c => normalize(c.couponName) === normalizedInput);

    if (duplicate) {
      return res.status(400).render("admin/coupon", {
        errorMessage: "Coupon already exists",
        coupons
      });
    }

    // Format stored name (Title Case with single spacing)
    const formattedName = couponName.trim().replace(/\s+/g, ' ')
      .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    const newCoupon = new Coupon({
      couponName: formattedName,
      createdAt: new Date(startDate + "T00:00:00"),
      expireOn: new Date(endDate + "T00:00:00"),
      offerPrice: parseInt(offerPrice),
      minimumPrice: parseInt(minimumPrice)
    });

    await newCoupon.save();
    return res.redirect("/admin/coupon");

  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).send("Internal server error while creating coupon");
  }
};



const editCoupon = async (req, res) => {
  try {
    const id = req.query.id;
    const findCoupon = await Coupon.findOne({ _id: id });
    res.render("admin/edit-coupon", {
      findCoupon: findCoupon
    });
  } catch (error) {
    console.error("Error editing coupon:", error);
    res.redirect("/pageNotFound");
  }
}
const updateCoupon = async (req, res) => {
  try {
    const couponId = req.body.couponId;
    const oid = new mongoose.Types.ObjectId(couponId);
    const selectedCoupon = await Coupon.findOne({ _id: oid });

    if (selectedCoupon) {
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);

      const result = await Coupon.updateOne(
        { _id: oid },
        {
          $set: {
            name: req.body.couponName,
            createdAt: startDate,
            expireOn: endDate,
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice)
          }
        }
      );

      if (result.modifiedCount > 0) {
        res.send("Coupon updated successfully");
      } else {
        res.status(400).send("No changes made to coupon");
      }
    } else {
      res.status(404).send("Coupon not found");
    }
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).send("Internal server error");
  }
};
const deleteCoupon = async (req, res) => {
  try {
    const id = req.query.id;
    await Coupon.deleteOne({ _id: id });
    res.status(200).send({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).send({ success: false, message: "Failed to delete coupon" });
  }
}





module.exports = { loadCoupon, createCoupon, editCoupon, updateCoupon, deleteCoupon }