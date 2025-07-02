const express = require('express');
const app = express();
const path = require('path');
const passport = require("./config/passport");
const env = require('dotenv').config();
const session = require("express-session");
const db = require('./config/db');
const userRoute = require('./routes/userRoute');
const adminRoute = require('./routes/adminRoute');
const cookieParser = require("cookie-parser");
db();

app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use('/', userRoute);
app.use('/admin',adminRoute);

app.listen(process.env.PORT, () => {
    console.log("server running");
});

module.exports = app;
