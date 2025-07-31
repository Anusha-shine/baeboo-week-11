const User = require("../models/userSchema");
const mongoose = require("mongoose");

const customerInfo = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 3;

    const filter = {
      isAdmin: false,
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ]
    };

    const userData = await User.find(filter)
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.countDocuments(filter);

    res.render("admin/customers", {
      data: userData,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      search
    });
  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(500).send("Internal Server Error");
  }
};

const customerBlocked = async (req, res) => {
  try {
    const id = req.body.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.json({ success: true, message: "Customer blocked successfully" });
  } catch (error) {
    console.error("Block error:", error);
    res.status(500).json({ success: false, message: "Failed to block customer" });
  }
};

const customerUnBlocked = async (req, res) => {
  try {
    const id = req.body.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.json({ success: true, message: "Customer unblocked successfully" });
  } catch (error) {
    console.error("Unblock error:", error);
    res.status(500).json({ success: false, message: "Failed to unblock customer" });
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerUnBlocked
};
