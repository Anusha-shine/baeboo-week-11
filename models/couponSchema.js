const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema({
    couponName:{
        type:String,
        required:true
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    expireOn:{
        type:Date,
        required:true
    },
    offerPrice:{
        type:Number,
        required:true
    },
    minimumPrice:{
        type:Number,
        required:true
    },
    isList:{
        type:Boolean,
        default:true
    },
    usedBy: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User'
     }]

});
const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;