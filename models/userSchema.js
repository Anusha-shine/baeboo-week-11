const mongoose = require('mongoose');
const { Schema } = mongoose;
const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    profileImage: {
        type: String,
        default: '/images/default-user.png'
    },
    phone: {
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null
    },
    googleId: {
        type: String,
        unique: true
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: 'Cart'
    }],
    wallet: {
        type: Number,
        default: 0
    },
    wishlist: [{
        type: Schema.Types.ObjectId,
        ref: 'Wishlist'
    }],
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: 'Order'
    }],
    createdAt: {
        type: Date,
        default: Date.now()
    },
    referralCode: {
        type: String,
        unique: true
    },
    referredBy: {
        type: String, // Stores the referral code used (optional at signup)
    },

    redeemed: {
        type: Boolean,
        default: false, // Indicates if this user has redeemed a referral benefit
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User' // Users who used this user's referral code
    }],
    referralWalletBalance: 
    { type: Number, 
        default: 0
 },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: 'Category'
        },
        brand: {
            type: String
        },
        searchOn: {
            type: Date,
            default: Date.now()
        }
    }],
});


const User = mongoose.model('User', userSchema);
module.exports = User;