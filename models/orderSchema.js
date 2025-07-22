const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid')

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true,
        index: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            default: 1
        },
        price: {
            type: Number,
            default: 0,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        discount: {
            type: Number,
            default: 0
        },
        finalAmount: {
            type: Number,
            required: true
        },
        cancelStatus: {
            type: String,
            enum: ['none', 'cancelled'],
            default: 'none'
        },
        cancelReason: {
            type: String,
            default: ''
        },
        returnRequested: {
            type: Boolean,
            default: false
        },
        returnStatus: {
            type: String,
            enum: ['none', 'requested', 'approved', 'rejected', 'returned'],
            default: 'none'
        },
        returnReason: {
            type: String,
            default: ''
        }
    }],
    address: {
        addressType: String,
        name: String,
        city: String,
        landMark: String,
        state: String,
        pincode: Number,
        phone: Number,
        altPhone: Number
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['failed', 'placed', 'pending', 'shipped', 'Out for delivery', 'delivered', 'cancelled', 'return requested', 'returned'],
        default: "failed"
    },
    createdAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponCode: {
        type: String,
        default: null
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponDiscount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    deliveryCharge: {
        type: Number,
        default: 50
    },
    razorpayOrderId: {
        type: String,
        default: null
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },
    razorpaySignature: {
        type: String,
        default: null
    },
    paymentMethod: {
        type: String, // 'razorpay' or 'cod'
        required: true
    },
    isPaid: {
        type: Boolean,
        default: false
    }
})
const Order = mongoose.model('Order', orderSchema);
module.exports = Order;