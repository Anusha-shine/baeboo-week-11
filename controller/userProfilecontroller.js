const User = require("../models/userSchema");
const Address = require("../models/addressSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");
const Order = require("../models/orderSchema");
const mongoose = require("mongoose");
const Wallet = require("../models/walletSchema");
const ReferralCode = require("../models/referralCodeSchema");

function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i=0; i<6; i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

const sendVerificationEmail = async (email,otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service:"gmail",
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })
        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Your otp for password reset",
            text: `Your OTP is ${otp}`,
            html:`<b><h4>Your OTP: ${otp} </h4><br></b>`
        }
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:",info.messageId);
        return true;
    }catch(error){
        console.error("Error sending email",error);
        return false;

    }
}

const securePassword = async (password) => {
    try{
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    }catch(error){

    }
}


const getForgotPassPage = async (req,res) => {
    try {
         res.render("user/forgot-password");
    }catch(error){
        res.redirect("/pageNotFound");
    }
}

const forgotPassPage = async (req,res) => {
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("user/forgotPass-otp");
                console.log("OTP:",otp);
            } else {
                res.json({success:false,message:"Failed to send OTP.Please try again"});
            }
        }else {
            res.render("user/forgot-password",{
                message:"User with this email doesn't exist"
            })
        }
    }catch(error){
        res.redirect("/pageNotFound");
    }
}
const verifyForgotPassOtp = async (req, res) => {
  try {
    const enteredOtp = req.body.otp;

    if (enteredOtp === req.session.userOtp) {
      res.json({success:true,redirectUrl:"/reset-password"});
    } else {
      res.json({success:false,message:"OTP not matching"});
    }
  } catch (error) {
    res.status(500).json({success:false,message:"An error occured.Please try again"})
  }
};

const resendForgotPassOtp = async (req, res) => {
  try {
    const email = req.session.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Session expired. Please try again." });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      req.session.userOtp = otp;
      console.log("Resent OTP:", otp);
      return res.json({ success: true });
    } else {
      return res.json({ success: false, message: "Failed to send OTP. Try again." });
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};


const getResetPassPage = async(req,res) => {
    try {
        res.render("user/reset-password");
    }catch(error){
        res.redirect("/pageNotFound");
    }
}
const postNewPassword = async (req,res)=> {
    try{
        const {newPass1, newPass2} = req.body;
        const email = req.session.email;
        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            )
            res.redirect("/login");
        }else {
            res.render("reset-password",{message:"Passwords do not match"});
        }
    }catch(error){
        res.redirect("/pageNotFound");

    }
}
const userProfile = async (req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId : userId});
        const walletData = await Wallet.findOne({userId : userId});
        const referralData = await ReferralCode.findOne({user: userId});

        let referralEarnings = 0;
         if (walletData && walletData.transactions.length > 0) {
      referralEarnings = walletData.transactions
        .filter(txn => txn.description && txn.description.toLowerCase().includes('referral'))
        .reduce((sum, txn) => sum + (txn.amount || 0), 0);
    }
        res.render("user/profile",{
            user : userData,
            userAddress : addressData,
            wallet : walletData || {balance: 0},
            req: req,
            userReferral: referralData || null,
            rewardAmount: referralEarnings.toFixed(2)
        })
    }catch(error){
        console.error("Error for retrieve profile data",error);
        res.redirect("/user/pageNotFound");
    }
}
const changeEmail = async (req,res) => {
    try {
        res.render("user/change-email")
    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const changeEmailValid = async (req,res)=> {
    try{
        const {email} = req.body;
        const userExists = await User.findOne({email});
        if(userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("user/change-email-otp");
                console.log("Email sent:",email);
                console.log("OTP:",otp);

            }else {
                res.json("email-error");
            }
        }else {
            res.render("user/change-email",{
                message:"User with this email doesnot exist"
            });
        }

    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const verifyEmailOtp = async(req,res) => {
    try{
       const enteredOtp = req.body.otp;
       if(enteredOtp === req.session.userOtp){
        req.session.userData = req.body.userData;
        res.render("user/new-email",{
            userData : req.session.userData
        })
       }else {
        res.render("user/change-email-otp",{
            message: "OTP not matching",
            userData : req.session.userData
        })
       }
    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const updateEmail = async (req,res) => {
    try{
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect("/userProfile");
    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const changePassword = async (req,res) => {
    try{
        res.render("user/change-password");
    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const changePasswordValid = async(req,res) => {
    try{
        const {email} = req.body;
        const userExists = await User.findOne({email});
        if(userExists){
          const otp = generateOtp();
          const emailSent = await sendVerificationEmail(email,otp);
          if(emailSent){
            req.session.userOtp = otp;
            req.session.userData = req.body;
            req.session.email =email;
            res.render("user/change-password-otp");
            console.log("OTP:",otp);
          }else {
            res.json({
                success: false,
                message : "Failed to send OTP.Please try again"
            });
          }
        }else{
            res.render("user/change-password",{
                message:"This email does not exist"
            });
        }
    }catch(error){
      console.log("Error in change password validation",error);
      res.redirect("/user/pageNotFound");
    }
}
const verifyChangePassOtp = async (req,res) => {
    try{
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            res.json({success:true,redirectUrl:"/reset-password"});
        }else{
            res.json({success:false,message:"OTP not matching"});
        }
    }catch(error){
        res.status(500).json({success:false,message:"An error occured.Please try again later."})
    }
}
const addAddress = async(req,res) => {
    try{
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        res.render("user/add-address",{
            user: userData
        });
    }catch(error){
        res.redirect("/user/pageNotFound");
    }
}
const postAddAddress = async(req,res) => {
    try{
        const userId = req.session.user;
        const userData = await User.findOne({_id : userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;
        const userAddress = await Address.findOne({userId : userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId : userData._id,
                address : [{addressType,name,city,landMark,state,pincode,phone,altPhone}]
            });
            await newAddress.save();
        }else {
        userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone});
        await userAddress.save();
        }
        res.redirect("/userProfile");
    }catch(error){
        console.error("Error adding address",error);
        res.redirect("/user/pageNotFound");
    }
}
const editAddress = async (req,res) => {
    try{
       const addressId = req.query.id;
       const user = req.session.user;
       const currAddress = await Address.findOne({
        "address._id": addressId
       });
       if(!currAddress){
        return res.redirect("/user/pageNotFound");
       }
       const addressData = currAddress.address.find((item)=> {
        return item._id.toString() === addressId.toString();
       })
       if(!addressData){
        return res.redirect("/user/pageNotFound");
       }
       res.render("user/edit-address",{address : addressData, user : user});

    }catch(error){
        console.error("Error in edit address");
        res.redirect("/user/pageNotFound");
    }
}
const postEditAddress = async (req,res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            res.redirect("/user/pageNotFound");
        }
        await Address.updateOne(
        {"address._id":addressId},
        {$set: {
            "address.$" : {
                _id: addressId,
                addressType: data.addressType,
                name: data.name,
                city: data.city,
                landMark: data.landMark,
                state: data.state,
                pincode: data.pincode,
                phone: data.phone,
                altPhone: data.altPhone
            }
        }}
        )
        res.redirect("/userProfile");
    }catch(error){
        console.error("Error in edit address",error);
        res.redirect("/user/pageNotFound");
    }
}
const deleteAddress = async (req,res) => {
    try{
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            return res.statu(404).send("Address not found");
        }
        await Address.updateOne({
            "address._id": addressId
        },
        {
         $pull: {
            address : {
                _id : addressId
            }
         }
        })
        res.redirect("/userProfile");
    }catch(error){
        console.error("Error in delete address",error);
        res.redirect("/user/pageNotFound");
    }
}
const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).send("Unauthorized: User session not found");
    }

    const imagePath = '/uploads/re-image/' + req.file.filename;

    await User.findByIdAndUpdate(userId, { profileImage: imagePath });

    const updatedUser = await User.findById(userId);
    req.session.user = updatedUser;

    res.redirect('/userProfile');
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).send('Image upload failed');
  }
};

const loadProfile = async (req, res) => {
  try {
    const userId = req.session.user;

    // Fetch user data
    const user = await User.findById(userId);

    // Fetch user address
    const userAddress = await Address.findOne({ userId });

    res.render('user/profile', {
      user,
      userAddress
    });

  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).send('Internal Server Error');
  }
};

const loadEditProfile = async (req,res)=> {
    try{
        const userId = req.session.user;
        const user = await User.findById(userId);
        if(!user) return res.redirect("/user/login");

        res.render("user/edit-profile",{user});
    }catch(error){
        console.error("Error in getting edit profile",error);
        res.redirect("/user/pageNotFound");
    }
}
const editProfile = async (req,res) => {
    try{
        const userId = req.session.user;
        if(!userId) return res.redirect("/user/login");

        const {name,phone} = req.body;
        await User.findByIdAndUpdate(userId,{
            name,
            phone
        });
        res.redirect("/userProfile");
    }catch(error){
        console.error("Error in POST edit profile",error);
        res.redirect("/userProfile");
    }
}
module.exports = {getForgotPassPage,
    forgotPassPage, verifyForgotPassOtp,resendForgotPassOtp,getResetPassPage,
    postNewPassword,userProfile,changeEmail,changeEmailValid,verifyEmailOtp,
    updateEmail,changePassword,changePasswordValid,verifyChangePassOtp,
    addAddress,postAddAddress,editAddress,postEditAddress,
    deleteAddress,uploadProfileImage,loadProfile,loadEditProfile,editProfile};

