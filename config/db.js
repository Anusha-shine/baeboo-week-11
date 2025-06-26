const mongoose = require('mongoose');
const env = require('dotenv').config();


const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connected successfully");

    } catch(err){
        console.error("MongoDB connection failed", err.message);
        process.exit(1); // Exit process with failure


    }
}

module.exports = connectDB;